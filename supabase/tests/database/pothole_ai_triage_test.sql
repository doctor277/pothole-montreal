begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;
select plan(44);

-- 1-10: default-deny and privileged read-only boundary.
select has_function('public', 'admin_get_queue_ai_triage_inputs', array['text[]', 'uuid'], 'the bounded companion RPC exists');
select is((select p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']::text[]
  from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_get_queue_ai_triage_inputs'), true,
  'the RPC is stable SECURITY DEFINER with empty search_path');
select is(has_function_privilege('service_role', 'public.admin_get_queue_ai_triage_inputs(text[], uuid)', 'execute'), true, 'service_role can execute');
select is(has_function_privilege('anon', 'public.admin_get_queue_ai_triage_inputs(text[], uuid)', 'execute'), false, 'anon cannot execute');
select is(has_function_privilege('authenticated', 'public.admin_get_queue_ai_triage_inputs(text[], uuid)', 'execute'), false, 'authenticated cannot execute');
select is((select count(*) from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace,
  lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
  where n.nspname = 'public' and p.proname = 'admin_get_queue_ai_triage_inputs'
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), 0::bigint, 'PUBLIC has no execution grant');
select is(has_table_privilege('anon', 'public.pothole_ai_assessments', 'select'), false, 'anon has no direct assessment access');
select is(has_table_privilege('authenticated', 'public.pothole_ai_assessments', 'select'), false, 'browser has no direct assessment access');
select is(has_table_privilege('service_role', 'public.pothole_ai_assessments', 'select'), false, 'service_role must use RPCs');
select ok((select c.relrowsecurity from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'pothole_ai_assessments') and
  not exists(select 1 from pg_policies as pp where pp.schemaname = 'public' and pp.tablename = 'pothole_ai_assessments'), 'assessment default-deny RLS remains');

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000041', 'triage-admin@example.test'),
  ('00000000-0000-4000-8000-000000000042', 'triage-inactive@example.test'),
  ('00000000-0000-4000-8000-000000000043', 'triage-non-admin@example.test');
insert into public.admin_users(user_id, is_active) values
  ('00000000-0000-4000-8000-000000000041', true), ('00000000-0000-4000-8000-000000000042', false);

-- 11-19: invalid input and active-admin recheck.
select is(public.admin_get_queue_ai_triage_inputs(array['MTL-940000'], null)->>'outcome', 'INVALID_INPUT', 'null actor rejected');
select is(public.admin_get_queue_ai_triage_inputs(null, '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'null IDs rejected');
select is(public.admin_get_queue_ai_triage_inputs('{}'::text[], '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'empty batch rejected');
select is(public.admin_get_queue_ai_triage_inputs((select array_agg('MTL-' || lpad(i::text, 6, '0')) from generate_series(1, 51) as s(i)), '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'batch over 50 rejected');
select is(public.admin_get_queue_ai_triage_inputs(array['bad'], '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'malformed IDs rejected');
select is(public.admin_get_queue_ai_triage_inputs(array[null]::text[], '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'null array item rejected');
select is(public.admin_get_queue_ai_triage_inputs(array['MTL-940000', 'MTL-940000'], '00000000-0000-4000-8000-000000000041')->>'outcome', 'INVALID_INPUT', 'duplicate IDs rejected');
select is(public.admin_get_queue_ai_triage_inputs(array['MTL-940000'], '00000000-0000-4000-8000-000000000043')->>'outcome', 'ACTOR_NOT_AUTHORIZED', 'non-admin denied');
select is(public.admin_get_queue_ai_triage_inputs(array['MTL-940000'], '00000000-0000-4000-8000-000000000042')->>'outcome', 'ACTOR_NOT_AUTHORIZED', 'inactive admin denied');

insert into public.potholes(id, public_id, canonical_location, report_count)
select ('42000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'MTL-' || (940000+i-1)::text,
  extensions.st_setsrid(extensions.st_makepoint(-73.57, 45.51), 4326)::extensions.geography, 1
from generate_series(1, 5) as s(i);
insert into public.reports(id, pothole_id, reported_location, severity, submission_id, reporter_user_id, created_at, evidence_recorded_at)
select ('52000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('42000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  extensions.st_setsrid(extensions.st_makepoint(-73.57, 45.51), 4326)::extensions.geography, 'MEDIUM'::public.report_severity,
  ('62000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-4000-8000-000000000043'::uuid,
  '2026-09-16T09:00:00Z'::timestamptz,
  case when i=3 then '2026-09-16T10:00:30Z'::timestamptz else null end
from generate_series(2, 5) as s(i);
insert into public.report_photos(report_id, storage_path, mime_type, file_size_bytes, created_at, evidence_recorded_at)
select ('52000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'test-triage/' || i::text || '.jpg', 'image/jpeg', 100,
  '2026-09-16T09:01:00Z'::timestamptz,
  case when i=4 then '2026-09-16T10:02:00Z'::timestamptz
    when i=5 then '2026-09-16T10:00:00.000001Z'::timestamptz else null end
from generate_series(2, 5) as s(i);
insert into public.pothole_ai_assessments(id, request_id, pothole_id, requested_by_user_id, provider, model, prompt_version, schema_version,
  classification, confidence, photo_quality, suggested_severity, visible_evidence, cautions, summary, input_photo_count, input_evidence_sha256, requested_at, created_at)
select ('92000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('82000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('42000000-0000-4000-8000-' || lpad((case when i=6 then 2 else i end)::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000041'::uuid, 'openai', 'gpt-5.6-terra', 'pothole-vision-v1', 'pothole-assessment-v1',
  case when i=2 then 'uncertain'::public.pothole_ai_classification else 'likely_pothole'::public.pothole_ai_classification end,
  0.999, 'good'::public.pothole_ai_photo_quality, 'MEDIUM'::public.report_severity, array['Visible cavity'], '{}'::text[],
  'Visual assessment', 1, repeat('a',64), '2026-09-16T10:00:00Z', '2026-09-16T10:01:00Z'
from generate_series(2, 6) as s(i);

create temporary table triage_baseline as select
  (select sum(p.report_count) from public.potholes as p) as reports,
  (select count(*) from public.pothole_status_events) as events,
  (select count(*) from public.pothole_ai_assessments) as assessments,
  (select count(*) from private.pothole_ai_analysis_leases) as leases,
  (select count(*) from private.pothole_ai_operational_events) as telemetry,
  (select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status) order by p.id) from public.potholes as p) as statuses;
create temporary table triage_result(payload jsonb);
grant insert on triage_result to service_role;
set local role service_role;
insert into triage_result values(public.admin_get_queue_ai_triage_inputs(
  array['MTL-940000','MTL-940001','MTL-940002','MTL-940003','MTL-940004'], '00000000-0000-4000-8000-000000000041'));
reset role;

-- 20-30: real data contract, latest deterministic assessment, exact staleness.
select is((select payload->>'outcome' from triage_result), 'OK', 'service-role active-admin read succeeds');
select is((select jsonb_array_length(payload->'items') from triage_result), 5, 'one result per requested existing pothole');
select ok((select payload #> '{items,0,assessment}' = 'null'::jsonb from triage_result), 'no assessment stays null');
select is((select payload #>> '{items,1,assessment,classification}' from triage_result), 'likely_pothole', 'equal-time assessments use UUID descending tie-breaker');
select is((select (payload #>> '{items,1,assessment,created_at}')::timestamptz from triage_result), '2026-09-16T10:01:00Z'::timestamptz, 'latest assessment completion time returned');
select is((select (payload #>> '{items,1,evidence_changed_since_assessment}')::boolean from triage_result), false, 'older evidence is not stale');
select is((select (payload #>> '{items,2,evidence_changed_since_assessment}')::boolean from triage_result), true, 'lock-delayed report with older transaction timestamp is stale during analysis');
select is((select (payload #>> '{items,3,evidence_changed_since_assessment}')::boolean from triage_result), true, 'new photo after analysis is stale');
select is((select (payload #>> '{items,4,evidence_changed_since_assessment}')::boolean from triage_result), true, 'microsecond-newer evidence cannot be rounded into current');
select ok((select payload #> '{items,0,latest_evidence_created_at}' = 'null'::jsonb from triage_result), 'no evidence stays null');
select is((select (payload #>> '{items,3,latest_evidence_created_at}')::timestamptz from triage_result), '2026-09-16T10:02:00Z'::timestamptz, 'latest evidence includes photo time rather than only report time');

-- 31-33: exact privacy allowlists, including newly added future raw fields.
select results_eq($$select k::text collate "C" from triage_result, lateral jsonb_object_keys(payload #> '{items,1}') as s(k) order by k collate "C"$$,
  $$values ('assessment'::text collate "C"), ('evidence_changed_since_assessment'::text collate "C"), ('latest_evidence_created_at'::text collate "C"), ('public_id'::text collate "C")$$, 'only minimal queue triage input keys returned');
select results_eq($$select k::text collate "C" from triage_result, lateral jsonb_object_keys(payload #> '{items,1,assessment}') as s(k) order by k collate "C"$$,
  $$values ('classification'::text collate "C"), ('confidence'::text collate "C"), ('created_at'::text collate "C"), ('input_photo_count'::text collate "C"), ('model'::text collate "C"), ('photo_quality'::text collate "C"), ('prompt_version'::text collate "C"), ('requested_at'::text collate "C"), ('schema_version'::text collate "C"), ('suggested_severity'::text collate "C")$$, 'assessment read uses a minimal fixed allowlist');
select ok((select payload::text !~ '(reporter_user_id|requested_by_user_id|request_id|evidence_sha256|response_id|storage_path|signed_url|raw_response|summary|visible_evidence|note|address)' from triage_result), 'no identities, paths, prose, provider response IDs or raw payloads returned');

-- 34-39: calls actually made above cannot mutate any protected surface.
select is((select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status) order by p.id) from public.potholes as p), (select statuses from triage_baseline), 'human statuses unchanged');
select is((select sum(p.report_count) from public.potholes as p), (select reports from triage_baseline), 'report_count unchanged');
select is((select count(*) from public.pothole_status_events), (select events from triage_baseline), 'no moderation event written');
select is((select count(*) from public.pothole_ai_assessments), (select assessments from triage_baseline), 'no assessment persisted');
select is((select count(*) from private.pothole_ai_analysis_leases), (select leases from triage_baseline), 'no lease acquired');
select is((select count(*) from private.pothole_ai_operational_events), (select telemetry from triage_baseline), 'no queue-view telemetry');
-- 40: the Edge parser refuses incomplete batches rather than inventing assessments.
select is(jsonb_array_length(public.admin_get_queue_ai_triage_inputs(array['MTL-949999'], '00000000-0000-4000-8000-000000000041')->'items'), 0, 'unknown pothole cannot fabricate metadata');
-- 41-44: additive evidence-clock contract without rewriting finalizers.
select has_column('public', 'reports', 'evidence_recorded_at', 'report insertion time is available');
select has_column('public', 'report_photos', 'evidence_recorded_at', 'photo insertion time is available');
select is((select count(*) from pg_attrdef as d join pg_attribute as a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid in ('public.reports'::regclass, 'public.report_photos'::regclass)
    and a.attname = 'evidence_recorded_at' and pg_get_expr(d.adbin, d.adrelid) = 'clock_timestamp()'), 2::bigint,
  'both new evidence boundaries default to actual insert time rather than transaction start');
select is((select (payload #>> '{items,1,latest_evidence_created_at}')::timestamptz from triage_result), '2026-09-16T09:01:00Z'::timestamptz,
  'untouched historical rows fall back to existing evidence created_at');
select * from finish();
rollback;
