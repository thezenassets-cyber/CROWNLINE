-- Staff-set progress shown to the customer, separate from the milestone calculation.
alter table shipments add column display_progress smallint;
alter table shipments add constraint shipments_display_progress_range
  check (display_progress is null or display_progress between 0 and 100);

-- Charges a coordinator prepares and can publish onto the public tracking page.
-- This table does not store card numbers and does not take a payment.
create table shipment_charges (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  description text not null,
  amount_minor integer not null check (amount_minor >= 0 and amount_minor <= 1000000000),
  currency char(3) not null,
  status text not null check (status in ('draft', 'published', 'settled', 'withdrawn')),
  issued_on date,
  public_note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipment_charges_shipment_idx on shipment_charges (shipment_id, created_at);
