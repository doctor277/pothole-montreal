begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(85);

select has_table(
  'public',
  'pothole_ai_assessments',
  'the append-only pothole AI assessment table exists'
);

select has_table(
  'private',
  'pothole_ai_analysis_leases',
  'the private cross-isolate AI lease table exists'
);

select results_eq(
  $$
    select e.enumlabel::text collate "C"
    from pg_enum as e
    join pg_type as t on t.oid = e.enumtypid
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'pothole_ai_classification'
    order by e.enumsortorder
  $$,
  $$
    values
      ('likely_pothole'::text collate "C"),
      ('uncertain'::text collate "C"),
      ('unlikely_pothole'::text collate "C")
  $$,
  'AI classification is constrained to the shadow-mode contract'
);

select results_eq(
  $$
    select e.enumlabel::text collate "C"
    from pg_enum as e
    join pg_type as t on t.oid = e.enumtypid
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'pothole_ai_photo_quality'
    order by e.enumsortorder
  $$,
  $$
    values
      ('good'::text collate "C"),
      ('usable'::text collate "C"),
      ('poor'::text collate "C")
  $$,
  'AI photo quality is constrained to the shadow-mode contract'
);

select is(
  (
    select c.is_nullable
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'pothole_ai_assessments'
      and c.column_name = 'suggested_severity'
  ),
  'YES',
  'unknown suggested severity is represented as NULL'
);

select is(
  (
    select c.relrowsecurity
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'pothole_ai_assessments'
  ),
  true,
  'pothole_ai_assessments has row-level security enabled'
);

select is(
  (
    select c.relrowsecurity
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'pothole_ai_analysis_leases'
  ),
  true,
  'the private AI lease table has row-level security enabled'
);

select is(
  has_table_privilege('anon', 'public.pothole_ai_assessments', 'select'),
  false,
  'anon cannot read AI assessments directly'
);

select is(
  has_table_privilege('authenticated', 'public.pothole_ai_assessments', 'select'),
  false,
  'authenticated users cannot read AI assessments directly'
);

select is(
  has_table_privilege('service_role', 'public.pothole_ai_assessments', 'select'),
  false,
  'service_role must use the assessment RPCs instead of direct reads'
);

select is(
  has_table_privilege('service_role', 'public.pothole_ai_assessments', 'insert'),
  false,
  'service_role cannot bypass completion with a direct insert'
);

select is(
  has_table_privilege('service_role', 'public.pothole_ai_assessments', 'update'),
  false,
  'service_role cannot update immutable AI assessments'
);

select is(
  has_table_privilege('service_role', 'public.pothole_ai_assessments', 'delete'),
  false,
  'service_role cannot delete immutable AI assessments'
);

select is(
  (
    select count(*) = 4
      and bool_and(
        p.prosecdef
        and p.proconfig @> array['search_path=""']::text[]
      )
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_begin_pothole_ai_analysis',
        'admin_complete_pothole_ai_analysis',
        'admin_release_pothole_ai_analysis',
        'admin_get_pothole_ai_summary'
      )
  ),
  true,
  'all AI RPCs are SECURITY DEFINER with an empty search_path'
);

select ok(
  lock_order.parent_lock_position > 0
    and lock_order.lease_lock_position > lock_order.parent_lock_position,
  'AI completion locks the pothole before its exact lease to prevent lock-order deadlocks'
)
from (
  select
    strpos(
      normalized.v_body,
      'perform 1 from public.potholes as p where p.id = v_candidate_pothole_id for update;'
    ) as parent_lock_position,
    strpos(
      normalized.v_body,
      'select paal.* into v_lease from private.pothole_ai_analysis_leases as paal where paal.request_id = p_request_id and paal.pothole_id = v_candidate_pothole_id for update;'
    ) as lease_lock_position
  from (
    select regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g') as v_body
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_complete_pothole_ai_analysis'
  ) as normalized
) as lock_order;

