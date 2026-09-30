-- Pothole MTL initial backend foundation.
-- This migration deliberately creates no client-facing RLS policies. The anonymous
-- citizen submission contract will be designed as a narrowly scoped write path in 6B.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.pothole_status as enum (
  'REPORTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'REPAIRED',
  'REJECTED',
  'DUPLICATE'
);

create type public.report_severity as enum (
  'SMALL',
  'MEDIUM',
  'DANGEROUS'
);

-- Database-generated identifiers are atomic and safe under concurrent writes.
-- Gaps are acceptable; the bounded sequence avoids accidental duplicate formatting
-- after the six-digit public identifier range is exhausted.
create sequence public.pothole_public_id_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 999999
  no cycle;

create table public.potholes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default (
    'MTL-' || lpad(nextval('public.pothole_public_id_seq'::regclass)::text, 6, '0')
  ) check (public_id ~ '^MTL-[0-9]{6}$'),
  status public.pothole_status not null default 'REPORTED'::public.pothole_status,
  canonical_location extensions.geography(Point, 4326) not null,
  formatted_address text,
  street_number text,
  street text,
  city text,
  district text,
  region text,
  postal_code text,
  country text,
  report_count integer not null default 0 check (report_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  repaired_at timestamptz,
  check (
    repaired_at is null
    or status = 'REPAIRED'::public.pothole_status
  )
);

alter sequence public.pothole_public_id_seq owned by public.potholes.public_id;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  pothole_id uuid references public.potholes(id) on delete set null,
  reported_location extensions.geography(Point, 4326) not null,
  accuracy_meters double precision check (
    accuracy_meters is null
    or (accuracy_meters >= 0 and accuracy_meters < 100000)
  ),
  formatted_address text,
  street_number text,
  street text,
  city text,
  district text,
  region text,
  postal_code text,
  country text,
  severity public.report_severity not null,
  note text check (note is null or char_length(note) <= 2000),
  installation_id uuid,
  created_at timestamptz not null default now()
);

create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null unique check (
    btrim(storage_path) <> ''
    and storage_path !~ '^/'
  ),
  mime_type text check (mime_type is null or char_length(mime_type) <= 255),
  file_size_bytes bigint check (
    file_size_bytes is null
    or (file_size_bytes > 0 and file_size_bytes <= 10485760)
  ),
  created_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger set_potholes_updated_at
before update on public.potholes
for each row
execute function private.set_updated_at();

create index potholes_canonical_location_gix
on public.potholes using gist (canonical_location);

create index reports_reported_location_gix
on public.reports using gist (reported_location);

create index potholes_status_created_at_idx
on public.potholes (status, created_at desc);

create index reports_pothole_id_idx
on public.reports (pothole_id);

create index reports_created_at_idx
on public.reports (created_at desc);

create index report_photos_report_id_idx
on public.report_photos (report_id);

-- Bucket configuration is version controlled. The bucket is private and there are
-- intentionally no storage.objects policies in 6A, so reads and writes are default deny.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'report-photos',
  'report-photos',
  false,
  10485760,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.potholes enable row level security;
alter table public.reports enable row level security;
alter table public.report_photos enable row level security;

-- Defense in depth: no direct table privileges and no RLS policies for browser/mobile roles.
revoke all on table public.potholes from public, anon, authenticated;
revoke all on table public.reports from public, anon, authenticated;
revoke all on table public.report_photos from public, anon, authenticated;
revoke all on sequence public.pothole_public_id_seq from public, anon, authenticated;
