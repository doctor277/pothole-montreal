begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(45);

-- 1
select has_table(
  'private',
  'pothole_ai_operational_events',
  'the private AI operational telemetry table exists'
);

-- 2
select is(
  (
    select count(*)
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'private'
      and t.typname = 'pothole_ai_operational_event_type'
  ),
  1::bigint,
  'the controlled private telemetry event type exists'
);

-- 3
select results_eq(
  $$
    select e.enumlabel::text collate "C"
    from pg_enum as e
    join pg_type as t on t.oid = e.enumtypid
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'private'
      and t.typname = 'pothole_ai_operational_event_type'
    order by e.enumsortorder
  $$,
  $$
    values
      ('analysis_disabled'::text collate "C"),
      ('analysis_concurrent'::text collate "C"),
      ('no_usable_photos'::text collate "C"),
      ('evidence_unavailable'::text collate "C"),
      ('provider_started'::text collate "C"),
      ('provider_succeeded'::text collate "C"),
      ('provider_timeout'::text collate "C"),
      ('provider_rate_limited'::text collate "C"),
      ('provider_invalid_response'::text collate "C"),
      ('provider_unavailable'::text collate "C"),
      ('assessment_persisted'::text collate "C"),
      ('persistence_failure'::text collate "C")
  $$,
  'telemetry accepts only the reviewed operational taxonomy'
);

-- 4
select is(
  (
    select c.relrowsecurity
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'pothole_ai_operational_events'
  ),
  true,
  'the private telemetry table has row-level security enabled'
);

-- 5
select is(
  (
    select count(*)
    from pg_policies as pp
    where pp.schemaname = 'private'
      and pp.tablename = 'pothole_ai_operational_events'
  ),
  0::bigint,
  'no RLS policy exposes private telemetry'
);

-- 6
select is(
  has_table_privilege('anon', 'private.pothole_ai_operational_events', 'select'),
  false,
  'anon cannot read private telemetry'
);

-- 7
select is(
  has_table_privilege('authenticated', 'private.pothole_ai_operational_events', 'select'),
  false,
  'authenticated users cannot read private telemetry'
);

-- 8
select is(
  has_table_privilege('service_role', 'private.pothole_ai_operational_events', 'select'),
  false,
  'service_role must use reviewed telemetry boundaries instead of direct reads'
);

-- 9
select is(
  has_table_privilege('service_role', 'private.pothole_ai_operational_events', 'insert'),
  false,
  'service_role cannot bypass telemetry validation with direct inserts'
);

-- 10
select is(
  has_table_privilege('service_role', 'private.pothole_ai_operational_events', 'update'),
  false,
  'service_role cannot update telemetry directly'
);

-- 11
select is(
  has_table_privilege('service_role', 'private.pothole_ai_operational_events', 'delete'),
  false,
  'service_role cannot delete telemetry directly'
);

-- 12
select is(
  (
    select count(*)
    from information_schema.table_privileges as tp
    where tp.table_schema = 'private'
      and tp.table_name = 'pothole_ai_operational_events'
      and tp.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ),
  0::bigint,
  'no public, browser, or service-role table grant bypasses the telemetry RPC'
);

-- 13
select has_function(
  'public',
    'record_pothole_ai_operational_event',
    array['text', 'uuid', 'text', 'text', 'text', 'text', 'text', 'integer', 'integer', 'boolean', 'boolean'],
  'the service telemetry writer exists with its reviewed signature'
);

-- 14
select is(
  (
    select p.prosecdef and p.proconfig @> array['search_path=""']::text[]
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_pothole_ai_operational_event'
  ),
  true,
  'the telemetry writer is SECURITY DEFINER with an empty search_path'
);

-- 15
select is(
  has_function_privilege(
    'service_role',
    'public.record_pothole_ai_operational_event(text, uuid, text, text, text, text, text, integer, integer, boolean, boolean)'::regprocedure,
    'execute'
  ),
  true,
  'service_role can invoke the telemetry writer'
);