select ok(
  begin_order.parent_lock_position > 0
    and begin_order.post_lock_idempotency_position > 0
    and begin_order.lease_check_position > begin_order.post_lock_idempotency_position,
  'AI begin rechecks completed-request idempotency after its pothole lock and before lease work'
)
from (
  select
    located.parent_lock_position,
    strpos(
      substring(located.v_body from located.parent_lock_position + 1),
      'from public.pothole_ai_assessments as paa join public.potholes as p on p.id = paa.pothole_id where paa.request_id = p_request_id;'
    ) as post_lock_idempotency_position,
    strpos(
      substring(located.v_body from located.parent_lock_position + 1),
      'from private.pothole_ai_analysis_leases as paal where paal.request_id = p_request_id and paal.expires_at > clock_timestamp()'
    ) as lease_check_position
  from (
    select
      normalized.v_body,
      strpos(
        normalized.v_body,
        'select p.id into v_pothole_id from public.potholes as p where p.public_id = p_public_id for update;'
      ) as parent_lock_position
    from (
      select regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g') as v_body
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'admin_begin_pothole_ai_analysis'
    ) as normalized
  ) as located
) as begin_order;

select is(
  has_function_privilege(
    'service_role',
    'public.admin_begin_pothole_ai_analysis(text, uuid, uuid)'::regprocedure,
    'execute'
  ),
  true,
  'service_role can invoke the AI begin RPC'
);

select is(
  has_function_privilege(
    'anon',
    'public.admin_begin_pothole_ai_analysis(text, uuid, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot invoke the AI begin RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_begin_pothole_ai_analysis(text, uuid, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot invoke the AI begin RPC directly'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_complete_pothole_ai_analysis(uuid, uuid, text, text, text, text, text, double precision, text, text, text[], text[], text, integer, text, text)'::regprocedure,
    'execute'
  ),
  true,
  'service_role can invoke the AI completion RPC'
);

select is(
  has_function_privilege(
    'anon',
    'public.admin_complete_pothole_ai_analysis(uuid, uuid, text, text, text, text, text, double precision, text, text, text[], text[], text, integer, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot invoke the AI completion RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_complete_pothole_ai_analysis(uuid, uuid, text, text, text, text, text, double precision, text, text, text[], text[], text, integer, text, text)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot invoke the AI completion RPC directly'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_release_pothole_ai_analysis(uuid, uuid)'::regprocedure,
    'execute'
  ),
  true,
  'service_role can invoke the AI lease-release RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_release_pothole_ai_analysis(uuid, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot invoke the AI lease-release RPC directly'
);

select is(
  has_function_privilege(
    'anon',
    'public.admin_release_pothole_ai_analysis(uuid, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot invoke the AI lease-release RPC'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_get_pothole_ai_summary(text, uuid)'::regprocedure,
    'execute'
  ),
  true,
  'service_role can invoke the AI summary RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_get_pothole_ai_summary(text, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated cannot invoke the AI summary RPC directly'
);

select is(
  has_function_privilege(
    'anon',
    'public.admin_get_pothole_ai_summary(text, uuid)'::regprocedure,
    'execute'
  ),
  false,
  'anon cannot invoke the AI summary RPC'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000021', 'ai-admin@example.test'),
  ('00000000-0000-4000-8000-000000000022', 'ai-non-admin@example.test'),
  ('00000000-0000-4000-8000-000000000023', 'ai-citizen@example.test'),
  ('00000000-0000-4000-8000-000000000024', 'ai-other-admin@example.test');

insert into public.admin_users (user_id, is_active)
values
  ('00000000-0000-4000-8000-000000000021', true),
  ('00000000-0000-4000-8000-000000000024', true);

insert into public.potholes (
  id,
  public_id,
  status,
  canonical_location,
  report_count,
  created_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'MTL-920000',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5700, 45.5100), 4326)::extensions.geography,
    0,
    '2026-09-01T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'MTL-920001',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5701, 45.5101), 4326)::extensions.geography,
    3,
    '2026-09-01T00:00:00Z'
  );

