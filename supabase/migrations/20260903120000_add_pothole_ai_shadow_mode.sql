-- Milestone 10: privileged, admin-triggered pothole vision assessment in
-- shadow mode. AI assessments are immutable evidence only: none of the RPCs
-- in this migration update pothole status, report_count, or human audit rows.

create type public.pothole_ai_classification as enum (
  'likely_pothole',
  'uncertain',
  'unlikely_pothole'
);

create type public.pothole_ai_photo_quality as enum (
  'good',
  'usable',
  'poor'
);

create table public.pothole_ai_assessments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  pothole_id uuid not null references public.potholes(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider = 'openai'),
  model text not null check (btrim(model) <> '' and char_length(model) <= 128),
  prompt_version text not null check (
    btrim(prompt_version) <> '' and char_length(prompt_version) <= 64
  ),
  schema_version text not null check (
    btrim(schema_version) <> '' and char_length(schema_version) <= 64
  ),
  classification public.pothole_ai_classification not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  photo_quality public.pothole_ai_photo_quality not null,
  -- NULL deliberately represents the provider contract's "unknown" value.
  suggested_severity public.report_severity,
  visible_evidence text[] not null check (
    cardinality(visible_evidence) between 0 and 5
    and array_position(visible_evidence, null) is null
  ),
  cautions text[] not null check (
    cardinality(cautions) between 0 and 5
    and array_position(cautions, null) is null
  ),
  summary text not null check (btrim(summary) <> '' and char_length(summary) <= 500),
  input_photo_count smallint not null check (input_photo_count between 1 and 3),
  -- Fingerprint of the exact usable evidence sent to the provider. It enables
  -- later evidence-set comparisons without retaining URLs, paths, or bytes.
  input_evidence_sha256 text not null check (
    input_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  provider_response_id text check (
    provider_response_id is null
    or (btrim(provider_response_id) <> '' and char_length(provider_response_id) <= 255)
  ),
  requested_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create index pothole_ai_assessments_pothole_created_at_idx
on public.pothole_ai_assessments (pothole_id, created_at desc, id desc);

-- This private table is a short-lived cross-isolate paid-call guard. It stores
-- only internal photo row identifiers, never Storage paths or signed URLs.
create table private.pothole_ai_analysis_leases (
  pothole_id uuid primary key references public.potholes(id) on delete cascade,
  request_id uuid not null unique,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  selected_photo_ids uuid[] not null check (
    cardinality(selected_photo_ids) between 1 and 3
    and array_position(selected_photo_ids, null) is null
  ),
  acquired_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (
    expires_at > acquired_at
    and expires_at <= acquired_at + interval '5 minutes'
  )
);

alter table public.pothole_ai_assessments enable row level security;
alter table private.pothole_ai_analysis_leases enable row level security;

-- Default deny at both the Data API and direct table-privilege layers. Even
-- service_role must use the reviewed RPC boundary rather than table access.
revoke all on table public.pothole_ai_assessments
from public, anon, authenticated, service_role;

revoke all on table private.pothole_ai_analysis_leases
from public, anon, authenticated, service_role;

revoke all on type public.pothole_ai_classification
from public, anon, authenticated, service_role;

revoke all on type public.pothole_ai_photo_quality
from public, anon, authenticated, service_role;

-- Enforce immutable assessment history independently of grants. Completion
-- retries read the existing row; no supported path updates or deletes it.
create or replace function private.prevent_pothole_ai_assessment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Pothole AI assessments are append-only' using errcode = '55000';
end;
$$;

revoke all on function private.prevent_pothole_ai_assessment_mutation()
from public, anon, authenticated, service_role;

create trigger prevent_pothole_ai_assessment_mutation
before update or delete on public.pothole_ai_assessments
for each row
execute function private.prevent_pothole_ai_assessment_mutation();

-- Acquires a per-pothole lease only after finding usable evidence. Pothole-row
-- locking serializes concurrent begin requests across Edge Function isolates.
-- The returned paths are server-only input to private Storage downloads and
-- must never be forwarded to the admin browser or AI provider.
create or replace function public.admin_begin_pothole_ai_analysis(
  p_public_id text,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pothole_id uuid;
  v_existing_actor_user_id uuid;
  v_existing_public_id text;
  v_photo_ids uuid[];
  v_photos jsonb;
  v_acquired_at timestamptz;
begin
  if p_actor_user_id is null
    or p_request_id is null
    or p_public_id is null
    or p_public_id !~ '^MTL-[0-9]{6}$' then
    return jsonb_build_object('outcome', 'INVALID_INPUT', 'photos', '[]'::jsonb);
  end if;

  if not exists (
    select 1
    from public.admin_users as au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    return jsonb_build_object('outcome', 'ACTOR_NOT_AUTHORIZED', 'photos', '[]'::jsonb);
  end if;

  -- A completed request ID is only an idempotency signal. It never reuses a
  -- recent assessment for a different request or a changed evidence set.
  select
    p.public_id,
    paa.requested_by_user_id
  into
    v_existing_public_id,
    v_existing_actor_user_id
  from public.pothole_ai_assessments as paa
  join public.potholes as p on p.id = paa.pothole_id
  where paa.request_id = p_request_id;

  if found then
    if v_existing_actor_user_id = p_actor_user_id
      and v_existing_public_id = p_public_id then
      return jsonb_build_object('outcome', 'ALREADY_COMPLETED', 'photos', '[]'::jsonb);
    end if;

    return jsonb_build_object('outcome', 'INVALID_INPUT', 'photos', '[]'::jsonb);
  end if;

  select p.id
  into v_pothole_id
  from public.potholes as p
  where p.public_id = p_public_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'NOT_FOUND', 'photos', '[]'::jsonb);
  end if;

  -- Completion takes this same parent-row lock before it inserts and removes
  -- the lease. Recheck after waiting so a same-request begin cannot miss the
  -- newly committed assessment and start a duplicate paid provider call.
  select
    p.public_id,
    paa.requested_by_user_id
  into
    v_existing_public_id,
    v_existing_actor_user_id
  from public.pothole_ai_assessments as paa
  join public.potholes as p on p.id = paa.pothole_id
  where paa.request_id = p_request_id;

  if found then
    if v_existing_actor_user_id = p_actor_user_id
      and v_existing_public_id = p_public_id then
      return jsonb_build_object('outcome', 'ALREADY_COMPLETED', 'photos', '[]'::jsonb);
    end if;

    return jsonb_build_object('outcome', 'INVALID_INPUT', 'photos', '[]'::jsonb);
  end if;

  -- A UUID collision with a live lease is treated as in progress without
  -- revealing which pothole or administrator owns it.
  if exists (
    select 1
    from private.pothole_ai_analysis_leases as paal
    where paal.request_id = p_request_id
      and paal.expires_at > clock_timestamp()
  ) then
    return jsonb_build_object('outcome', 'ANALYSIS_IN_PROGRESS', 'photos', '[]'::jsonb);
  end if;

  delete from private.pothole_ai_analysis_leases as paal
  where paal.pothole_id = v_pothole_id
    and paal.expires_at <= clock_timestamp();

  if exists (
    select 1
    from private.pothole_ai_analysis_leases as paal
    where paal.pothole_id = v_pothole_id
  ) then
    return jsonb_build_object('outcome', 'ANALYSIS_IN_PROGRESS', 'photos', '[]'::jsonb);
  end if;

  -- Rank within each report first, then globally order by that rank. This
  -- yields one photo from each of up to three newest reports before taking a
  -- second photo from any report. Every tie-breaker is explicit.
  with ranked_photos as (
    select
      rp.id as v_photo_id,
      rp.storage_path as v_storage_path,
      rp.mime_type as v_mime_type,
      rp.file_size_bytes as v_file_size_bytes,
      rp.created_at as v_photo_created_at,
      r.id as v_report_id,
      r.created_at as v_report_created_at,
      row_number() over (
        partition by r.id
        order by rp.created_at asc, rp.id asc
      ) as v_photo_rank
    from public.reports as r
    join public.report_photos as rp on rp.report_id = r.id
    where r.pothole_id = v_pothole_id
      and (rp.mime_type is null or rp.mime_type = 'image/jpeg')
      and (
        rp.file_size_bytes is null
        or rp.file_size_bytes between 1 and 10485760
      )
  ), selected_photos as (
    select
      ranked.v_photo_id,
      ranked.v_storage_path,
      ranked.v_mime_type,
      ranked.v_file_size_bytes,
      ranked.v_photo_created_at,
      ranked.v_report_id,
      ranked.v_report_created_at,
      ranked.v_photo_rank
    from ranked_photos as ranked
    order by
      ranked.v_photo_rank asc,
      ranked.v_report_created_at desc,
      ranked.v_report_id desc,
      ranked.v_photo_created_at asc,
      ranked.v_photo_id asc
    limit 3
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'photo_id', selected.v_photo_id,
          'storage_path', selected.v_storage_path,
          'mime_type', selected.v_mime_type,
          'file_size_bytes', selected.v_file_size_bytes,
          'created_at', selected.v_photo_created_at
        )
        order by
          selected.v_photo_rank asc,
          selected.v_report_created_at desc,
          selected.v_report_id desc,
          selected.v_photo_created_at asc,
          selected.v_photo_id asc
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(
        selected.v_photo_id
        order by
          selected.v_photo_rank asc,
          selected.v_report_created_at desc,
          selected.v_report_id desc,
          selected.v_photo_created_at asc,
          selected.v_photo_id asc
      ),
      '{}'::uuid[]
    )
  into
    v_photos,
    v_photo_ids
  from selected_photos as selected;

  if cardinality(v_photo_ids) = 0 then
    return jsonb_build_object('outcome', 'NO_USABLE_PHOTOS', 'photos', '[]'::jsonb);
  end if;

  v_acquired_at := clock_timestamp();

  begin
    insert into private.pothole_ai_analysis_leases as paal (
      pothole_id,
      request_id,
      requested_by_user_id,
      selected_photo_ids,
      acquired_at,
      expires_at
    )
    values (
      v_pothole_id,
      p_request_id,
      p_actor_user_id,
      v_photo_ids,
      v_acquired_at,
      v_acquired_at + interval '2 minutes'
    );
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'ANALYSIS_IN_PROGRESS', 'photos', '[]'::jsonb);
  end;

  return jsonb_build_object('outcome', 'READY', 'photos', v_photos);
