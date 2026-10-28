import type { Queryable } from '../db/index.ts';

export interface DashboardMetrics {
  active: number;
  awaitingCollection: number;
  inTransit: number;
  outForDelivery: number;
  withOpenExceptions: number;
  deliveredInPeriod: number;
  createdInPeriod: number;
  quotesAwaitingAction: number;
  unreadContactMessages: number;
}

const IN_TRANSIT = [
  'collected', 'received_origin_facility', 'export_processing', 'departed_origin',
  'international_transit', 'arrived_destination_country', 'customs_released',
];

/**
 * Current-state counts are live; "delivered" and "created" use the selected period.
 * Every figure is a database count — nothing here is estimated or hard-coded.
 */
export async function dashboardMetrics(q: Queryable, from: string, to: string): Promise<DashboardMetrics> {
  const row = (
    await q.query<DashboardMetrics>(
      `select
         count(*) filter (where lifecycle_state = 'active' and delivered_at is null)::int as "active",
         count(*) filter (where lifecycle_state = 'active' and delivered_at is null and (current_milestone is null or current_milestone = 'booking_confirmed'))::int as "awaitingCollection",
         count(*) filter (where lifecycle_state = 'active' and current_milestone = any($3::text[]))::int as "inTransit",
         count(*) filter (where lifecycle_state = 'active' and current_milestone = 'out_for_delivery')::int as "outForDelivery",
         count(*) filter (where lifecycle_state = 'active' and exists (
           select 1 from shipment_exceptions x where x.shipment_id = shipments.id and x.resolved_at is null))::int as "withOpenExceptions",
         count(*) filter (where delivered_at >= $1::date and delivered_at < $2::date + interval '1 day')::int as "deliveredInPeriod",
         count(*) filter (where created_at >= $1::date and created_at < $2::date + interval '1 day')::int as "createdInPeriod",
         (select count(*)::int from quote_requests where status in ('new', 'in_review')) as "quotesAwaitingAction",
         (select count(*)::int from contact_messages where status = 'new') as "unreadContactMessages"
       from shipments`,
      [from, to, IN_TRANSIT],
    )
  ).rows[0]!;
  return row;
}