insert into public.reports (
  id,
  pothole_id,
  reported_location,
  severity,
  reporter_user_id,
  submission_id,
  created_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    extensions.st_setsrid(extensions.st_makepoint(-73.5701, 45.5101), 4326)::extensions.geography,
    'SMALL'::public.report_severity,
    '00000000-0000-4000-8000-000000000023',
    '60000000-0000-4000-8000-000000000001',
    '2026-09-01T10:00:00Z'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    extensions.st_setsrid(extensions.st_makepoint(-73.5701, 45.5101), 4326)::extensions.geography,
    'MEDIUM'::public.report_severity,
    '00000000-0000-4000-8000-000000000023',
    '60000000-0000-4000-8000-000000000002',
    '2026-09-01T11:00:00Z'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000002',
    extensions.st_setsrid(extensions.st_makepoint(-73.5701, 45.5101), 4326)::extensions.geography,
    'DANGEROUS'::public.report_severity,
    '00000000-0000-4000-8000-000000000023',
    '60000000-0000-4000-8000-000000000003',
    '2026-09-01T12:00:00Z'
  );

insert into public.report_photos (
  id,
  report_id,
  storage_path,
  mime_type,
  file_size_bytes,
  created_at
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000001.jpg',
    'image/jpeg',
    1001,
    '2026-09-01T10:01:00Z'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    'test-evidence/old-report-second.jpg',
    'image/jpeg',
    1002,
    '2026-09-01T10:02:00Z'
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000002',
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000002.jpg',
    'image/jpeg',
    1003,
    '2026-09-01T11:01:00Z'
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000003',
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000003.jpg',
    'image/jpeg',
    1004,
    '2026-09-01T12:01:00Z'
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000003',
    'test-evidence/new-report-second.jpg',
    'image/jpeg',
    1005,
    '2026-09-01T12:02:00Z'
  );

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-920000',
    '00000000-0000-4000-8000-000000000021',
    '80000000-0000-4000-8000-000000000001'
  )->>'outcome',
  'NO_USABLE_PHOTOS',
  'a pothole without usable photos returns no_usable_photos before a paid call'
);

select is(
  (
    select count(*)
    from private.pothole_ai_analysis_leases as paal
    where paal.pothole_id = '40000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the no-photo outcome does not acquire a lease'
);

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-920001',
    '00000000-0000-4000-8000-000000000022',
    '80000000-0000-4000-8000-000000000002'
  )->>'outcome',
  'ACTOR_NOT_AUTHORIZED',
  'an authenticated non-admin fails the database membership recheck'
);

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-92',
    '00000000-0000-4000-8000-000000000021',
    '80000000-0000-4000-8000-000000000003'
  )->>'outcome',
  'INVALID_INPUT',
  'the begin RPC independently rejects a malformed public ID'
);

create temporary table first_ai_begin on commit drop as
select public.admin_begin_pothole_ai_analysis(
  'MTL-920001',
  '00000000-0000-4000-8000-000000000021',
  '80000000-0000-4000-8000-000000000004'
) as result;

select is(
  (select result->>'outcome' from first_ai_begin),
  'READY',
  'an active administrator can acquire the AI analysis path'
);

select is(
  (select jsonb_array_length(result->'photos') from first_ai_begin),
  3,
  'the server selects at most three usable photos'
);

select is(
  (
    select array_agg(photo.value->>'storage_path' order by photo.ordinality)
    from first_ai_begin as first_begin
    cross join lateral jsonb_array_elements(first_begin.result->'photos')
      with ordinality as photo(value, ordinality)
  ),
  array[
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000003.jpg',
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000002.jpg',
    'submissions/00000000-0000-4000-8000-000000000023/60000000-0000-4000-8000-000000000001.jpg'
  ]::text[],
  'photo selection deterministically takes one photo per newest report before extras'
);

