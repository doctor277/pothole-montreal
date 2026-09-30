begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(23);

select is(
  (
    select c.relrowsecurity
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'admin_users'
  ),
  true,
  'admin_users has row-level security enabled'
);

select is(
  has_table_privilege('authenticated', 'public.admin_users', 'select'),
  false,
  'authenticated users cannot read the administrator allowlist directly'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_transition_pothole_status(text, uuid, public.pothole_status, text)'::regprocedure,
    'execute'
  ),
  false,
  'authenticated users cannot call the moderation transition RPC directly'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_transition_pothole_status(text, uuid, public.pothole_status, text)'::regprocedure,
    'execute'
  ),
  true,
  'only the service role has the moderation transition RPC grant'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000011', 'active-admin@example.test'),
  ('00000000-0000-4000-8000-000000000012', 'non-admin@example.test');

insert into public.admin_users (user_id, is_active)
values ('00000000-0000-4000-8000-000000000011', true);

insert into public.potholes (
  id,
  public_id,
  status,
  canonical_location,
  report_count
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'MTL-910001',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5601, 45.5001), 4326)::extensions.geography,
    1
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'MTL-910002',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5602, 45.5002), 4326)::extensions.geography,
    1
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'MTL-910003',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5603, 45.5003), 4326)::extensions.geography,
    1
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'MTL-910004',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5604, 45.5004), 4326)::extensions.geography,
    1
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    'MTL-910005',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5605, 45.5005), 4326)::extensions.geography,
    1
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    'MTL-910006',
    'REPORTED'::public.pothole_status,
    extensions.st_setsrid(extensions.st_makepoint(-73.5606, 45.5006), 4326)::extensions.geography,
    1
  );

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910001',
      '00000000-0000-4000-8000-000000000011',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'UPDATED',
  'an active admin can start review from REPORTED'
);

select is(
  (select status::text from public.potholes where public_id = 'MTL-910001'),
  'UNDER_REVIEW',
  'start review updates the canonical pothole status'
);

select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    join public.potholes as p on p.id = pse.pothole_id
    where p.public_id = 'MTL-910001'
      and pse.from_status = 'REPORTED'::public.pothole_status
      and pse.to_status = 'UNDER_REVIEW'::public.pothole_status
      and pse.actor_user_id = '00000000-0000-4000-8000-000000000011'
  ),
  1::bigint,
  'start review appends exactly one matching audit event'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910001',
      '00000000-0000-4000-8000-000000000011',
      'VERIFIED'::public.pothole_status,
      null
    )
  ),
  'UPDATED',
  'an active admin can verify an under-review pothole'
);

select is(
  (select status::text from public.potholes where public_id = 'MTL-910001'),
  'VERIFIED',
  'verification updates status without skipping the workflow'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910002',
      '00000000-0000-4000-8000-000000000011',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'UPDATED',
  'the rejection test pothole can enter review'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910002',
      '00000000-0000-4000-8000-000000000011',
      'REJECTED'::public.pothole_status,
      'Not a road defect'
    )
  ),
  'UPDATED',
  'an active admin can reject an under-review pothole with a reason'
);

select is(
  (
    select reason
    from public.pothole_status_events as pse
    join public.potholes as p on p.id = pse.pothole_id
    where p.public_id = 'MTL-910002'
      and pse.to_status = 'REJECTED'::public.pothole_status
  ),
  'Not a road defect',
  'the rejection reason is preserved in the append-only audit event'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910003',
      '00000000-0000-4000-8000-000000000011',
      'VERIFIED'::public.pothole_status,
      null
    )
  ),
  'INVALID_TRANSITION',
  'REPORTED cannot skip directly to VERIFIED'
);

select is(
  (select status::text from public.potholes where public_id = 'MTL-910003'),
  'REPORTED',
  'an invalid transition leaves the canonical status unchanged'
);

select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    join public.potholes as p on p.id = pse.pothole_id
    where p.public_id = 'MTL-910003'
  ),
  0::bigint,
  'an invalid transition creates no audit event'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910004',
      '00000000-0000-4000-8000-000000000011',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'UPDATED',
  'the missing-reason test pothole can enter review'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910004',
      '00000000-0000-4000-8000-000000000011',
      'REJECTED'::public.pothole_status,
      null
    )
  ),
  'INVALID_INPUT',
  'rejection without a reason is rejected by the database'
);

select is(
  (select status::text from public.potholes where public_id = 'MTL-910004'),
  'UNDER_REVIEW',
  'a rejected missing-reason request leaves status unchanged'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910005',
      '00000000-0000-4000-8000-000000000011',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'UPDATED',
  'the stale-transition test pothole can enter review once'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910005',
      '00000000-0000-4000-8000-000000000011',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'INVALID_TRANSITION',
  'a stale second transition is a safe conflict'
);

select is(
  (
    select count(*)
    from public.pothole_status_events as pse
    join public.potholes as p on p.id = pse.pothole_id
    where p.public_id = 'MTL-910005'
  ),
  1::bigint,
  'a stale transition does not append a second audit event'
);

select is(
  (
    select outcome
    from public.admin_transition_pothole_status(
      'MTL-910006',
      '00000000-0000-4000-8000-000000000012',
      'UNDER_REVIEW'::public.pothole_status,
      null
    )
  ),
  'ACTOR_NOT_AUTHORIZED',
  'an authenticated non-admin cannot mutate a pothole'
);

select is(
  (select status::text from public.potholes where public_id = 'MTL-910006'),
  'REPORTED',
  'a non-admin mutation attempt leaves the pothole unchanged'
);

select * from finish();
rollback;
