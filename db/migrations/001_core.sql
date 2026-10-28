-- Crownline Logistics core operational schema.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role text not null check (role in (
    'owner', 'operations_admin', 'tracking_operator', 'customer_support',
    'finance', 'auditor', 'business_customer'
  )),
  password_hash text not null,
  must_change_password boolean not null default true,
  status text not null default 'active' check (status in ('active', 'disabled')),
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_memberships (
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  membership_role text not null default 'member' check (membership_role in ('member', 'manager')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  csrf_token text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  flash jsonb
);
create index sessions_user_idx on sessions (user_id);

-- Milestone weights are configuration, not universal carrier rules.
create table milestone_definitions (
  code text primary key,
  label text not null,
  explanation text not null,
  customer_action text,
  progress_percent integer not null check (progress_percent between 0 and 100),
  sort_order integer not null unique,
  international_only boolean not null default false,
  active boolean not null default true
);

insert into milestone_definitions (code, label, explanation, customer_action, progress_percent, sort_order, international_only) values
  ('booking_confirmed', 'Booking confirmed', 'Crownline has accepted the booking and assigned a shipment reference.', 'Prepare the goods and any documents requested in your booking confirmation.', 5, 10, false),
  ('collected', 'Collected', 'The shipment has been collected from the sender.', null, 15, 20, false),
  ('received_origin_facility', 'Received at origin facility', 'The shipment has been scanned in at a facility near its origin.', null, 25, 30, false),
  ('export_processing', 'Export processing', 'Export formalities and departure preparations are under way.', 'Respond promptly if we ask for additional export information.', 35, 40, true),
  ('departed_origin', 'Departed origin', 'The shipment has left the origin country or region.', null, 45, 50, true),
  ('international_transit', 'In international transit', 'The shipment is moving between countries by air, sea or road.', null, 60, 60, true),
  ('arrived_destination_country', 'Arrived in destination country', 'The shipment has arrived in the destination country.', null, 75, 70, true),
  ('customs_released', 'Released by customs', 'The destination customs authority has released the shipment.', 'Duties or taxes may be payable by the recipient depending on the terms of sale.', 85, 80, true),
  ('out_for_delivery', 'Out for delivery', 'The shipment is with the final delivery driver today.', 'Make sure someone is available to receive the shipment if a signature is required.', 95, 90, false),
  ('delivered', 'Delivered', 'Delivery has been confirmed with recorded delivery evidence.', null, 100, 100, false);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  organization_id uuid references organizations(id),
  service_code text not null,
  shipment_type text not null check (shipment_type in ('parcel', 'document', 'pallet', 'freight')),
  carrier_name text,
  carrier_tracking_number text,
  origin_city text not null,
  origin_region text,
  origin_postal_code text,
  origin_country char(2) not null,
  destination_city text not null,
  destination_region text,
  destination_postal_code text,
  destination_country char(2) not null,
  contents_description text,
  declared_value_minor integer check (declared_value_minor is null or declared_value_minor >= 0),
  declared_value_currency char(3),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'cancelled', 'archived')),
  current_milestone text references milestone_definitions(code),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  last_event_at timestamptz,
  delivered_at timestamptz,
  estimated_delivery_date date,
  estimated_delivery_source text check (estimated_delivery_source in ('carrier', 'staff_estimate')),
  cancelled_at timestamptz,
  cancel_reason text,
  archived_at timestamptz,
  create_request_key text unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((estimated_delivery_date is null) = (estimated_delivery_source is null)),
  check (delivered_at is null or progress_percent = 100)
);
create index shipments_created_idx on shipments (created_at desc);
create index shipments_state_idx on shipments (lifecycle_state, current_milestone);
create index shipments_org_idx on shipments (organization_id);

create table shipment_parties (
  shipment_id uuid not null references shipments(id),
  party_role text not null check (party_role in ('sender', 'recipient')),
  name text not null,
  company text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country char(2),
  primary key (shipment_id, party_role)
);

create table shipment_packages (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  package_index integer not null,
  quantity integer not null check (quantity between 1 and 999),
  weight_kg numeric(12, 3) not null check (weight_kg > 0),
  length_cm numeric(10, 2) not null check (length_cm > 0),
  width_cm numeric(10, 2) not null check (width_cm > 0),
  height_cm numeric(10, 2) not null check (height_cm > 0),
  description text,
  unique (shipment_id, package_index)
);

create table shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  event_type text not null,
  category text not null check (category in ('milestone', 'exception', 'info')),
  milestone_code text references milestone_definitions(code),
  occurred_at timestamptz not null,
  occurred_timezone text,
  location_label text,
  location_country char(2),
  public_note text,
  internal_note text,
  source text not null check (source in ('staff_manual', 'carrier_api', 'carrier_webhook', 'telematics', 'system')),
  source_reference text,
  evidence_reference text,
  recorded_by uuid references users(id),
  dedupe_key text not null,
  voided_at timestamptz,
  voided_by uuid references users(id),
  void_reason text,
  created_at timestamptz not null default now(),
  unique (shipment_id, dedupe_key),
  check ((category = 'milestone') = (milestone_code is not null)),
  check (milestone_code is distinct from 'delivered' or evidence_reference is not null),
  check ((voided_at is null) = (void_reason is null))
);
create index shipment_events_shipment_idx on shipment_events (shipment_id, occurred_at);

create table shipment_exceptions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  category text not null check (category in (
    'delay', 'address_issue', 'customs_hold', 'documentation', 'damage', 'weather', 'delivery_attempt_failed', 'other'
  )),
  customer_message text not null,
  internal_note text,
  opened_at timestamptz not null default now(),
  opened_by uuid references users(id),
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  resolution_note text,
  check ((resolved_at is null) = (resolution_note is null))
);
create index shipment_exceptions_open_idx on shipment_exceptions (shipment_id) where resolved_at is null;

-- Public tracking credentials. Only an HMAC of the code is stored; the plain code
-- is shown once at issuance. Revoked rows are kept so codes are never reused.
create table tracking_credentials (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  code_hash text not null unique,
  code_hint text not null,
  issue_request_key text not null unique,
  issued_at timestamptz not null default now(),
  issued_by uuid references users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references users(id),
  revoke_reason text,
  check ((revoked_at is null) = (revoke_reason is null))
);
create index tracking_credentials_shipment_idx on tracking_credentials (shipment_id);

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'new' check (status in ('new', 'in_review', 'quoted', 'declined', 'closed')),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  company text,
  service_code text not null,
  shipment_type text not null,
  origin_country char(2) not null,
  origin_city text,
  origin_postal_code text,
  destination_country char(2) not null,
  destination_city text,
  destination_postal_code text,
  packages jsonb not null,
  declared_value_minor integer,
  currency char(3),
  notes text,
  pricing_mode text not null,
  estimate jsonb,
  idempotency_key text unique,
  handled_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quote_requests_status_idx on quote_requests (status, created_at desc);

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now()
);

-- Append-only audit trail.
create table audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references users(id),
  actor_label text not null,
  action text not null,
  entity_type text,
  entity_id text,
  reason text,
  details jsonb,
  ip text
);
create index audit_events_entity_idx on audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_time_idx on audit_events (occurred_at desc);

create function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

create trigger audit_events_no_update_delete
  before update or delete on audit_events
  for each row execute function audit_events_append_only();
