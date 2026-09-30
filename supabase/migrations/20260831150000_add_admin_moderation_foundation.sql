-- Milestone 9: private administrator membership, moderation audit history, and
-- service-role-only read/transition boundaries for the operations dashboard.
--
-- Browser clients do not receive table privileges. The admin Edge Functions
-- authenticate a Supabase user, check active membership, and then invoke these
-- deliberately narrow RPCs with their server-side service-role client.

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pothole_status_events (
  id uuid primary key default gen_random_uuid(),
  -- Preserve audit evidence even if a privileged future operation attempts to
  -- remove a canonical pothole; history must not disappear by cascade.
  pothole_id uuid not null references public.potholes(id) on delete restrict,
  from_status public.pothole_status not null,
  to_status public.pothole_status not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  check (from_status <> to_status),
  check (
    reason is null
    or (btrim(reason) <> '' and char_length(reason) <= 500)
  )
);

create index pothole_status_events_pothole_created_at_idx
on public.pothole_status_events (pothole_id, created_at desc, id desc);

-- Default deny continues to apply even for an authenticated Supabase user.
-- No policies are created: the browser may never inspect membership, audit
-- history, reports, or photo paths through the Data API.
alter table public.admin_users enable row level security;
alter table public.pothole_status_events enable row level security;

revoke all on table public.admin_users from public, anon, authenticated, service_role;
revoke all on table public.pothole_status_events from public, anon, authenticated, service_role;

-- The Edge Function membership check is the only direct service-role read.
-- All other dashboard database work is contained in SECURITY DEFINER RPCs.
grant select on table public.admin_users to service_role;

-- Returns a compact, non-sensitive moderation-queue DTO. The tuple cursor is
-- intentionally based on created_at and the public identifier, never a UUID,
-- so it can be returned to the browser without exposing canonical IDs.
create or replace function public.admin_list_potholes(
  p_statuses public.pothole_status[] default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_public_id text default null
)
returns table (
  public_id text,
  status public.pothole_status,
  formatted_address text,
  latitude double precision,
  longitude double precision,
  report_count integer,
  latest_severity public.report_severity,
  created_at timestamptz,
  latest_report_created_at timestamptz,
  result_limit_reached boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_limit integer;
begin
  if p_limit is null then
    v_effective_limit := 25;
  elsif p_limit < 1 or p_limit > 50 then
    raise exception 'Result limit is invalid' using errcode = '22023';
  else
    v_effective_limit := p_limit;
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_public_id is null) then
    raise exception 'Pagination cursor is invalid' using errcode = '22023';
  end if;

  if p_cursor_public_id is not null
    and p_cursor_public_id !~ '^MTL-[0-9]{6}$' then
    raise exception 'Pagination cursor is invalid' using errcode = '22023';
  end if;

  if p_statuses is not null and cardinality(p_statuses) = 0 then
    raise exception 'Status filter is invalid' using errcode = '22023';
  end if;

  if p_statuses is not null and exists (
    select 1
    from unnest(p_statuses) as requested_status(v_status)
    where requested_status.v_status is null
  ) then
    raise exception 'Status filter is invalid' using errcode = '22023';
  end if;

  return query
  with queue_page as materialized (
    select
      p.id as v_pothole_id,
      p.public_id as v_public_id,
      p.status as v_status,
      p.formatted_address as v_formatted_address,
      p.canonical_location as v_canonical_location,
      p.report_count as v_report_count,
      p.created_at as v_created_at
    from public.potholes as p
    where (p_statuses is null or p.status = any(p_statuses))
      and (
        p_cursor_created_at is null
        or (p.created_at, p.public_id) < (p_cursor_created_at, p_cursor_public_id)
      )
    order by p.created_at desc, p.public_id desc
    limit v_effective_limit + 1
  ), annotated_queue as (
    select
      q.v_pothole_id,
      q.v_public_id,
      q.v_status,
      q.v_formatted_address,
      extensions.st_y(q.v_canonical_location::extensions.geometry) as v_latitude,
      extensions.st_x(q.v_canonical_location::extensions.geometry) as v_longitude,
      q.v_report_count,
      latest_report.v_latest_severity,
      q.v_created_at,
      latest_report.v_latest_report_created_at,
      count(*) over () > v_effective_limit as v_result_limit_reached,
      row_number() over (
        order by q.v_created_at desc, q.v_public_id desc
      ) as v_row_number
    from queue_page as q
    left join lateral (
      select
        r.severity as v_latest_severity,
        r.created_at as v_latest_report_created_at
      from public.reports as r
      where r.pothole_id = q.v_pothole_id
      order by r.created_at desc, r.id desc
      limit 1
    ) as latest_report on true
  )
  select
    aq.v_public_id,
    aq.v_status,
    aq.v_formatted_address,
    aq.v_latitude,
    aq.v_longitude,
    aq.v_report_count,
    aq.v_latest_severity,
    aq.v_created_at,
    aq.v_latest_report_created_at,
    aq.v_result_limit_reached
  from annotated_queue as aq
  where aq.v_row_number <= v_effective_limit
  order by aq.v_created_at desc, aq.v_public_id desc;