-- 16
select is(
  has_function_privilege(
    'anon',
    'public.record_pothole_ai_operational_event(text, uuid, text, text, text, text, text, integer, integer, boolean, boolean)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot invoke the telemetry writer'
);

-- 17
select is(
  has_function_privilege(
    'authenticated',
    'public.record_pothole_ai_operational_event(text, uuid, text, text, text, text, text, integer, integer, boolean, boolean)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated users cannot invoke the telemetry writer'
);

-- 18
select is(
  (
    select count(*)
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'pothole_ai_operational_events'
      and t.tgname = 'prevent_pothole_ai_operational_event_mutation'
      and not t.tgisinternal
  ),
  1::bigint,
  'the append-only telemetry trigger exists'
);

-- 19
select is(
  (
    select count(*)
    from information_schema.columns as c
    where c.table_schema = 'private'
      and c.table_name = 'pothole_ai_operational_events'
      and c.column_name in (
        'image', 'image_bytes', 'base64', 'storage_path', 'signed_url',
        'latitude', 'longitude', 'address', 'postal_code', 'note',
        'reporter_user_id', 'admin_user_id', 'actor_user_id', 'access_token',
        'refresh_token', 'api_key', 'raw_response', 'raw_error', 'stack'
      )
  ),
  0::bigint,
  'telemetry has no identity, image, location, secret, path, URL, or raw-error columns'
);

-- 20
select results_eq(
  $$
    select c.column_name::text collate "C"
    from information_schema.columns as c
    where c.table_schema = 'private'
      and c.table_name = 'pothole_ai_operational_events'
    order by c.ordinal_position
  $$,
  $$
    values
      ('id'::text collate "C"),
      ('pothole_id'::text collate "C"),
      ('request_id'::text collate "C"),
      ('event_type'::text collate "C"),
      ('provider'::text collate "C"),
      ('model'::text collate "C"),
      ('prompt_version'::text collate "C"),
      ('schema_version'::text collate "C"),
      ('selected_photo_count'::text collate "C"),
      ('duration_ms'::text collate "C"),
      ('automation_operationally_enabled'::text collate "C"),
      ('action_performed'::text collate "C"),
      ('assessment_id'::text collate "C"),
      ('created_at'::text collate "C")
  $$,
  'telemetry exposes only the reviewed minimal field set'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000031', 'telemetry-admin@example.test');

insert into public.potholes (
  id,
  public_id,
  status,
  canonical_location,
  report_count,
  created_at
)
values (
  '41000000-0000-4000-8000-000000000001',
  'MTL-930000',
  'REPORTED'::public.pothole_status,
  extensions.st_setsrid(extensions.st_makepoint(-73.57, 45.51), 4326)::extensions.geography,
  7,
  '2026-09-15T00:00:00Z'
);

-- 21
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000',
    '81000000-0000-4000-8000-000000000001',
    'analysis_disabled'
  ),
  true,
  'disabled analysis can record one safe operational event'
);

-- 22
select is(
  (
    select count(*)
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the disabled-analysis event is appended exactly once'
);

-- 23
select is(
  (
    select paoe.event_type::text
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000001'
  ),
  'analysis_disabled',
  'the stored disabled event retains only its controlled category'
);

-- 24
select is(
  (
    select paoe.assessment_id
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000001'
  ),
  null,
  'disabled analysis cannot fabricate an assessment link'
);

-- 25
select is(
  (select p.status::text from public.potholes as p where p.public_id = 'MTL-930000'),
  'REPORTED',
  'telemetry does not change pothole status'
);

-- 26
select is(
  (select p.report_count from public.potholes as p where p.public_id = 'MTL-930000'),
  7,
  'telemetry does not change report_count'
);

-- 27
select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    where pse.pothole_id = '41000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'telemetry does not create human moderation events'
);

-- 28
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002', 'raw_provider_error'
  ),
  false,
  'an arbitrary event category is rejected'
);

-- 29
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_timeout', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 1, -1
  ),
  false,
  'negative latency is rejected'
);