select is(
  (
    select paal.selected_photo_ids
    from private.pothole_ai_analysis_leases as paal
    where paal.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  array[
    '70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000001'
  ]::uuid[],
  'the lease binds the request to the exact ordered maximum-three evidence set'
);

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-920001',
    '00000000-0000-4000-8000-000000000021',
    '80000000-0000-4000-8000-000000000005'
  )->>'outcome',
  'ANALYSIS_IN_PROGRESS',
  'a concurrent request cannot acquire a second paid-call lease'
);

select is(
  (
    select count(*)
    from private.pothole_ai_analysis_leases as paal
    where paal.pothole_id = '40000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'concurrent begin attempts leave exactly one pothole lease'
);

create temporary table first_ai_completion on commit drop as
select public.admin_complete_pothole_ai_analysis(
  '80000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000021',
  'openai',
  'gpt-5.6-terra',
  'pothole-vision-v1',
  'pothole-assessment-v1',
  'likely_pothole',
  0.97,
  'usable',
  null,
  array['Visible localized cavity', 'Broken pavement edge']::text[],
  array['No reliable depth scale']::text[],
  'Visible evidence is consistent with a pothole.',
  2,
  repeat('a', 64),
  'resp_test_first'
) as result;

select is(
  (select result->>'outcome' from first_ai_completion),
  'COMPLETED',
  'the completion RPC persists a successful structured assessment'
);

select is(
  (select (result->>'assessment_count')::integer from first_ai_completion),
  1,
  'first completion returns the authoritative assessment count'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.pothole_id = '40000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'first completion appends exactly one assessment row'
);

select is(
  (
    select paa.input_photo_count::integer
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  2,
  'completion records the usable subset count without exceeding selected evidence'
);

select is(
  (
    select paa.input_evidence_sha256
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  repeat('a', 64),
  'completion records a path-free SHA-256 evidence fingerprint'
);

select is(
  (
    select paa.suggested_severity::text
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  null,
  'the provider unknown severity is persisted as NULL'
);

select is(
  (select p.status::text from public.potholes as p where p.public_id = 'MTL-920001'),
  'REPORTED',
  'AI completion does not change pothole status'
);

select is(
  (select p.report_count from public.potholes as p where p.public_id = 'MTL-920001'),
  3,
  'AI completion does not change report_count'
);

select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    where pse.pothole_id = '40000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'AI completion does not create a human moderation event'
);

select is(
  (
    select count(*)
    from private.pothole_ai_analysis_leases as paal
    where paal.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'successful completion removes its paid-call lease'
);

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-920001',
    '00000000-0000-4000-8000-000000000021',
    '80000000-0000-4000-8000-000000000004'
  )->>'outcome',
  'ALREADY_COMPLETED',
  'a repeated begin returns the completed request instead of acquiring a new paid-call lease'
);

create temporary table first_ai_retry on commit drop as
select public.admin_complete_pothole_ai_analysis(
  '80000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000021',
  'openai',
  'gpt-5.6-terra',
  'pothole-vision-v1',
  'pothole-assessment-v1',
  'likely_pothole',
  0.97,
  'usable',
  null,
  array['Visible localized cavity', 'Broken pavement edge']::text[],
  array['No reliable depth scale']::text[],
  'Visible evidence is consistent with a pothole.',
  2,
  repeat('a', 64),
  'resp_test_first'
) as result;

select is(
  (select result->>'outcome' from first_ai_retry),
  'ALREADY_COMPLETED',
  'a database-response retry returns the existing request result'
);

select is(
  (select (result->>'assessment_count')::integer from first_ai_retry),
  1,
  'an idempotent completion retry returns the unchanged authoritative count'
);

select is(
  (select result->'assessment' from first_ai_retry),
  (select result->'assessment' from first_ai_completion),
  'an idempotent completion retry returns the original assessment DTO'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'an idempotent completion retry creates no second row'
);

select throws_ok(
  $$
    update public.pothole_ai_assessments as paa
    set summary = 'Mutated'
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  $$,
  '55000',
  'Pothole AI assessments are append-only',
  'the immutable-history trigger rejects assessment updates'
);

select throws_ok(
  $$
    delete from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  $$,
  '55000',
  'Pothole AI assessments are append-only',
  'the immutable-history trigger rejects assessment deletes'
);

create temporary table second_ai_begin on commit drop as
select public.admin_begin_pothole_ai_analysis(
  'MTL-920001',
  '00000000-0000-4000-8000-000000000021',
  '80000000-0000-4000-8000-000000000006'
) as result;

select is(
  (select result->>'outcome' from second_ai_begin),
  'READY',
  'a new request ID starts a new immutable analysis rather than reusing history'
);

create temporary table second_ai_completion on commit drop as
select public.admin_complete_pothole_ai_analysis(
  '80000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000021',
  'openai',
  'gpt-5.6-terra',
  'pothole-vision-v1',
  'pothole-assessment-v1',
  'uncertain',
  0.54,
  'poor',
  'MEDIUM',
  array['Irregular dark pavement area']::text[],
  array['Shadow obscures the boundary']::text[],
  'The visible evidence is insufficient for a confident classification.',
  3,
  repeat('b', 64),
  'resp_test_second'
) as result;

select is(
  (select result->>'outcome' from second_ai_completion),
  'COMPLETED',
  'a second successful run appends another assessment'
);

select is(
  (select (result->>'assessment_count')::integer from second_ai_completion),
  2,
  'second completion returns an assessment count of two'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.pothole_id = '40000000-0000-4000-8000-000000000002'
  ),
  2::bigint,
  'both successful runs remain in append-only history'
);

select is(
  (
    select paa.summary
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000004'
  ),
  'Visible evidence is consistent with a pothole.',
  'the second run leaves the first assessment unchanged'
);

create temporary table latest_ai_summary on commit drop as
select public.admin_get_pothole_ai_summary(
  'MTL-920001',
  '00000000-0000-4000-8000-000000000021'
) as result;

select is(
  (select result->>'outcome' from latest_ai_summary),
  'OK',
  'an active admin can load the persisted AI summary'
);

select is(
  (select (result->>'assessment_count')::integer from latest_ai_summary),
  2,
  'the AI summary reports the complete immutable history count'
);

select is(
  (select result->'assessment'->>'classification' from latest_ai_summary),
  'uncertain',
  'the AI summary returns the latest successful assessment'
);

select is(
  (
    select array_agg(assessment_key order by assessment_key)
    from latest_ai_summary as latest
    cross join lateral jsonb_object_keys(latest.result->'assessment') as assessment_key
  ),
  array[
    'cautions',
    'classification',
    'confidence',
    'created_at',
    'input_photo_count',
    'model',
    'photo_quality',
    'prompt_version',
    'provider',
    'schema_version',
    'suggested_severity',
    'summary',
    'visible_evidence'
  ]::text[],
  'the browser summary is an explicit sanitized allowlist'
);

select is(
  (
    select
      latest.result::text like '%storage_path%'
      or latest.result::text like '%requested_by_user_id%'
      or latest.result::text like '%provider_response_id%'
      or latest.result::text like '%input_evidence_sha256%'
    from latest_ai_summary as latest
  ),
  false,
  'the summary excludes paths, actor identity, provider IDs, and evidence fingerprints'
);

select is(
  (select p.status::text from public.potholes as p where p.public_id = 'MTL-920001'),
  'REPORTED',
  'multiple AI runs still do not change pothole status'
);

select is(
  (select p.report_count from public.potholes as p where p.public_id = 'MTL-920001'),
  3,
  'multiple AI runs still do not change report_count'
);

select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    where pse.pothole_id = '40000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'multiple AI runs still create no human moderation events'
);

