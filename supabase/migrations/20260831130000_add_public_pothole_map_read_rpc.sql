-- Read-only, service-role-only map boundary. This function deliberately returns
-- a small public DTO rather than a potholes or reports row, so the map cannot
-- expose reporter, submission, photo, accuracy, or note data.
create or replace function public.list_public_potholes_in_bbox(
  p_min_latitude double precision,
  p_min_longitude double precision,
  p_max_latitude double precision,
  p_max_longitude double precision,
  p_limit integer default 200
)
returns table (
  public_id text,
  latitude double precision,
  longitude double precision,
  status public.pothole_status,
  formatted_address text,
  report_count integer,
  latest_severity public.report_severity,
  created_at timestamptz,
  result_limit_reached boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_limit integer;
  v_longitude_span double precision;
  v_primary_bbox extensions.geography;
  v_secondary_bbox extensions.geography;
begin
  if p_min_latitude is null
    or p_max_latitude is null
    or p_min_latitude < -90
    or p_min_latitude > 90
    or p_max_latitude < -90
    or p_max_latitude > 90
    or p_min_latitude >= p_max_latitude then
    raise exception 'Latitude bounds are invalid' using errcode = '22023';
  end if;

  if p_min_longitude is null
    or p_max_longitude is null
    or p_min_longitude < -180
    or p_min_longitude > 180
    or p_max_longitude < -180
    or p_max_longitude > 180
    or p_min_longitude = p_max_longitude then
    raise exception 'Longitude bounds are invalid' using errcode = '22023';
  end if;

  v_longitude_span := case
    when p_min_longitude < p_max_longitude then p_max_longitude - p_min_longitude
    else (180 - p_min_longitude) + (p_max_longitude + 180)
  end;

  if v_longitude_span <= 0 then
    raise exception 'Longitude bounds are invalid' using errcode = '22023';
  end if;

  if p_limit is not null and p_limit < 1 then
    raise exception 'Result limit is invalid' using errcode = '22023';
  end if;

  -- A caller may request fewer rows, but can never make the read boundary
  -- return more than 250. A null limit retains the documented default of 200.
  v_effective_limit := least(coalesce(p_limit, 200), 250);

  if p_min_longitude < p_max_longitude then
    v_primary_bbox := extensions.st_makeenvelope(
      p_min_longitude,
      p_min_latitude,
      p_max_longitude,
      p_max_latitude,
      4326
    )::extensions.geography;
  else
    -- React Native Maps normally supplies a non-wrapping viewport, but a
    -- wrapped viewport is valid at the antimeridian. Split it into indexable
    -- PostGIS bounding boxes instead of silently treating it as the long way
    -- around the globe.
    v_primary_bbox := extensions.st_makeenvelope(
      p_min_longitude,
      p_min_latitude,
      180,
      p_max_latitude,
      4326
    )::extensions.geography;
    v_secondary_bbox := extensions.st_makeenvelope(
      -180,
      p_min_latitude,
      p_max_longitude,
      p_max_latitude,
      4326
    )::extensions.geography;
  end if;

  return query
  with bounded_potholes as materialized (
    select
      p.id as v_pothole_id,
      p.public_id as v_public_id,
      p.canonical_location as v_canonical_location,
      p.status as v_status,
      p.formatted_address as v_formatted_address,
      p.report_count as v_report_count,
      p.created_at as v_created_at
    from public.potholes as p
    where p.canonical_location OPERATOR(extensions.&&) v_primary_bbox
      or (
        v_secondary_bbox is not null
        and p.canonical_location OPERATOR(extensions.&&) v_secondary_bbox
      )
    order by p.created_at desc, p.id desc
    limit v_effective_limit + 1
  ), annotated_potholes as (
    select
      b.v_pothole_id,
      b.v_public_id,
      extensions.st_y(b.v_canonical_location::extensions.geometry) as v_latitude,
      extensions.st_x(b.v_canonical_location::extensions.geometry) as v_longitude,
      b.v_status,
      b.v_formatted_address,
      b.v_report_count,
      latest_report.severity as v_latest_severity,
      b.v_created_at,
      count(*) over () > v_effective_limit as v_result_limit_reached,
      row_number() over (
        order by b.v_created_at desc, b.v_pothole_id desc
      ) as v_row_number
    from bounded_potholes as b
    left join lateral (
      -- Latest severity is the most recent linked report by created_at. This
      -- does not expose the report itself or any reporter-provided note.
      select r.severity
      from public.reports as r
      where r.pothole_id = b.v_pothole_id
      order by r.created_at desc, r.id desc
      limit 1
    ) as latest_report on true
  )
  select
    a.v_public_id,
    a.v_latitude,
    a.v_longitude,
    a.v_status,
    a.v_formatted_address,
    a.v_report_count,
    a.v_latest_severity,
    a.v_created_at,
    a.v_result_limit_reached
  from annotated_potholes as a
  where a.v_row_number <= v_effective_limit
  order by a.v_created_at desc, a.v_pothole_id desc;
end;
$$;

-- The Edge Function is the only intended caller. The mobile client retains no
-- direct Data API route to this RPC or to its underlying tables.
revoke all on function public.list_public_potholes_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.list_public_potholes_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to service_role;

comment on function public.list_public_potholes_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) is
  'Service-role-only public map DTO by PostGIS viewport. Latest severity is the most recent linked report by created_at; report data stays private.';
