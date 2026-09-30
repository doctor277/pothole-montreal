-- Output column names in a PL/pgSQL RETURNS TABLE declaration are variables.
-- Keep all table references qualified so they cannot be mistaken for those
-- variables during finalization or an idempotent retry.
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
      return query
      select v_pothole_id, v_report_id, v_public_id, v_status;
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

    update public.report_upload_intents as i
    set
      finalized_at = now(),
      finalized_report_id = v_report_id
    where i.submission_id = p_submission_id;

    return query
    select v_pothole_id, v_report_id, v_public_id, v_status;
    return;
  end if;

  insert into public.potholes as p (
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
  returning p.id, p.public_id, p.status
  into v_pothole_id, v_public_id, v_status;

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
  returning r.id
  into v_report_id;

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

  update public.report_upload_intents as i
  set
    finalized_at = now(),
    finalized_report_id = v_report_id
  where i.submission_id = p_submission_id;

  return query
  select v_pothole_id, v_report_id, v_public_id, v_status;
  return;
end;
$$;

-- CREATE OR REPLACE preserves existing function ACLs. Reassert the original
-- service-role-only boundary explicitly so this correction cannot broaden it.
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
