/** Normalised, non-milestone event types. Milestone event types use the milestone code. */
export const INFO_EVENT_TYPES = {
  facility_scan: {
    label: 'Scanned at a facility',
    explanation: 'The shipment was scanned while being handled at a facility. This does not change the milestone.',
  },
  transit_update: {
    label: 'Transit update',
    explanation: 'A confirmed update while the shipment is moving between milestones.',
  },
  customer_update: {
    label: 'Update from Crownline',
    explanation: 'A message from the Crownline team about this shipment.',
  },
} as const;

export type InfoEventType = keyof typeof INFO_EVENT_TYPES;

export const SYSTEM_EVENT_TYPES = {
  exception_reported: { label: 'Issue reported', category: 'exception' },
  exception_resolved: { label: 'Issue resolved', category: 'info' },
  shipment_cancelled: { label: 'Shipment cancelled', category: 'info' },
} as const;

export const EXCEPTION_CATEGORIES = {
  delay: { label: 'Delay', defaultMessage: 'The shipment is delayed. We will update this page when it moves again.' },
  address_issue: {
    label: 'Address issue',
    defaultMessage: 'The delivery address needs to be confirmed before delivery can continue.',
  },
  customs_hold: {
    label: 'Held by customs',
    defaultMessage: 'Customs has held the shipment for review. Additional information may be requested.',
  },
  documentation: {
    label: 'Documents needed',
    defaultMessage: 'Additional documents are needed before the shipment can continue.',
  },
  damage: { label: 'Damage reported', defaultMessage: 'Damage has been reported. Our team is investigating.' },
  weather: { label: 'Weather disruption', defaultMessage: 'Weather conditions are affecting transport on this route.' },
  delivery_attempt_failed: {
    label: 'Delivery attempt unsuccessful',
    defaultMessage: 'A delivery attempt was made but could not be completed.',
  },
  other: { label: 'Other issue', defaultMessage: 'There is an issue with this shipment. Our team is working on it.' },
} as const;

export type ExceptionCategory = keyof typeof EXCEPTION_CATEGORIES;

export const EVENT_SOURCES = {
  staff_manual: 'Recorded by Crownline staff',
  carrier_api: 'Carrier tracking feed',
  carrier_webhook: 'Carrier notification',
  telematics: 'Vehicle telematics',
  system: 'Crownline system',
} as const;

export type EventSource = keyof typeof EVENT_SOURCES;