select is(
  public.admin_get_pothole_ai_summary(
    'MTL-920001',
    '00000000-0000-4000-8000-000000000022'
  )->>'outcome',
  'ACTOR_NOT_AUTHORIZED',
  'a non-admin cannot read the AI assessment summary through the RPC'
);

select is(
  public.admin_get_pothole_ai_summary(
    'MTL-929999',
    '00000000-0000-4000-8000-000000000021'
  )->>'outcome',
  'NOT_FOUND',
  'the summary returns a safe not-found outcome'
);

select is(
  public.admin_begin_pothole_ai_analysis(
    'MTL-920001',
    '00000000-0000-4000-8000-000000000021',
    '80000000-0000-4000-8000-000000000007'
  )->>'outcome',
  'READY',
  'a later request can acquire a fresh lease'
);

select is(
  public.admin_complete_pothole_ai_analysis(
    '80000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000024',
    'openai',
    'gpt-5.6-terra',
    'pothole-vision-v1',
    'pothole-assessment-v1',
    'likely_pothole',
    0.9,
    'usable',
    'MEDIUM',
    array['Visible localized cavity']::text[],
    array['No reliable depth scale']::text[],
    'Visible evidence is consistent with a pothole.',
    1,
    repeat('c', 64),
    'resp_test_wrong_actor'
  )->>'outcome',
  'LEASE_NOT_FOUND',
  'another active administrator cannot complete the lease owner''s request'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.request_id = '80000000-0000-4000-8000-000000000007'
  ),
  0::bigint,
  'a wrong-actor completion attempt persists no assessment'
);

