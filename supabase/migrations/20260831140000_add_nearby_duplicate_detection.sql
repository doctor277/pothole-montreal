-- Milestone 8: citizen-confirmed nearby duplicate detection.
--
-- This migration intentionally leaves finalize_citizen_report unchanged so the
-- currently deployed Milestone 6B Edge Function remains usable until the
-- versioned finalizer and its Edge Function are deployed together.

alter table public.reports
  add column if not exists matched_existing_pothole boolean not null default false;

comment on column public.reports.matched_existing_pothole is
  'True when this citizen-selected report was atomically attached to an existing canonical pothole.';

-- Candidate search is deliberately limited to non-terminal workflow states.
-- REPAIRED, REJECTED, and DUPLICATE are excluded: a new road defect may later
-- exist at the same location, and terminal workflow records are not suitable
-- citizen duplicate suggestions.
create or replace function public.find_nearby_public_potholes(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters double precision default 25,
  p_limit integer default 5
)
returns table (
  public_id text,
  latitude double precision,
  longitude double precision,
  status public.pothole_status,
  formatted_address text,
  report_count integer,
  latest_severity public.report_severity,
  created_at timestamptz,
  distance_meters double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_limit integer;
  v_requested_location extensions.geography;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then
    raise exception 'Latitude is invalid' using errcode = '22023';
  end if;

  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Longitude is invalid' using errcode = '22023';
  end if;

  if p_radius_meters is null or p_radius_meters <= 0 or p_radius_meters > 50 then
    raise exception 'Nearby search radius is invalid' using errcode = '22023';
  end if;

  if p_limit is not null and p_limit < 1 then
    raise exception 'Nearby result limit is invalid' using errcode = '22023';
  end if;

  v_effective_limit := least(coalesce(p_limit, 5), 5);
  v_requested_location := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  return query
  with candidate_potholes as materialized (
    select
      p.id as v_pothole_id,
      p.public_id as v_public_id,
      p.canonical_location as v_canonical_location,
      p.status as v_status,
      p.formatted_address as v_formatted_address,
      p.report_count as v_report_count,
      p.created_at as v_created_at,
      extensions.st_distance(p.canonical_location, v_requested_location) as v_distance_meters
    from public.potholes as p
    where p.status in (
      'REPORTED'::public.pothole_status,
      'UNDER_REVIEW'::public.pothole_status,
      'VERIFIED'::public.pothole_status,
      'ASSIGNED'::public.pothole_status,
      'ACCEPTED'::public.pothole_status,
      'IN_PROGRESS'::public.pothole_status
    )
      and extensions.st_dwithin(
        p.canonical_location,
        v_requested_location,
        p_radius_meters
      )
    order by
      extensions.st_distance(p.canonical_location, v_requested_location) asc,
      p.id asc
    limit v_effective_limit
  )
  select
    c.v_public_id,
    extensions.st_y(c.v_canonical_location::extensions.geometry),
    extensions.st_x(c.v_canonical_location::extensions.geometry),
    c.v_status,
    c.v_formatted_address,
    c.v_report_count,
    latest_report.v_latest_severity,
    c.v_created_at,
    c.v_distance_meters
  from candidate_potholes as c
  left join lateral (
    select r.severity as v_latest_severity
    from public.reports as r
    where r.pothole_id = c.v_pothole_id
    order by r.created_at desc, r.id desc
    limit 1
  ) as latest_report on true
  order by c.v_distance_meters asc, c.v_pothole_id asc;
end;
$$;

revoke all on function public.find_nearby_public_potholes(
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.find_nearby_public_potholes(
  double precision,
  double precision,
  double precision,
  integer
) to service_role;

comment on function public.find_nearby_public_potholes(
  double precision,
  double precision,
  double precision,
  integer
) is
  'Service-role-only active-pothole candidate DTO within a 1-50 meter PostGIS geography radius; a citizen decides whether any candidate is the same pothole.';

-- The v2 finalizer supports an optional citizen-selected public identifier.
-- It does not trust the earlier nearby result: it independently locks and
-- revalidates the selected target at a fixed server-side 25 meter distance.
create or replace function public.finalize_citizen_report_v2(
  p_submission_id uuid,
  p_reporter_user_id uuid,
  p_storage_path text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_formatted_address text,
  p_street_number text,
  p_street text,
  p_city text,
  p_district text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_severity public.report_severity,
  p_note text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_existing_pothole_public_id text
)
returns table (
  outcome text,
  pothole_id uuid,
  report_id uuid,
  public_id text,
  status public.pothole_status,
  matched_existing boolean,
  report_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.report_upload_intents%rowtype;
  v_pothole_id uuid;
  v_report_id uuid;
  v_public_id text;
  v_status public.pothole_status;
  v_report_count integer;
  v_matched_existing boolean;
  v_existing_reporter_user_id uuid;
  v_reported_location extensions.geography;
  v_max_existing_pothole_attachment_meters constant double precision := 25;
begin
  if p_submission_id is null or p_reporter_user_id is null then
    raise exception 'Submission identity is required' using errcode = 'P0001';
  end if;

  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then
    raise exception 'Latitude is invalid' using errcode = 'P0001';
  end if;

  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Longitude is invalid' using errcode = 'P0001';
  end if;

  if p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters >= 100000) then
    raise exception 'Accuracy is invalid' using errcode = 'P0001';
  end if;

  if p_severity is null then
    raise exception 'Severity is required' using errcode = 'P0001';
  end if;

  if p_note is not null and (btrim(p_note) = '' or char_length(p_note) > 500) then
    raise exception 'Note is invalid' using errcode = 'P0001';
  end if;

  if char_length(coalesce(p_formatted_address, '')) > 500
    or char_length(coalesce(p_street_number, '')) > 32
    or char_length(coalesce(p_street, '')) > 255
    or char_length(coalesce(p_city, '')) > 160
    or char_length(coalesce(p_district, '')) > 160
    or char_length(coalesce(p_region, '')) > 160
    or char_length(coalesce(p_postal_code, '')) > 32
    or char_length(coalesce(p_country, '')) > 160 then
    raise exception 'Address is invalid' using errcode = 'P0001';
  end if;

  if p_mime_type is distinct from 'image/jpeg'
    or p_file_size_bytes is null
    or p_file_size_bytes <= 0
    or p_file_size_bytes > 10485760 then
    raise exception 'Photo metadata is invalid' using errcode = 'P0001';
  end if;

  if p_existing_pothole_public_id is not null
    and p_existing_pothole_public_id !~ '^MTL-[0-9]{6}$' then
    raise exception 'Existing pothole identifier is invalid' using errcode = 'P0001';
  end if;

  -- The null-target path intentionally delegates to the proven v1 finalizer.
  -- That preserves the deployed new-pothole behavior exactly while v2 adds
  -- only the explicit existing-pothole attachment branch below.
  if p_existing_pothole_public_id is null then
    return query
    select
      'FINALIZED'::text,
      finalized.pothole_id,
      finalized.report_id,
      finalized.public_id,
      finalized.status,
      r.matched_existing_pothole,
      p.report_count
    from public.finalize_citizen_report(
      p_submission_id,
      p_reporter_user_id,
      p_storage_path,
      p_latitude,
      p_longitude,
      p_accuracy_meters,
      p_formatted_address,
      p_street_number,
      p_street,
      p_city,
      p_district,
      p_region,
      p_postal_code,
      p_country,
      p_severity,
      p_note,
      p_mime_type,
      p_file_size_bytes
    ) as finalized
    join public.reports as r on r.id = finalized.report_id
    join public.potholes as p on p.id = finalized.pothole_id;
    return;
  end if;

  v_reported_location := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  select i.*
  into v_intent
  from public.report_upload_intents as i
  where i.submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission upload intent was not found' using errcode = 'P0001';
  end if;

  if v_intent.reporter_user_id <> p_reporter_user_id
    or v_intent.storage_path is distinct from p_storage_path then
    raise exception 'Submission upload intent does not belong to this user' using errcode = 'P0001';
  end if;

  if v_intent.cleanup_requested_at is not null then
    raise exception 'Submission upload intent was abandoned' using errcode = 'P0001';
  end if;

  -- A retry after a lost response returns the originally committed mode and
  -- never repeats an existing-pothole increment.
  if v_intent.finalized_report_id is not null then
    select
      p.id,
      r.id,
      p.public_id,
      p.status,
      r.matched_existing_pothole,
      p.report_count
    into
      v_pothole_id,
      v_report_id,
      v_public_id,
      v_status,
      v_matched_existing,
      v_report_count
    from public.reports as r
    join public.potholes as p on p.id = r.pothole_id
    where r.id = v_intent.finalized_report_id;

    if found then
      return query
      select
        'FINALIZED'::text,
        v_pothole_id,
        v_report_id,
        v_public_id,
        v_status,
        v_matched_existing,
        v_report_count;
      return;
    end if;

    raise exception 'Finalized submission is inconsistent' using errcode = 'P0001';
  end if;

  -- Defense in depth for an unexpected report write that predates intent
  -- finalization. Its stored match mode remains the idempotent source of truth.
  select
    p.id,
    r.id,
    p.public_id,
    p.status,
    r.reporter_user_id,
    r.matched_existing_pothole,
    p.report_count
  into
    v_pothole_id,
    v_report_id,
    v_public_id,
    v_status,
    v_existing_reporter_user_id,
    v_matched_existing,
    v_report_count
  from public.reports as r
  join public.potholes as p on p.id = r.pothole_id
  where r.submission_id = p_submission_id;

  if found then
    if v_existing_reporter_user_id <> p_reporter_user_id then
      raise exception 'Submission belongs to another user' using errcode = 'P0001';
    end if;

    update public.report_upload_intents as i
    set
      finalized_at = now(),
      finalized_report_id = v_report_id
    where i.submission_id = p_submission_id;

    return query
    select
      'FINALIZED'::text,
      v_pothole_id,
      v_report_id,
      v_public_id,
      v_status,
      v_matched_existing,
      v_report_count;
    return;
  end if;

  -- This lock serializes status revalidation and report_count updates for the
  -- selected canonical pothole. The location and workflow state are never
  -- changed by an additional citizen report.
  select
    p.id,
    p.public_id,
    p.status,
    p.report_count
  into
    v_pothole_id,
    v_public_id,
    v_status,
    v_report_count
  from public.potholes as p
  where p.public_id = p_existing_pothole_public_id
    and p.status in (
      'REPORTED'::public.pothole_status,
      'UNDER_REVIEW'::public.pothole_status,
      'VERIFIED'::public.pothole_status,
      'ASSIGNED'::public.pothole_status,
      'ACCEPTED'::public.pothole_status,
      'IN_PROGRESS'::public.pothole_status
    )
    and extensions.st_dwithin(
      p.canonical_location,
      v_reported_location,
      v_max_existing_pothole_attachment_meters
    )
  for update;

  if not found then
    -- This is a safe domain result, not a database detail. The Edge Function
    -- maps it to a retryable stale-selection response without cleaning up the
    -- still-valid private upload intent or JPEG.
    return query
    select
      'EXISTING_POTHOLE_UNAVAILABLE'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::public.pothole_status,
      null::boolean,
      null::integer;
    return;
  end if;

  v_matched_existing := true;

  insert into public.reports as r (
    pothole_id,
    reported_location,
    accuracy_meters,
    formatted_address,
    street_number,
    street,
    city,
    district,
    region,
    postal_code,
    country,
    severity,
    note,
    reporter_user_id,
    submission_id,
    matched_existing_pothole
  )
  values (
    v_pothole_id,
    v_reported_location,
    p_accuracy_meters,
    p_formatted_address,
    p_street_number,
    p_street,
    p_city,
    p_district,
    p_region,
    p_postal_code,
    p_country,
    p_severity,
    p_note,
    p_reporter_user_id,
    p_submission_id,
    v_matched_existing
  )
  returning r.id into v_report_id;

  insert into public.report_photos as rp (
    report_id,
    storage_path,
    mime_type,
    file_size_bytes
  )
  values (
    v_report_id,
    v_intent.storage_path,
    p_mime_type,
    p_file_size_bytes
  );

  if v_matched_existing then
    update public.potholes as p
    set report_count = p.report_count + 1
    where p.id = v_pothole_id
    returning p.status, p.report_count into v_status, v_report_count;
  end if;

  update public.report_upload_intents as i
  set
    finalized_at = now(),
    finalized_report_id = v_report_id
  where i.submission_id = p_submission_id;

  return query
  select
    'FINALIZED'::text,
    v_pothole_id,
    v_report_id,
    v_public_id,
    v_status,
    v_matched_existing,
    v_report_count;
end;
$$;

revoke all on function public.finalize_citizen_report_v2(
  uuid,
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  public.report_severity,
  text,
  text,
  bigint,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.finalize_citizen_report_v2(
  uuid,
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  public.report_severity,
  text,
  text,
  bigint,
  text
) to service_role;

comment on function public.finalize_citizen_report_v2(
  uuid,
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  public.report_severity,
  text,
  text,
  bigint,
  text
) is
  'Service-role-only atomic citizen finalization. A selected public pothole identifier is independently revalidated as active and within 25 meters before attachment; idempotent retries return the stored match mode.';
