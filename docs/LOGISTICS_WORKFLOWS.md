# Logistics workflows

How shipments, tracking, pricing and quotes work in the current implementation,
and the rules the system enforces. Roles are described in
[Security](SECURITY.md#authorisation).

## 1. Shipment lifecycle

```
create ──▶ active ──(events, issues)──▶ active + delivered ──▶ archived
             │                                                    ▲
             └──────────── cancel ──▶ cancelled ──────────────────┘
```

A delivered shipment stays `active` (so late corrections are still possible)
but can no longer be cancelled. Only delivered or cancelled shipments can be
archived.

1. **Create** (`shipments.create`). Staff enter the service, route, sender,
   recipient, packages and optional contents/declared value. The system assigns
   a reference such as `CLS-3ZYMWJHC` and records a *Booking confirmed* event.
   The form carries a one-time key so a double submission does not create a
   second shipment.
2. **Issue a tracking code** (`tracking_codes.issue`). The code is shown once;
   give it to the customer through your own channel. A shipment may have more
   than one active code (for example sender and recipient).
3. **Record events** as they are confirmed (`events.create`).
4. **Report and resolve issues** (`exceptions.manage`).
5. **Confirm delivery** (`events.confirm_delivery`) with evidence.
6. **Archive** once delivered or cancelled (`shipments.archive`).

Cancelling (`shipments.cancel`) requires a reason and confirmation, adds a
public "Shipment cancelled" update, and is not possible after delivery.
Cancelled and archived shipments are read-only. Archived shipments no longer
appear in public tracking.

## 2. Events and milestones

Every status change is an event with a time, time zone, optional location,
public note, internal note and a **source**: staff (manual), carrier API,
carrier webhook, telematics or system. Only the staff source is used today; the
public page labels each update with its source.

**Milestones** carry progress weights stored in `milestone_definitions`, so they
are configuration rather than hard-coded rules:

| Milestone | Progress | Domestic routes |
| --- | --- | --- |
| Booking confirmed | 5% | shown |
| Collected | 15% | shown |
| Received at origin facility | 25% | shown |
| Export processing | 35% | hidden |
| Departed origin | 45% | hidden |
| In international transit | 60% | hidden |
| Arrived in destination country | 75% | hidden |
| Released by customs | 85% | hidden |
| Out for delivery | 95% | shown |
| Delivered | 100% | shown |

International-only milestones cannot be recorded on a domestic shipment.

**Informational updates** (facility scan, transit update, update from Crownline)
appear in the timeline but never change progress. A customer update requires a
public message.

### Progress rules

- Progress equals the weight of the **highest milestone reached** by any
  non-voided event. A late-arriving lower milestone (for example a *Collected*
  scan that arrives after *Departed origin*) is added to the history but does not
  move progress backwards.
- If later milestones are recorded without earlier ones, the skipped steps are
  shown as "passed, not separately confirmed" rather than invented.
- **100% only with delivery evidence.** A *Delivered* event must include an
  evidence reference (carrier proof-of-delivery reference or the name of the
  person who signed). Without it the event is rejected, and the database also
  enforces this. Anything short of *Delivered* is capped at 99%.
- **Corrections are explicit.** A wrong event is *voided* with a reason, never
  edited or deleted. Voiding is the only way progress can go down, and it is
  audited. Voided events disappear from the public timeline but remain in the
  staff history.
- Events in the future (more than 10 minutes ahead) are rejected. Times are
  entered in the local time zone of the location and stored in UTC.
- Duplicate events (same type, same minute and same location) are ignored, so
  retries are safe.
- If no update has been recorded for 72 hours, the public page says so instead
  of implying live movement.

## 3. Exceptions (issues)

Categories: delay, address issue, customs hold, documentation, damage, weather,
failed delivery attempt, other. Opening an issue adds a public "Issue reported"
update with either the staff-written customer message or the category's
standard wording. Internal notes are never shown publicly. Resolving requires a
resolution note and adds an "Issue resolved" update. Issues never change
progress.

## 4. Tracking codes

- Format `CL-XXXX-XXXX-XXXX`; the last character is a check character, so most
  typos are caught immediately with a "check the code" message.
- Input is forgiving: case, spaces, dashes and look-alike characters (O/0, I/L/1)
  are normalised.
- Codes can expire after `TRACKING_CODE_TTL_DAYS` (0 = never).
- **Revoke** (`tracking_codes.revoke`) with a reason and confirmation when a code
  was sent to the wrong person or is no longer needed. It stops working
  immediately; the shipment and its history are unaffected. Issue a new code if
  the customer still needs access.
- Unknown, revoked, expired and archived codes all show the same "We could not
  find an active shipment" message.

### What the customer sees

Service, origin and destination (city and country), current status with a
plain-language explanation and any action needed, milestone steps, progress,
the timeline with locations and public notes, open issues, the estimated
delivery date with its source ("staff estimate" or "carrier"), and when the
page was last updated. No names, addresses, contact details, contents or
values are shown. There is no map; a location is only shown when an event
recorded one.

## 5. Estimated delivery

Staff can set or clear an estimated delivery date. It is always labelled as a
staff estimate until a carrier integration can supply carrier estimates.

## 6. Pricing and the calculator

All calculations run on the server (`src/domain/pricing.ts`).

- **Dimensional weight** = L × W × H ÷ divisor (cm³/kg, or in³/lb for imperial
  cards).
- **Billable weight** = the greater of actual and dimensional weight, rounded up
  to the service's increment. Parcel services round each package before summing;
  freight services compare shipment totals and round once.
- Documents use actual weight unless the rate card says otherwise.
- **Ocean LCL** uses 1 CBM = 1,000 kg (divisor 1000) with a minimum billable weight.
- Price = base + per-kg × billable weight, at least the minimum charge, plus
  surcharges (per package or per shipment), plus a fuel surcharge percentage,
  plus optional cover (a percentage of declared value with a minimum). Each
  line is shown with an explanation; exclusions such as duties and taxes are
  listed.
- Route and size limits are checked with plain-language errors.

Demonstration divisors: domestic and international parcel 5000, air 6000,
road 3000, ocean LCL 1000 (cm³/kg). These match common industry conventions but
are **not** any carrier's published rates; demo prices are labelled
"Demonstration" everywhere they appear.

Business shipping and fulfilment are quoted individually, so the calculator does
not price them.

## 7. Quote requests

1. A visitor submits the quote form (contact details, route, packages, consent).
   The server recalculates the estimate (if pricing is enabled) and stores it
   with a reference such as `CLQ-…`. A one-time key prevents duplicates.
2. Staff review it under **Quote requests** (`quotes.read`) and move it through
   `new → in review → quoted / declined → closed` (`quotes.manage`).
3. Staff can download an estimate PDF (`documents.generate`). It is marked as a
   demonstration when demo pricing was used.

Formal quotes with line items, invoices and payments are modelled in the
database but not implemented (see [Implementation status](IMPLEMENTATION_STATUS.md)).

## 8. Contact messages

The contact form stores messages for staff with `contact.read`, who can mark
them handled. A hidden honeypot field silently discards most automated
submissions. No email is sent.

## 9. Documents

- **Shipment summary PDF**: reference, route, service, packages, current status,
  event history and open issues.
- **Quote estimate PDF**: request details and the server-calculated estimate.

Both are generated on request from current server data for authorised staff,
logged in `documents` with a SHA-256 checksum, and audited. Each states that it
is not a carrier label, customs document, invoice or proof of delivery.

## 10. Audit trail

Every staff action (sign-in outcomes, shipment changes, events, voids,
exceptions, code issue/revoke, cancellations, archives, documents, quote and
message handling, team changes) is written to `audit_events` with the actor,
time, IP, reason and details. The log cannot be edited or deleted. Staff with
`audit.read` can filter it by entity and action.
