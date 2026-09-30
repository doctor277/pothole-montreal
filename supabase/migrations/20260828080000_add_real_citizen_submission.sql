-- Pothole MTL real citizen submission boundary.
--
-- Mobile clients keep default-deny access to application tables. Only the
-- authenticated Edge Functions use the service-role RPC below. A report upload
-- intent binds a server-generated submission ID and storage path to one Auth
-- user before a photo can be uploaded.

alter table public.reports
  add column if not exists reporter_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists submission_id uuid;

-- Milestone 6A did not permit report creation, so these columns are empty only
-- before this migration. Keeping them non-null makes all new reports traceable
-- to their submitting anonymous Auth user and gives the database a durable
-- idempotency key.
alter table public.reports
  alter column reporter_user_id set not null,
  alter column submission_id set not null;

alter table public.reports
  add constraint reports_submission_id_key unique (submission_id);

create index reports_reporter_user_id_idx
on public.reports (reporter_user_id);

-- This is not a report record. It is a private, server-created authorization
-- record for exactly one private JPEG upload. It allows a later retry to reuse
-- its submission ID and path without letting the client choose either value.
create table public.report_upload_intents (
  submission_id uuid primary key,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_report_id uuid unique references public.reports(id) on delete set null,
  cleanup_requested_at timestamptz,
  check (
    storage_path = (
      'submissions/' || reporter_user_id::text || '/' || submission_id::text || '.jpg'
    )
  ),
  check (
    (finalized_at is null and finalized_report_id is null)
    or (finalized_at is not null and finalized_report_id is not null)
  ),
  check (
    cleanup_requested_at is null
    or (finalized_at is null and finalized_report_id is null)
  )
);

create index report_upload_intents_reporter_created_at_idx
on public.report_upload_intents (reporter_user_id, created_at desc);

alter table public.report_upload_intents enable row level security;

-- Default deny: no browser/mobile role can read or mutate intents, reports,
-- potholes, photos, or Storage objects directly. The hosted service-role Edge
-- Function client has only the explicit table privileges below. The final RPC
-- owns all data writes under a SECURITY DEFINER transaction.
revoke all on table public.report_upload_intents from public, anon, authenticated;
revoke all on table public.report_upload_intents, public.potholes, public.reports, public.report_photos from service_role;
revoke all on sequence public.pothole_public_id_seq from service_role;
grant usage on schema public to service_role;
grant select, insert, delete on table public.report_upload_intents to service_role;
grant select on table public.potholes, public.reports to service_role;

-- The Edge Function supplies server-verified data and invokes this RPC with its
-- service-role client. The row lock serializes concurrent finalization attempts
-- for one submission before a pothole can be inserted. The unique submission ID
-- on reports remains defense in depth if a future caller bypasses the intent.
create or replace function public.finalize_citizen_report(
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
  p_file_size_bytes bigint
)
returns table (
  pothole_id uuid,
  report_id uuid,
  public_id text,
  status public.pothole_status
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
  v_existing_reporter_user_id uuid;
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

  select *
  into v_intent
  from public.report_upload_intents
  where submission_id = p_submission_id
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

  -- An idempotent retry after a lost network response returns the already
  -- committed result without creating another pothole or photo metadata row.
  if v_intent.finalized_report_id is not null then
    select
      p.id,
      r.id,
      p.public_id,
      p.status
    into
      v_pothole_id,
      v_report_id,
      v_public_id,
      v_status
    from public.reports as r
    join public.potholes as p on p.id = r.pothole_id
    where r.id = v_intent.finalized_report_id;

    if found then
      pothole_id := v_pothole_id;
      report_id := v_report_id;
      public_id := v_public_id;
      status := v_status;
      return next;
      return;
    end if;

    raise exception 'Finalized submission is inconsistent' using errcode = 'P0001';
  end if;

  -- This protects against an unexpected prior write that created the report but
  -- could not mark the intent finalized.
  select
    p.id,
    r.id,
    p.public_id,
    p.status,
    r.reporter_user_id
  into
    v_pothole_id,
    v_report_id,
    v_public_id,
    v_status,
    v_existing_reporter_user_id
  from public.reports as r
  join public.potholes as p on p.id = r.pothole_id
  where r.submission_id = p_submission_id;

  if found then
    if v_existing_reporter_user_id <> p_reporter_user_id then
      raise exception 'Submission belongs to another user' using errcode = 'P0001';
    end if;

    update public.report_upload_intents
    set
      finalized_at = now(),
      finalized_report_id = v_report_id
    where submission_id = p_submission_id;

    pothole_id := v_pothole_id;
    report_id := v_report_id;
    public_id := v_public_id;
    status := v_status;
    return next;
    return;
  end if;

  insert into public.potholes (
    status,
    canonical_location,
    formatted_address,
    street_number,
    street,
    city,
    district,
    region,
    postal_code,
    country,
    report_count
  )
  values (
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_formatted_address,
    p_street_number,
    p_street,
    p_city,
    p_district,
    p_region,
    p_postal_code,
    p_country,
    1
  )
  returning id, public_id, status into v_pothole_id, v_public_id, v_status;

  insert into public.reports (
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
    submission_id
  )
  values (
    v_pothole_id,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
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
    p_submission_id
  )
  returning id into v_report_id;

  insert into public.report_photos (
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

  update public.report_upload_intents
  set
    finalized_at = now(),
    finalized_report_id = v_report_id
  where submission_id = p_submission_id;

  pothole_id := v_pothole_id;
  report_id := v_report_id;
  public_id := v_public_id;
  status := v_status;
  return next;
end;
$$;

-- A failed finalization response is not always evidence that its transaction
-- rolled back. This companion RPC first locks the same intent and refuses to
-- claim it if a report was committed. Once claimed, finalization rejects the
-- intent, so Storage cleanup cannot race a later successful retry.
create or replace function public.claim_failed_report_upload_cleanup(
  p_submission_id uuid,
  p_reporter_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.report_upload_intents%rowtype;
begin
  select *
  into v_intent
  from public.report_upload_intents
  where submission_id = p_submission_id
  for update;

  if not found
    or v_intent.reporter_user_id <> p_reporter_user_id
    or v_intent.finalized_report_id is not null then
    return false;
  end if;

  if exists (
    select 1
    from public.reports
    where submission_id = p_submission_id
  ) then
    return false;
  end if;

  update public.report_upload_intents
  set cleanup_requested_at = coalesce(cleanup_requested_at, now())
  where submission_id = p_submission_id;

  return true;
end;
$$;

revoke all on function public.finalize_citizen_report(
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
  bigint
) from public, anon, authenticated, service_role;

grant execute on function public.finalize_citizen_report(
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
  bigint
) to service_role;

revoke all on function public.claim_failed_report_upload_cleanup(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.claim_failed_report_upload_cleanup(uuid, uuid)
to service_role;

comment on table public.report_upload_intents is
  'Private server-created upload authorizations for citizen report JPEGs; no direct client policies.';

comment on function public.finalize_citizen_report is
  'Service-role-only atomic finalization for an authenticated citizen report submission.';

comment on function public.claim_failed_report_upload_cleanup is
  'Service-role-only cleanup claim that prevents removal from racing a successful finalization.';
