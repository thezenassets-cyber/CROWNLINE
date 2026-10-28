-- Straight-line or coordinator-entered kilometres, and whether staff included cover.
alter table shipments add column distance_km numeric(8,1);
alter table shipments add column distance_source text;
alter table shipments add constraint shipments_distance_source
  check (distance_source is null or distance_source in ('estimated', 'coordinator'));
alter table shipments add constraint shipments_distance_range
  check (distance_km is null or (distance_km >= 0 and distance_km <= 40000));
alter table shipments add column cover_included boolean not null default false;
