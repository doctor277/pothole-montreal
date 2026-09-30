-- M10.5: bounded read-only companion to the existing human queue RPC.
-- No labels are persisted, no table access is widened, and no AI is invoked.
-- now()/created_at is transaction-start time: a finalizer may wait on the
-- pothole lock before inserting evidence. Capture actual insert time for new
-- rows without rewriting finalizers or backfilling/altering historical rows.
alter table public.reports add column evidence_recorded_at timestamptz;
alter table public.reports alter column evidence_recorded_at set default clock_timestamp();
alter table public.report_photos add column evidence_recorded_at timestamptz;
alter table public.report_photos alter column evidence_recorded_at set default clock_timestamp();
comment on column public.reports.evidence_recorded_at is
  'Insert-time evidence boundary for shadow triage. NULL historical rows fall back to created_at.';
comment on column public.report_photos.evidence_recorded_at is
  'Insert-time evidence boundary for shadow triage. NULL historical rows fall back to created_at.';

create or replace function public.admin_get_queue_ai_triage_inputs(
  p_public_ids text[],
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if p_actor_user_id is null or p_public_ids is null
    or cardinality(p_public_ids) < 1 or cardinality(p_public_ids) > 50
    or array_ndims(p_public_ids) <> 1
    or exists (
      select 1 from unnest(p_public_ids) as requested(v_public_id)
      where requested.v_public_id is null or requested.v_public_id !~ '^MTL-[0-9]{6}$'
    )
    or (select count(distinct requested.v_public_id) from unnest(p_public_ids) as requested(v_public_id)) <> cardinality(p_public_ids) then
    return jsonb_build_object('outcome', 'INVALID_INPUT', 'items', '[]'::jsonb);
  end if;

  if not exists (
    select 1 from public.admin_users as au
    where au.user_id = p_actor_user_id and au.is_active
  ) then
    return jsonb_build_object('outcome', 'ACTOR_NOT_AUTHORIZED', 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'public_id', p.public_id,
    'assessment', case when latest.id is null then null else jsonb_build_object(
      'classification', latest.classification,
      'confidence', latest.confidence,
      'photo_quality', latest.photo_quality,
      'suggested_severity', latest.suggested_severity,
      'input_photo_count', latest.input_photo_count,
      'model', latest.model,
      'prompt_version', latest.prompt_version,
      'schema_version', latest.schema_version,
      'requested_at', latest.requested_at,
      'created_at', latest.created_at
    ) end,
    'latest_evidence_created_at', evidence.v_latest_at,
    -- Use evidence-selection/request time rather than completion time, so
    -- reports/photos added during a provider call invalidate its queue hint.
    -- Keep the comparison in PostgreSQL to retain microsecond precision.
    'evidence_changed_since_assessment', coalesce(evidence.v_latest_at > latest.requested_at, false)
  ) order by p.public_id), '[]'::jsonb)
  into v_items
  from public.potholes as p
  left join lateral (
    select paa.id, paa.classification, paa.confidence, paa.photo_quality,
      paa.suggested_severity, paa.input_photo_count, paa.model, paa.prompt_version,
      paa.schema_version, paa.requested_at, paa.created_at
    from public.pothole_ai_assessments as paa
    where paa.pothole_id = p.id
    order by paa.created_at desc, paa.id desc
    limit 1
  ) as latest on true
  left join lateral (
    select greatest(
      max(coalesce(r.evidence_recorded_at, r.created_at)),
      max(coalesce(rp.evidence_recorded_at, rp.created_at))
    ) as v_latest_at
    from public.reports as r
    left join public.report_photos as rp on rp.report_id = r.id
    where r.pothole_id = p.id
  ) as evidence on true
  where p.public_id = any(p_public_ids);

  return jsonb_build_object('outcome', 'OK', 'items', v_items);
end;
$$;

revoke all on function public.admin_get_queue_ai_triage_inputs(text[], uuid)
from public, anon, authenticated, service_role;
grant execute on function public.admin_get_queue_ai_triage_inputs(text[], uuid) to service_role;

comment on function public.admin_get_queue_ai_triage_inputs(text[], uuid) is
  'Service-role-only, active-admin, bounded latest-assessment/evidence metadata read for pure shadow triage. No images, paths, identities, telemetry, or mutation.';
