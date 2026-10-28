-- Commercial, document, notification and integration records.
-- Tables marked "schema only" are not yet written by application code; see docs/IMPLEMENTATION_STATUS.md.

create table carrier_connections (
  id uuid primary key default gen_random_uuid(),
  carrier_code text not null unique,
  display_name text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'not_configured' check (status in ('not_configured', 'active', 'disabled', 'error')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_summary text,
  created_at timestamptz not null default now()
); -- schema only; credentials live in environment/secret storage, never in this table

create table carrier_tracking_identifiers (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  carrier_code text not null,
  carrier_tracking_number text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (carrier_code, carrier_tracking_number)
); -- schema only

create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_code text not null,
  version integer not null,
  rule jsonb not null,
  approved_by uuid references users(id),
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique (service_code, version)
); -- schema only; rate cards are currently loaded from RATE_CARD_PATH

create table quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  quote_request_id uuid references quote_requests(id),
  organization_id uuid references organizations(id),
  status text not null default 'draft' check (status in ('draft', 'issued', 'accepted', 'expired', 'withdrawn')),
  currency char(3) not null,
  total_minor integer not null check (total_minor >= 0),
  valid_until date,
  issued_by uuid references users(id),
  issued_at timestamptz,
  created_at timestamptz not null default now()
); -- schema only

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id),
  line_index integer not null,
  description text not null,
  amount_minor integer not null,
  unique (quote_id, line_index)
); -- schema only

create table invoices (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  organization_id uuid references organizations(id),
  shipment_id uuid references shipments(id),
  currency char(3) not null,
  total_minor integer not null check (total_minor >= 0),
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  issued_at timestamptz,
  due_date date,
  created_at timestamptz not null default now()
); -- schema only; "paid" may only be set from a verified payment event

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  provider text not null,
  provider_payment_id text not null,
  status text not null check (status in ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
  amount_minor integer not null,
  currency char(3) not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
); -- schema only; no card data is ever stored

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_verified boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  payload jsonb not null,
  unique (provider, provider_event_id)
); -- schema only; the unique key provides idempotent processing

create table documents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  document_type text not null check (document_type in (
    'shipment_summary', 'quote_estimate', 'booking_confirmation', 'invoice', 'payment_receipt',
    'handling_checklist', 'completion_report', 'proof_of_delivery'
  )),
  shipment_id uuid references shipments(id),
  quote_request_id uuid references quote_requests(id),
  generated_by uuid references users(id),
  generated_at timestamptz not null default now(),
  sha256 text not null,
  byte_size integer not null
);
create index documents_shipment_idx on documents (shipment_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references shipments(id),
  template text not null,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'suppressed')),
  created_at timestamptz not null default now()
); -- schema only

create table notification_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id),
  attempted_at timestamptz not null default now(),
  provider text not null,
  provider_message_id text,
  succeeded boolean not null,
  error_summary text
); -- schema only

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
); -- schema only
