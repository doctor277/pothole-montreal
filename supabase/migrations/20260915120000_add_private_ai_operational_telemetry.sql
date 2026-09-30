-- Milestone 10.2: minimal, privacy-safe operational telemetry for the
-- administrator-triggered AI pipeline. Events are append-only diagnostics;
-- they cannot mutate potholes, reports, or human moderation history.

create type private.pothole_ai_operational_event_type as enum (
  'analysis_disabled',
  'analysis_concurrent',
  'no_usable_photos',
  'evidence_unavailable',
  'provider_started',
  'provider_succeeded',
  'provider_timeout',
  'provider_rate_limited',
  'provider_invalid_response',
  'provider_unavailable',
  'assessment_persisted',
  'persistence_failure'
);

create table private.pothole_ai_operational_events (
  id uuid primary key default gen_random_uuid(),
  pothole_id uuid not null references public.potholes(id) on delete restrict,
  request_id uuid not null,
  event_type private.pothole_ai_operational_event_type not null,
  provider text check (provider is null or provider = 'openai'),
  model text check (
    model is null
    or (
      model ~ '^gpt-[A-Za-z0-9._:-]+$'
      and char_length(model) between 1 and 128
    )
  ),
  prompt_version text check (
    prompt_version is null
    or (
      prompt_version ~ '^pothole-vision-v[0-9]+$'
      and char_length(prompt_version) between 1 and 64
    )
  ),
  schema_version text check (
    schema_version is null
    or (
      schema_version ~ '^pothole-assessment-v[0-9]+$'
      and char_length(schema_version) between 1 and 64
    )
  ),
  selected_photo_count smallint check (
    selected_photo_count is null or selected_photo_count between 0 and 3
  ),
  duration_ms integer check (
    duration_ms is null or duration_ms between 0 and 300000
  ),
  automation_operationally_enabled boolean not null default false,
  action_performed boolean not null default false check (not action_performed),
  assessment_id uuid references public.pothole_ai_assessments(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create index pothole_ai_operational_events_pothole_created_at_idx
on private.pothole_ai_operational_events (pothole_id, created_at desc, id desc);

create index pothole_ai_operational_events_request_created_at_idx
on private.pothole_ai_operational_events (request_id, created_at asc, id asc);

alter table private.pothole_ai_operational_events enable row level security;

revoke all on table private.pothole_ai_operational_events
from public, anon, authenticated, service_role;

revoke all on type private.pothole_ai_operational_event_type
from public, anon, authenticated, service_role;

create or replace function private.prevent_pothole_ai_operational_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Pothole AI operational events are append-only' using errcode = '55000';
end;
$$;

revoke all on function private.prevent_pothole_ai_operational_event_mutation()
from public, anon, authenticated, service_role;

create trigger prevent_pothole_ai_operational_event_mutation
before update or delete on private.pothole_ai_operational_events
for each row
execute function private.prevent_pothole_ai_operational_event_mutation();

create or replace function private.is_safe_ai_telemetry_label(
  p_value text,
  p_maximum_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or (
    p_maximum_length between 1 and 128
    and char_length(p_value) between 1 and p_maximum_length
    and p_value ~ '^[A-Za-z0-9._:-]+$'
  );
$$;

revoke all on function private.is_safe_ai_telemetry_label(text, integer)
from public, anon, authenticated, service_role;

create or replace function public.record_pothole_ai_operational_event(
  p_public_id text,
  p_request_id uuid,
  p_event_type text,
  p_provider text default null,
  p_model text default null,
  p_prompt_version text default null,
  p_schema_version text default null,
  p_selected_photo_count integer default null,
  p_duration_ms integer default null,
  p_automation_operationally_enabled boolean default false,
  p_action_performed boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment_id uuid;
  v_pothole_id uuid;
begin
  if p_public_id is null
    or p_public_id !~ '^MTL-[0-9]{6}$'
    or p_request_id is null
    or p_event_type is null
    or p_event_type not in (
      'analysis_disabled',
      'analysis_concurrent',
      'no_usable_photos',
      'evidence_unavailable',
      'provider_started',
      'provider_succeeded',
      'provider_timeout',
      'provider_rate_limited',
      'provider_invalid_response',
      'provider_unavailable',
      'assessment_persisted',
      'persistence_failure'
    )
    or (p_provider is not null and p_provider <> 'openai')
    or not private.is_safe_ai_telemetry_label(p_model, 128)
    or not private.is_safe_ai_telemetry_label(p_prompt_version, 64)
    or not private.is_safe_ai_telemetry_label(p_schema_version, 64)
    or (p_model is not null and p_model !~ '^gpt-[A-Za-z0-9._:-]+$')
    or (
      p_prompt_version is not null
      and p_prompt_version !~ '^pothole-vision-v[0-9]+$'
    )
    or (
      p_schema_version is not null
      and p_schema_version !~ '^pothole-assessment-v[0-9]+$'
    )
    or (
      p_event_type in (
        'provider_started',
        'provider_succeeded',
        'provider_timeout',
        'provider_rate_limited',
        'provider_invalid_response',
        'provider_unavailable',
        'assessment_persisted',
        'persistence_failure'
      )
      and (
        p_provider is distinct from 'openai'
        or p_model is null
        or p_prompt_version is null
        or p_schema_version is null
      )
    )
    or (
      p_event_type in (
        'analysis_disabled',
        'analysis_concurrent',
        'no_usable_photos',
        'evidence_unavailable'
      )
      and (
        p_provider is not null
        or p_model is not null
        or p_prompt_version is not null
        or p_schema_version is not null
      )
    )
    or (
      p_selected_photo_count is not null
      and (p_selected_photo_count < 0 or p_selected_photo_count > 3)
    )
    or (
      p_duration_ms is not null
      and (p_duration_ms < 0 or p_duration_ms > 300000)
    )
    or p_automation_operationally_enabled is null
    or p_action_performed is distinct from false then
    return false;
  end if;

  select p.id
  into v_pothole_id
  from public.potholes as p
  where p.public_id = p_public_id;

  if not found then
    return false;
  end if;

  if p_event_type = 'assessment_persisted' then
    select paa.id
    into v_assessment_id
    from public.pothole_ai_assessments as paa
    where paa.request_id = p_request_id
      and paa.pothole_id = v_pothole_id;

    if not found then
      return false;
    end if;
  end if;

  insert into private.pothole_ai_operational_events as paoe (
    pothole_id,
    request_id,
    event_type,
    provider,
    model,
    prompt_version,
    schema_version,
    selected_photo_count,
    duration_ms,
    automation_operationally_enabled,
    action_performed,
    assessment_id
  )
  values (
    v_pothole_id,
    p_request_id,
    p_event_type::private.pothole_ai_operational_event_type,
    p_provider,
    p_model,
    p_prompt_version,
    p_schema_version,
    p_selected_photo_count,
    p_duration_ms,
    p_automation_operationally_enabled,
    p_action_performed,
    v_assessment_id
  );

  return true;
end;
$$;

revoke all on function public.record_pothole_ai_operational_event(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean,
  boolean
) from public, anon, authenticated, service_role;

grant execute on function public.record_pothole_ai_operational_event(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean,
  boolean
) to service_role;

comment on table private.pothole_ai_operational_events is
  'Append-only, server-only AI pipeline telemetry without identity, image, location, path, URL, secret, or raw-error payloads.';

comment on function public.record_pothole_ai_operational_event(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean,
  boolean
) is
  'Service-role-only writer for controlled, privacy-safe AI operational event categories.';