end;
$$;

-- This JSON document is intentionally server-only. It has enough report and
-- photo metadata for moderation, including private Storage paths solely so the
-- Edge Function can mint short-lived signed URLs. The Edge Function must strip
-- storage_path, reporter_user_id, submission_id, and all Auth identifiers
-- before returning its DTO to a browser.
create or replace function public.admin_get_pothole(
  p_public_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_detail jsonb;
begin
  if p_public_id is null or p_public_id !~ '^MTL-[0-9]{6}$' then
    raise exception 'Pothole identifier is invalid' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'pothole', jsonb_build_object(
      'public_id', p.public_id,
      'status', p.status,
      'formatted_address', p.formatted_address,
      'street_number', p.street_number,
      'street', p.street,
      'city', p.city,
      'district', p.district,
      'region', p.region,
      'postal_code', p.postal_code,
      'country', p.country,
      'latitude', extensions.st_y(p.canonical_location::extensions.geometry),
      'longitude', extensions.st_x(p.canonical_location::extensions.geometry),
      'report_count', p.report_count,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'repaired_at', p.repaired_at
    ),
    'reports', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'severity', r.severity,
            'note', r.note,
            'latitude', extensions.st_y(r.reported_location::extensions.geometry),
            'longitude', extensions.st_x(r.reported_location::extensions.geometry),
            'accuracy_meters', r.accuracy_meters,
            'formatted_address', r.formatted_address,
            'street_number', r.street_number,
            'street', r.street,
            'city', r.city,
            'district', r.district,
            'region', r.region,
            'postal_code', r.postal_code,
            'country', r.country,
            'matched_existing_pothole', r.matched_existing_pothole,
            'created_at', r.created_at,
            'photos', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'storage_path', rp.storage_path,
                    'mime_type', rp.mime_type,
                    'file_size_bytes', rp.file_size_bytes,
                    'created_at', rp.created_at
                  )
                  order by rp.created_at asc, rp.id asc
                )
                from public.report_photos as rp
                where rp.report_id = r.id
              ),
              '[]'::jsonb
            )
          )
          order by r.created_at desc, r.id desc
        )
        from public.reports as r
        where r.pothole_id = p.id
      ),
      '[]'::jsonb
    ),
    'status_events', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'from_status', pse.from_status,
            'to_status', pse.to_status,
            'reason', pse.reason,
            'created_at', pse.created_at
          )
          order by pse.created_at desc, pse.id desc
        )
        from public.pothole_status_events as pse
        where pse.pothole_id = p.id
      ),
      '[]'::jsonb
    )
  )
  into v_detail
  from public.potholes as p
  where p.public_id = p_public_id;

  return v_detail;
end;
$$;

