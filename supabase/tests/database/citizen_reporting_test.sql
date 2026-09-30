begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(20);

-- The citizen-facing roles must not be able to bypass the Edge Function/RPC
-- boundaries through the Data API or invoke the internal RPCs directly.
select is(
  has_table_privilege('anon', 'public.reports', 'select'),
  false,
  'anon cannot read reports directly'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.finalize_citizen_report_v2(uuid, uuid, text, double precision, double precision, double precision, text, text, text, text, text, text, text, text, public.report_severity, text, text, bigint, text)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot invoke the citizen finalizer directly'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000001', 'citizen-test@example.test');

insert into public.report_upload_intents (
  submission_id,
  reporter_user_id,
  storage_path
)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg'
);

create temporary table first_submission_result on commit drop as
select *
from public.finalize_citizen_report_v2(
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg',
  45.5017,
  -73.5673,
  8,
  '100 Test Street, Montréal, QC H1H 1H1',
  '100',
  'Test Street',
  'Montréal',
  null,
  'QC',
  'H1H 1H1',
  'CA',
  'MEDIUM'::public.report_severity,
  'First report',
  'image/jpeg',
  1024,
  null
);

select is(
  (select outcome from first_submission_result),
  'FINALIZED',
  'a new citizen submission finalizes'
);

select is(
  (select report_count from first_submission_result),
  1,
  'a new pothole starts with report_count one'
);

select is(
  (select count(*) from first_submission_result),
  1::bigint,
  'a new citizen submission returns exactly one result'
);

select ok(
  (select pothole_id from first_submission_result) is not null,
  'a new citizen submission returns a pothole ID'
);

select ok(
  (select report_id from first_submission_result) is not null,
  'a new citizen submission returns a report ID'
);

select ok(
  (select public_id from first_submission_result) is not null,
  'a new citizen submission returns a public ID'
);

create temporary table first_submission_retry on commit drop as
select *
from public.finalize_citizen_report_v2(
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001.jpg',
  45.5017,
  -73.5673,
  8,
  '100 Test Street, Montréal, QC H1H 1H1',
  '100',
  'Test Street',
  'Montréal',
  null,
  'QC',
  'H1H 1H1',
  'CA',
  'MEDIUM'::public.report_severity,
  'First report',
  'image/jpeg',
  1024,
  null
);

select is(
  coalesce(
    (select pothole_id::text from first_submission_retry),
    '__missing_first_submission_retry_pothole_id__'
  ),
  coalesce(
    (select pothole_id::text from first_submission_result),
    '__missing_first_submission_result_pothole_id__'
  ),
  'a retry returns the original canonical pothole'
);

select is(
  coalesce(
    (select report_id::text from first_submission_retry),
    '__missing_first_submission_retry_report_id__'
  ),
  coalesce(
    (select report_id::text from first_submission_result),
    '__missing_first_submission_result_report_id__'
  ),
  'a retry returns the original report'
);

select is(
  (select count(*) from public.reports where submission_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'a retry does not create a second report'
);

select is(
  (select count(*) from public.report_photos where report_id = (select report_id from first_submission_result)),
  1::bigint,
  'a retry does not create a second photo metadata row'
);

insert into public.potholes (
  id,
  public_id,
  status,
  canonical_location,
  formatted_address,
  report_count
)
values (
  '20000000-0000-4000-8000-000000000001',
  'MTL-900010',
  'REPORTED'::public.pothole_status,
  extensions.st_setsrid(extensions.st_makepoint(-73.5673, 45.5017), 4326)::extensions.geography,
  '200 Existing Street, Montréal, QC H1H 1H2',
  3
);

insert into public.report_upload_intents (
  submission_id,
  reporter_user_id,
  storage_path
)
values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.jpg'
);

create temporary table existing_submission_result on commit drop as
select *
from public.finalize_citizen_report_v2(
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.jpg',
  45.50171,
  -73.56731,
  6,
  '200 Existing Street, Montréal, QC H1H 1H2',
  '200',
  'Existing Street',
  'Montréal',
  null,
  'QC',
  'H1H 1H2',
  'CA',
  'DANGEROUS'::public.report_severity,
  'Attached report',
  'image/jpeg',
  2048,
  'MTL-900010'
);

select is(
  (select outcome from existing_submission_result),
  'FINALIZED',
  'a selected nearby pothole can receive an additional citizen report'
);

select is(
  (select matched_existing from existing_submission_result),
  true,
  'an attached report records its selected-existing mode'
);

select is(
  (select report_count from existing_submission_result),
  4,
  'the selected pothole report_count increments atomically'
);

create temporary table existing_submission_retry on commit drop as
select *
from public.finalize_citizen_report_v2(
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'submissions/00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.jpg',
  45.50171,
  -73.56731,
  6,
  '200 Existing Street, Montréal, QC H1H 1H2',
  '200',
  'Existing Street',
  'Montréal',
  null,
  'QC',
  'H1H 1H2',
  'CA',
  'DANGEROUS'::public.report_severity,
  'Attached report',
  'image/jpeg',
  2048,
  'MTL-900010'
);

select is(
  coalesce(
    (select report_id::text from existing_submission_retry),
    '__missing_existing_submission_retry_report_id__'
  ),
  coalesce(
    (select report_id::text from existing_submission_result),
    '__missing_existing_submission_result_report_id__'
  ),
  'an existing-pothole retry returns the original report'
);

select is(
  (select report_count from public.potholes where public_id = 'MTL-900010'),
  4,
  'an existing-pothole retry does not increment report_count twice'
);

select is(
  (select count(*) from public.reports where pothole_id = '20000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one attached report exists after its retry'
);

select is(
  (
    select array_agg(map_key order by map_key)
    from jsonb_object_keys(
      (
        select to_jsonb(map_row)
        from public.list_public_potholes_in_bbox(45.49, -73.58, 45.51, -73.55, 10) as map_row
        where map_row.public_id = 'MTL-900010'
      )
    ) as map_key
  ),
  array[
    'created_at',
    'formatted_address',
    'latest_severity',
    'latitude',
    'longitude',
    'public_id',
    'report_count',
    'result_limit_reached',
    'status'
  ]::text[],
  'the public map DTO excludes report and citizen internal fields'
);

select is(
  (
    select array_agg(candidate_key order by candidate_key)
    from jsonb_object_keys(
      (
        select to_jsonb(candidate_row)
        from public.find_nearby_public_potholes(45.5017, -73.5673, 25, 5) as candidate_row
        where candidate_row.public_id = 'MTL-900010'
      )
    ) as candidate_key
  ),
  array[
    'created_at',
    'distance_meters',
    'formatted_address',
    'latest_severity',
    'latitude',
    'longitude',
    'public_id',
    'report_count',
    'status'
  ]::text[],
  'the nearby-candidate DTO excludes report and citizen internal fields'
);

select * from finish();
rollback;
