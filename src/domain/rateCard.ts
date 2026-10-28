import { readFileSync } from 'node:fs';
import { z } from 'zod';

const ZoneRate = z.object({
  baseMinor: z.number().int().min(0),
  perKgMinor: z.number().int().min(0),
  minimumMinor: z.number().int().min(0),
});

const TransitRange = z.object({ minDays: z.number().int().min(0), maxDays: z.number().int().min(0) });

const Surcharge = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  explanation: z.string().min(1),
  kind: z.enum(['per_package', 'per_shipment']),
  amountMinor: z.number().int().min(0),
  appliesWhen: z.enum(['always', 'oversize', 'overweight']),
});

const ServiceRate = z.object({
  name: z.string().min(1),
  shipmentTypes: z.array(z.enum(['parcel', 'document', 'pallet', 'freight'])).min(1),
  zones: z.object({ domestic: ZoneRate.optional(), international: ZoneRate.optional() }),
  transit: z.object({ domestic: TransitRange.optional(), international: TransitRange.optional() }),
  /** Volumetric divisor, e.g. 5000 cm³/kg or 139 in³/lb. Null when the service charges actual weight only. */
  dimensional: z
    .object({ divisor: z.number().positive(), unit: z.enum(['cm3_per_kg', 'in3_per_lb']) })
    .nullable(),
  /** Documents typically ship in envelopes priced on actual weight. */
  dimensionalAppliesToDocuments: z.boolean().default(false),
  rounding: z.object({ increment: z.number().positive(), unit: z.enum(['kg', 'lb']) }),
  /** When true each package is rounded before summing (common for parcel carriers). */
  roundPerPackage: z.boolean(),
  minimumBillableKg: z.number().min(0).default(0),
  limits: z.object({
    maxPackageWeightKg: z.number().positive(),
    maxLengthCm: z.number().positive(),
    oversizeLengthCm: z.number().positive().optional(),
    overweightPackageKg: z.number().positive().optional(),
  }),
  fuelSurchargePercent: z.number().min(0).max(100),
  surcharges: z.array(Surcharge).default([]),
  exclusions: z.array(z.string()).default([]),
});

export const RateCardSchema = z.object({
  version: z.string().min(1),
  label: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  isDemonstration: z.boolean(),
  effectiveFrom: z.string().optional(),
  insurance: z
    .object({
      percentOfDeclaredValue: z.number().min(0).max(100),
      minimumMinor: z.number().int().min(0),
      maxDeclaredValueMinor: z.number().int().positive(),
    })
    .optional(),
  services: z.record(z.string(), ServiceRate),
});

export type RateCard = z.infer<typeof RateCardSchema>;
export type ServiceRate = z.infer<typeof ServiceRate>;
export type ZoneRateT = z.infer<typeof ZoneRate>;

/**
 * Sample prices for demonstration mode only. These are NOT carrier rates and must
 * never be presented as a confirmed quote.
 */