-- Applies the deliberately small v1 moderation workflow under a row lock. A
-- second action that waits on the same pothole sees the newly committed status
-- and returns a safe domain outcome instead of overwriting it.
create or replace function public.admin_transition_pothole_status(
  p_public_id text,
  p_actor_user_id uuid,
  p_target_status public.pothole_status,
  p_reason text default null
)
returns table (
  outcome text,
  public_id text,
  from_status public.pothole_status,
  to_status public.pothole_status,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pothole_id uuid;
  v_public_id text;
  v_from_status public.pothole_status;
  v_reason text;
  v_updated_at timestamptz;
begin
  if p_actor_user_id is null
    or p_public_id is null
    or p_public_id !~ '^MTL-[0-9]{6}$'
    or p_target_status is null then
    return query
    select
      'INVALID_INPUT'::text,
      null::text,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  if not exists (
    select 1
    from public.admin_users as au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    return query
    select
      'ACTOR_NOT_AUTHORIZED'::text,
      null::text,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  if p_target_status not in (
    'UNDER_REVIEW'::public.pothole_status,
    'VERIFIED'::public.pothole_status,
    'REJECTED'::public.pothole_status
  ) then
    return query
    select
      'INVALID_INPUT'::text,
      null::text,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  if p_reason is not null and char_length(btrim(p_reason)) > 500 then
    return query
    select
      'INVALID_INPUT'::text,
      null::text,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  v_reason := nullif(btrim(p_reason), '');

  if p_target_status = 'REJECTED'::public.pothole_status
    and v_reason is null then
    return query
    select
      'INVALID_INPUT'::text,
      null::text,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  select
    p.id,
    p.public_id,
    p.status
  into
    v_pothole_id,
    v_public_id,
    v_from_status
  from public.potholes as p
  where p.public_id = p_public_id
  for update;

  if not found then
    return query
    select
      'NOT_FOUND'::text,
      p_public_id,
      null::public.pothole_status,
      null::public.pothole_status,
      null::timestamptz;
    return;
  end if;

  if not (
    (v_from_status = 'REPORTED'::public.pothole_status
      and p_target_status = 'UNDER_REVIEW'::public.pothole_status)
    or (v_from_status = 'UNDER_REVIEW'::public.pothole_status
      and p_target_status in (
        'VERIFIED'::public.pothole_status,
        'REJECTED'::public.pothole_status
      ))
  ) then
    return query
    select
      'INVALID_TRANSITION'::text,
      v_public_id,
      v_from_status,
      p_target_status,
      null::timestamptz;
    return;
  end if;

  update public.potholes as p
  set status = p_target_status
  where p.id = v_pothole_id
  returning p.updated_at into v_updated_at;

  insert into public.pothole_status_events as pse (
    pothole_id,
    from_status,
    to_status,
    actor_user_id,
    reason
  )
  values (
    v_pothole_id,
    v_from_status,
    p_target_status,
    p_actor_user_id,
    v_reason
  );

  return query
  select
    'UPDATED'::text,
    v_public_id,
    v_from_status,
    p_target_status,
    v_updated_at;
end;
$$;

revoke all on function public.admin_list_potholes(
  public.pothole_status[],
  integer,
  timestamptz,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_list_potholes(
  public.pothole_status[],
  integer,
  timestamptz,
  text
) to service_role;

revoke all on function public.admin_get_pothole(text)
from public, anon, authenticated, service_role;

grant execute on function public.admin_get_pothole(text)
to service_role;

revoke all on function public.admin_transition_pothole_status(
  text,
  uuid,
  public.pothole_status,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_transition_pothole_status(
  text,
  uuid,
  public.pothole_status,
  text
) to service_role;

comment on table public.admin_users is
  'Private active administrator membership. Managed by a separately approved bootstrap process; no browser table access.';

comment on table public.pothole_status_events is
  'Append-only administrator workflow audit rows written only by admin_transition_pothole_status.';

comment on function public.admin_list_potholes(
  public.pothole_status[],
  integer,
  timestamptz,
  text
) is
  'Service-role-only compact moderation queue DTO, paginated by created_at and public_id.';

comment on function public.admin_get_pothole(text) is
  'Service-role-only moderation detail document. Its raw Storage paths are for server-side signed URL creation only.';

comment on function public.admin_transition_pothole_status(
  text,
  uuid,
  public.pothole_status,
  text
) is
  'Service-role-only locked admin transition: REPORTED to UNDER_REVIEW, or UNDER_REVIEW to VERIFIED or REJECTED.';