select is(
  public.admin_release_pothole_ai_analysis(
    '80000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000024'
  ),
  false,
  'another active administrator cannot release the lease owner''s request'
);

select is(
  (
    select count(*)
    from private.pothole_ai_analysis_leases as paal
    where paal.request_id = '80000000-0000-4000-8000-000000000007'
  ),
  1::bigint,
  'an unauthorized release attempt leaves the lease intact'
);

select is(
  public.admin_release_pothole_ai_analysis(
    '80000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000021'
  ),
  true,
  'the active administrator can safely release the exact unfinished lease'
);

select is(
  (
    select count(*)
    from private.pothole_ai_analysis_leases as paal
    where paal.request_id = '80000000-0000-4000-8000-000000000007'
  ),
  0::bigint,
  'successful release removes only the matching unfinished lease'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.request_id in (
      '80000000-0000-4000-8000-000000000004',
      '80000000-0000-4000-8000-000000000006'
    )
  ),
  2::bigint,
  'lease release does not remove completed assessment history'
);

select is(
  (
    select count(*)
    from pg_policies as pp
    where pp.schemaname = 'public'
      and pp.tablename = 'pothole_ai_assessments'
  ),
  0::bigint,
  'no permissive RLS policy exposes the assessment table'
);

select is(
  (
    select count(*)
    from pg_policies as pp
    where pp.schemaname = 'private'
      and pp.tablename = 'pothole_ai_analysis_leases'
  ),
  0::bigint,
  'no RLS policy exposes the private lease table'
);

select is(
  has_table_privilege('anon', 'private.pothole_ai_analysis_leases', 'select'),
  false,
  'anon has no direct access to the private lease table'
);

select is(
  has_table_privilege('authenticated', 'private.pothole_ai_analysis_leases', 'select'),
  false,
  'authenticated has no direct access to the private lease table'
);

select is(
  has_table_privilege('service_role', 'private.pothole_ai_analysis_leases', 'select'),
  false,
  'service_role also uses only RPCs for private lease access'
);

select is(
  (
    select count(*)
    from information_schema.table_privileges as tp
    where (tp.table_schema, tp.table_name) in (
        ('public', 'pothole_ai_assessments'),
        ('private', 'pothole_ai_analysis_leases')
      )
      and tp.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ),
  0::bigint,
  'no public, browser, or service-role table grant bypasses the AI RPC contract'
);

select is(
  (
    select count(*)
    from public.pothole_ai_assessments as paa
    where paa.provider_response_id is not null
      and paa.provider = 'openai'
      and paa.model = 'gpt-5.6-terra'
      and paa.prompt_version = 'pothole-vision-v1'
      and paa.schema_version = 'pothole-assessment-v1'
  ),
  2::bigint,
  'immutable provider/model/prompt/schema metadata supports later calibration analysis'
);

select * from finish();
rollback;