export const DEMO_RATE_CARD: RateCard = RateCardSchema.parse({
  version: 'demo-2026-10',
  label: 'Demonstration pricing (sample figures, not a quote)',
  currency: 'USD',
  isDemonstration: true,
  insurance: { percentOfDeclaredValue: 1.5, minimumMinor: 500, maxDeclaredValueMinor: 5_000_000 },
  services: {
    domestic_parcel: {
      name: 'Domestic parcel',
      shipmentTypes: ['parcel', 'document'],
      zones: { domestic: { baseMinor: 900, perKgMinor: 180, minimumMinor: 1200 } },
      transit: { domestic: { minDays: 1, maxDays: 4 } },
      dimensional: { divisor: 5000, unit: 'cm3_per_kg' },
      rounding: { increment: 0.5, unit: 'kg' },
      roundPerPackage: true,
      limits: { maxPackageWeightKg: 70, maxLengthCm: 274, oversizeLengthCm: 120, overweightPackageKg: 32 },
      fuelSurchargePercent: 8,
      surcharges: [
        {
          code: 'oversize',
          label: 'Large package handling',
          explanation: 'Applied per package when the longest side exceeds 120 cm.',
          kind: 'per_package',
          amountMinor: 1500,
          appliesWhen: 'oversize',
        },
        {
          code: 'heavy',
          label: 'Heavy package handling',
          explanation: 'Applied per package heavier than 32 kg.',
          kind: 'per_package',
          amountMinor: 1200,
          appliesWhen: 'overweight',
        },
      ],
      exclusions: ['Remote-area delivery surcharges', 'Redelivery or address correction fees'],
    },
    international_parcel: {
      name: 'International parcel',
      shipmentTypes: ['parcel', 'document'],
      zones: { international: { baseMinor: 2800, perKgMinor: 950, minimumMinor: 3500 } },
      transit: { international: { minDays: 3, maxDays: 8 } },
      dimensional: { divisor: 5000, unit: 'cm3_per_kg' },
      rounding: { increment: 0.5, unit: 'kg' },
      roundPerPackage: true,
      limits: { maxPackageWeightKg: 70, maxLengthCm: 274, oversizeLengthCm: 120, overweightPackageKg: 32 },
      fuelSurchargePercent: 12,
      surcharges: [
        {
          code: 'customs_data',
          label: 'Customs data preparation',
          explanation: 'Preparing commercial invoice data for export and import (not customs duties).',
          kind: 'per_shipment',
          amountMinor: 900,
          appliesWhen: 'always',
        },
        {
          code: 'oversize',
          label: 'Large package handling',
          explanation: 'Applied per package when the longest side exceeds 120 cm.',
          kind: 'per_package',
          amountMinor: 2500,
          appliesWhen: 'oversize',
        },
      ],
      exclusions: [
        'Import duties and taxes',
        'Customs brokerage at destination',
        'Remote-area delivery surcharges',
      ],
    },
    air_freight: {
      name: 'Air freight',
      shipmentTypes: ['pallet', 'freight'],
      zones: { international: { baseMinor: 12000, perKgMinor: 420, minimumMinor: 25000 } },
      transit: { international: { minDays: 4, maxDays: 10 } },
      dimensional: { divisor: 6000, unit: 'cm3_per_kg' },
      rounding: { increment: 1, unit: 'kg' },
      roundPerPackage: false,
      limits: { maxPackageWeightKg: 1500, maxLengthCm: 300 },
      fuelSurchargePercent: 18,
      surcharges: [
        {
          code: 'security_screening',
          label: 'Security screening',
          explanation: 'Air cargo screening before acceptance.',
          kind: 'per_shipment',
          amountMinor: 4500,
          appliesWhen: 'always',
        },
      ],
      exclusions: [
        'Origin collection and destination delivery',
        'Import duties, taxes and customs brokerage',
        'Airport storage beyond free time',
        'Dangerous goods handling',
      ],
    },
    ocean_freight_lcl: {
      name: 'Ocean freight (shared container, LCL)',
      shipmentTypes: ['pallet', 'freight'],
      zones: { international: { baseMinor: 35000, perKgMinor: 12, minimumMinor: 45000 } },
      transit: { international: { minDays: 20, maxDays: 45 } },
      dimensional: { divisor: 1000, unit: 'cm3_per_kg' },
      rounding: { increment: 1, unit: 'kg' },
      roundPerPackage: false,
      minimumBillableKg: 1000,
      limits: { maxPackageWeightKg: 3000, maxLengthCm: 600 },
      fuelSurchargePercent: 0,
      surcharges: [
        {
          code: 'documentation',
          label: 'Bill of lading and documentation',
          explanation: 'Preparation of shipping documents for the sea leg.',
          kind: 'per_shipment',
          amountMinor: 7500,
          appliesWhen: 'always',
        },
      ],
      exclusions: [
        'Origin and destination port and terminal charges',
        'Import duties, taxes and customs brokerage',
        'Container freight station fees',
        'Inland delivery from the destination port',
      ],
    },
    road_freight: {
      name: 'Road freight',
      shipmentTypes: ['pallet', 'freight'],
      zones: {
        domestic: { baseMinor: 8500, perKgMinor: 55, minimumMinor: 15000 },
        international: { baseMinor: 15000, perKgMinor: 85, minimumMinor: 25000 },
      },
      transit: { domestic: { minDays: 1, maxDays: 4 }, international: { minDays: 3, maxDays: 8 } },
      dimensional: { divisor: 3000, unit: 'cm3_per_kg' },
      rounding: { increment: 1, unit: 'kg' },
      roundPerPackage: false,
      limits: { maxPackageWeightKg: 1500, maxLengthCm: 400 },
      fuelSurchargePercent: 14,
      surcharges: [],
      exclusions: ['Tail-lift, booked delivery slots and waiting time', 'Border clearance for cross-border moves'],
    },
  },
});

export function loadRateCardFile(path: string): RateCard {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return RateCardSchema.parse(raw);
}