end;
$$;

-- Persists exactly one immutable assessment for a leased request. Provider
-- response retries return the prior assessment without creating another row.
create or replace function public.admin_complete_pothole_ai_analysis(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_schema_version text,
  p_classification text,
  p_confidence double precision,
  p_photo_quality text,
  p_suggested_severity text,
  p_visible_evidence text[],
  p_cautions text[],
  p_summary text,
  p_input_photo_count integer,
  p_input_evidence_sha256 text,
  p_provider_response_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.pothole_ai_assessments%rowtype;
  v_assessment_count bigint;
  v_assessment_dto jsonb;
  v_candidate_pothole_id uuid;
  v_lease private.pothole_ai_analysis_leases%rowtype;
begin
  if p_request_id is null
    or p_actor_user_id is null
    or p_provider is distinct from 'openai'
    or p_model is null
    or btrim(p_model) = ''
    or char_length(p_model) > 128
    or p_prompt_version is null
    or btrim(p_prompt_version) = ''
    or char_length(p_prompt_version) > 64
    or p_schema_version is null
    or btrim(p_schema_version) = ''
    or char_length(p_schema_version) > 64
    or p_classification is null
    or p_classification not in ('likely_pothole', 'uncertain', 'unlikely_pothole')
    or p_confidence is null
    or p_confidence < 0
    or p_confidence > 1
    or p_photo_quality is null
    or p_photo_quality not in ('good', 'usable', 'poor')
    or (
      p_suggested_severity is not null
      and p_suggested_severity not in ('SMALL', 'MEDIUM', 'DANGEROUS')
    )
    or p_visible_evidence is null
    or cardinality(p_visible_evidence) > 5
    or array_position(p_visible_evidence, null) is not null
    or p_cautions is null
    or cardinality(p_cautions) > 5
    or array_position(p_cautions, null) is not null
    or p_summary is null
    or btrim(p_summary) = ''
    or char_length(p_summary) > 500
    or p_input_photo_count is null
    or p_input_photo_count < 1
    or p_input_photo_count > 3
    or p_input_evidence_sha256 is null
    or p_input_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or (
      p_provider_response_id is not null
      and (
        btrim(p_provider_response_id) = ''
        or char_length(p_provider_response_id) > 255
      )
    ) then
    return jsonb_build_object('outcome', 'INVALID_INPUT', 'assessment', null);
  end if;

  if exists (
    select 1
    from unnest(p_visible_evidence) as evidence(v_value)
    where btrim(evidence.v_value) = ''
      or char_length(evidence.v_value) > 160
  ) or exists (
    select 1
    from unnest(p_cautions) as caution(v_value)
    where btrim(caution.v_value) = ''
      or char_length(caution.v_value) > 160
  ) then
    return jsonb_build_object('outcome', 'INVALID_INPUT', 'assessment', null);
  end if;

  if not exists (
    select 1
    from public.admin_users as au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    return jsonb_build_object('outcome', 'ACTOR_NOT_AUTHORIZED', 'assessment', null);
  end if;

  select paa.*
  into v_assessment
  from public.pothole_ai_assessments as paa
  where paa.request_id = p_request_id;

  if found then
    if v_assessment.requested_by_user_id <> p_actor_user_id then
      return jsonb_build_object('outcome', 'INVALID_INPUT', 'assessment', null);
    end if;

    v_assessment_dto := jsonb_build_object(
      'classification', v_assessment.classification,
      'confidence', v_assessment.confidence,
      'photo_quality', v_assessment.photo_quality,
      'suggested_severity', v_assessment.suggested_severity,
      'visible_evidence', v_assessment.visible_evidence,
      'cautions', v_assessment.cautions,
      'summary', v_assessment.summary,
      'input_photo_count', v_assessment.input_photo_count,
      'provider', v_assessment.provider,
      'model', v_assessment.model,
      'prompt_version', v_assessment.prompt_version,
      'schema_version', v_assessment.schema_version,
      'created_at', v_assessment.created_at
    );

    select count(*)
    into v_assessment_count
    from public.pothole_ai_assessments as paa
    where paa.pothole_id = v_assessment.pothole_id;

    return jsonb_build_object(
      'outcome', 'ALREADY_COMPLETED',
      'assessment', v_assessment_dto,
      'assessment_count', v_assessment_count
    );
  end if;

  select paal.pothole_id
  into v_candidate_pothole_id
  from private.pothole_ai_analysis_leases as paal
  where paal.request_id = p_request_id;

  if found then
    -- Match the begin RPC's pothole -> lease lock order. The assessment FK
    -- also takes a lock on this parent row, so locking the lease first would
    -- deadlock with an expired-lease takeover that already holds the pothole.
    perform 1
    from public.potholes as p
    where p.id = v_candidate_pothole_id
    for update;

    if found then
      -- Re-read after acquiring the parent lock. An expired lease may have
      -- been replaced while this completion waited; never complete against
      -- a different or already-removed request.
      select paal.*
      into v_lease
      from private.pothole_ai_analysis_leases as paal
      where paal.request_id = p_request_id
        and paal.pothole_id = v_candidate_pothole_id
      for update;
    end if;
  end if;

  if not found then
    -- A concurrent completion may have committed while this transaction was
    -- waiting. Recheck after the ordered lock sequence for response idempotency.
    select paa.*
    into v_assessment
    from public.pothole_ai_assessments as paa
    where paa.request_id = p_request_id;

    if found and v_assessment.requested_by_user_id = p_actor_user_id then
      v_assessment_dto := jsonb_build_object(
        'classification', v_assessment.classification,
        'confidence', v_assessment.confidence,
        'photo_quality', v_assessment.photo_quality,
        'suggested_severity', v_assessment.suggested_severity,
        'visible_evidence', v_assessment.visible_evidence,
        'cautions', v_assessment.cautions,
        'summary', v_assessment.summary,
        'input_photo_count', v_assessment.input_photo_count,
        'provider', v_assessment.provider,
        'model', v_assessment.model,
        'prompt_version', v_assessment.prompt_version,
        'schema_version', v_assessment.schema_version,
        'created_at', v_assessment.created_at
      );

      select count(*)
      into v_assessment_count
      from public.pothole_ai_assessments as paa
      where paa.pothole_id = v_assessment.pothole_id;

      return jsonb_build_object(
        'outcome', 'ALREADY_COMPLETED',
        'assessment', v_assessment_dto,
        'assessment_count', v_assessment_count
      );
    end if;

    return jsonb_build_object('outcome', 'LEASE_NOT_FOUND', 'assessment', null);
  end if;

  if v_lease.requested_by_user_id <> p_actor_user_id
    or p_input_photo_count > cardinality(v_lease.selected_photo_ids) then
    return jsonb_build_object('outcome', 'LEASE_NOT_FOUND', 'assessment', null);
  end if;

  insert into public.pothole_ai_assessments as paa (
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
    provider_response_id,
    requested_at
  )
  values (
    p_request_id,
    v_lease.pothole_id,
    p_actor_user_id,
    p_provider,
    p_model,
    p_prompt_version,
    p_schema_version,
    p_classification::public.pothole_ai_classification,
    p_confidence,
    p_photo_quality::public.pothole_ai_photo_quality,
    case
      when p_suggested_severity is null then null
      else p_suggested_severity::public.report_severity
    end,
    p_visible_evidence,
    p_cautions,
    p_summary,
    p_input_photo_count,
    p_input_evidence_sha256,
    p_provider_response_id,
    v_lease.acquired_at
  )
  returning paa.* into v_assessment;

  delete from private.pothole_ai_analysis_leases as paal
  where paal.request_id = p_request_id
    and paal.requested_by_user_id = p_actor_user_id;

  v_assessment_dto := jsonb_build_object(
    'classification', v_assessment.classification,
    'confidence', v_assessment.confidence,
    'photo_quality', v_assessment.photo_quality,
    'suggested_severity', v_assessment.suggested_severity,
    'visible_evidence', v_assessment.visible_evidence,
    'cautions', v_assessment.cautions,
    'summary', v_assessment.summary,
    'input_photo_count', v_assessment.input_photo_count,
    'provider', v_assessment.provider,
    'model', v_assessment.model,
    'prompt_version', v_assessment.prompt_version,
    'schema_version', v_assessment.schema_version,
    'created_at', v_assessment.created_at
  );

  select count(*)
  into v_assessment_count
  from public.pothole_ai_assessments as paa
  where paa.pothole_id = v_assessment.pothole_id;

  return jsonb_build_object(
    'outcome', 'COMPLETED',
    'assessment', v_assessment_dto,
    'assessment_count', v_assessment_count
  );
end;
$$;

-- Releases only the caller's exact lease after an evidence/provider failure. It
-- cannot remove a newer request's lease for the same pothole.
create or replace function public.admin_release_pothole_ai_analysis(
  p_request_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_actor_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.admin_users as au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    return false;
  end if;

  delete from private.pothole_ai_analysis_leases as paal
  where paal.request_id = p_request_id
    and paal.requested_by_user_id = p_actor_user_id;

  return found;
end;
$$;

-- Returns only the latest sanitized assessment plus history count. Private
-- request/actor IDs, provider response IDs, and evidence fingerprints remain
-- server-side and are not part of this browser-facing contract.
create or replace function public.admin_get_pothole_ai_summary(
  p_public_id text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assessment_count bigint;
  v_assessment_dto jsonb;
  v_pothole_id uuid;
begin
  if p_actor_user_id is null
    or p_public_id is null
    or p_public_id !~ '^MTL-[0-9]{6}$' then
    return jsonb_build_object(
      'outcome', 'INVALID_INPUT',
      'assessment', null,
      'assessment_count', 0
    );
  end if;

  if not exists (
    select 1
    from public.admin_users as au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    return jsonb_build_object(
      'outcome', 'ACTOR_NOT_AUTHORIZED',
      'assessment', null,
      'assessment_count', 0
    );
  end if;

  select p.id
  into v_pothole_id
  from public.potholes as p
  where p.public_id = p_public_id;

  if not found then
    return jsonb_build_object(
      'outcome', 'NOT_FOUND',
      'assessment', null,
      'assessment_count', 0
    );
  end if;

  select count(*)
  into v_assessment_count
  from public.pothole_ai_assessments as paa
  where paa.pothole_id = v_pothole_id;

  select jsonb_build_object(
    'classification', paa.classification,
    'confidence', paa.confidence,
    'photo_quality', paa.photo_quality,
    'suggested_severity', paa.suggested_severity,
    'visible_evidence', paa.visible_evidence,
    'cautions', paa.cautions,
    'summary', paa.summary,
    'input_photo_count', paa.input_photo_count,
    'provider', paa.provider,
    'model', paa.model,
    'prompt_version', paa.prompt_version,
    'schema_version', paa.schema_version,
    'created_at', paa.created_at
  )
  into v_assessment_dto
  from public.pothole_ai_assessments as paa
  where paa.pothole_id = v_pothole_id
  order by paa.created_at desc, paa.id desc
  limit 1;

  return jsonb_build_object(
    'outcome', 'OK',
    'assessment', v_assessment_dto,
    'assessment_count', v_assessment_count
  );
end;
$$;

revoke all on function public.admin_begin_pothole_ai_analysis(text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_begin_pothole_ai_analysis(text, uuid, uuid)
to service_role;

revoke all on function public.admin_complete_pothole_ai_analysis(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  double precision,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_complete_pothole_ai_analysis(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  double precision,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  text,
  text
) to service_role;

revoke all on function public.admin_release_pothole_ai_analysis(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_release_pothole_ai_analysis(uuid, uuid)
to service_role;

revoke all on function public.admin_get_pothole_ai_summary(text, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_get_pothole_ai_summary(text, uuid)
to service_role;

comment on table public.pothole_ai_assessments is
  'Append-only AI shadow-mode assessments. Human moderation remains authoritative.';

comment on table private.pothole_ai_analysis_leases is
  'Short-lived server-only leases preventing concurrent duplicate paid AI calls per pothole.';

comment on function public.admin_begin_pothole_ai_analysis(text, uuid, uuid) is
  'Service-role-only evidence selection and short-lived lease acquisition after active-admin validation.';

comment on function public.admin_complete_pothole_ai_analysis(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  double precision,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  text,
  text
) is
  'Service-role-only idempotent append of a structured AI assessment bound to its leased request.';

comment on function public.admin_release_pothole_ai_analysis(uuid, uuid) is
  'Service-role-only actor-bound release of an unfinished AI analysis lease.';

comment on function public.admin_get_pothole_ai_summary(text, uuid) is
  'Service-role-only latest sanitized AI assessment and immutable history count.';