-- 30
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_timeout', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 1, 300001
  ),
  false,
  'unbounded latency is rejected'
);

-- 31
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_started', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', -1, null
  ),
  false,
  'negative photo counts are rejected'
);

-- 32
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_started', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 4, null
  ),
  false,
  'photo counts above the provider maximum are rejected'
);

-- 33
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_unavailable', 'other-provider'
  ),
  false,
  'unreviewed provider names are rejected'
);

-- 34
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000002',
    'provider_unavailable', 'openai', 'private/path.jpg'
  ),
  false,
  'path-like metadata cannot be stored in a telemetry label'
);

-- 35
select is(
  public.record_pothole_ai_operational_event(
    'MTL-93', '81000000-0000-4000-8000-000000000002', 'analysis_disabled'
  ),
  false,
  'malformed public IDs are rejected'
);

-- 36
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', null, 'analysis_disabled'
  ),
  false,
  'missing server request IDs are rejected'
);

-- 37
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000003', 'assessment_persisted'
  ),
  false,
  'an assessment-persisted event cannot exist before its immutable assessment'
);

insert into public.pothole_ai_assessments (
  id,
  request_id,
  pothole_id,
  requested_by_user_id,
  provider,
  model,
  prompt_version,
  schema_version,
  classification,
  confidence,
  photo_quality,
  suggested_severity,
  visible_evidence,
  cautions,
  summary,
  input_photo_count,
  input_evidence_sha256,
  requested_at,
  created_at
)
values (
  '91000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000031',
  'openai',
  'gpt-5.6-terra',
  'pothole-vision-v1',
  'pothole-assessment-v1',
  'likely_pothole'::public.pothole_ai_classification,
  1,
  'good'::public.pothole_ai_photo_quality,
  'MEDIUM'::public.report_severity,
  array['Visible asphalt cavity']::text[],
  '{}'::text[],
  'Visible damage is consistent with a pothole.',
  1,
  repeat('d', 64),
  '2026-09-15T01:00:00Z',
  '2026-09-15T01:00:01Z'
);

-- 38
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000003',
    'assessment_persisted', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 1, 1250, true, false
  ),
  true,
  'a successful persistence event is appended after its assessment exists'
);

-- 39
select is(
  (
    select paoe.assessment_id
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000003'
      and paoe.event_type = 'assessment_persisted'
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'the persisted event links to the matching immutable assessment server-side'
);

-- 40
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000004',
    'provider_succeeded', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 3, 987
  ),
  true,
  'bounded provider success metadata is accepted'
);

-- 41
select is(
  (
    select paoe.automation_operationally_enabled
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000003'
      and paoe.event_type = 'assessment_persisted'
  ),
  true,
  'telemetry preserves whether automation was operationally enabled at assessment time'
);

-- 42
select is(
  (
    select paoe.action_performed
    from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000003'
      and paoe.event_type = 'assessment_persisted'
  ),
  false,
  'M10.2 telemetry records that no automatic moderation action occurred'
);

-- 43
select throws_ok(
  $$
    update private.pothole_ai_operational_events as paoe
    set duration_ms = 1
    where paoe.request_id = '81000000-0000-4000-8000-000000000004'
  $$,
  '55000',
  'Pothole AI operational events are append-only',
  'the append-only trigger rejects telemetry updates'
);

-- 44
select throws_ok(
  $$
    delete from private.pothole_ai_operational_events as paoe
    where paoe.request_id = '81000000-0000-4000-8000-000000000004'
  $$,
  '55000',
  'Pothole AI operational events are append-only',
  'the append-only trigger rejects telemetry deletes'
);

-- 45
select is(
  public.record_pothole_ai_operational_event(
    'MTL-930000', '81000000-0000-4000-8000-000000000005',
    'provider_succeeded', 'openai', 'gpt-5.6-terra', 'pothole-vision-v1',
    'pothole-assessment-v1', 1, 100, true, true
  ),
  false,
  'M10.2 rejects telemetry that claims an automatic moderation action occurred'
);

select * from finish();
rollback;
