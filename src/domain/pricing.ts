import type { RateCard, ServiceRate } from './rateCard.ts';
import { CM_PER_IN, KG_PER_LB, round, roundUpTo, toCm, toKg, type LengthUnit, type WeightUnit } from './units.ts';
import type { ShipmentType } from '../config/services.ts';

export type PricingMode = 'demo' | 'rate_card' | 'disabled';

export interface PackageLine {
  quantity: number;
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface EstimateInput {
  pricingServiceCode: string;
  shipmentType: ShipmentType;
  originCountry: string;
  destinationCountry: string;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  packages: PackageLine[];
  declaredValueMinor: number | null;
  insurance: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface PackageWeight {
  quantity: number;
  actualKg: number;
  dimensionalKg: number | null;
  billableKgEach: number;
}

export interface WeightBreakdown {
  actualKg: number;
  dimensionalKg: number | null;
  billableKg: number;
  basis: 'actual' | 'dimensional' | 'minimum';
  packages: PackageWeight[];
  divisorDescription: string | null;
  roundingDescription: string;
}

export interface ChargeLine {
  code: string;
  label: string;
  amountMinor: number;
  explanation: string;
}

export interface EstimateResult {
  status: 'priced' | 'weight_only';
  pricingMode: PricingMode;
  isDemonstration: boolean;
  rateCardLabel: string;
  rateCardVersion: string;
  currency: string;
  serviceName: string;
  zone: 'domestic' | 'international';
  weights: WeightBreakdown;
  lines: ChargeLine[];
  totalMinor: number | null;
  transit: { minDays: number; maxDays: number } | null;
  exclusions: string[];
  assumptions: string[];
}

export type EstimateOutcome = { ok: true; result: EstimateResult } | { ok: false; errors: FieldError[] };

export function dimensionalWeightKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  dim: NonNullable<ServiceRate['dimensional']>,
): number {
  if (dim.unit === 'cm3_per_kg') return (lengthCm * widthCm * heightCm) / dim.divisor;
  const cubicInches = (lengthCm / CM_PER_IN) * (widthCm / CM_PER_IN) * (heightCm / CM_PER_IN);
  return (cubicInches / dim.divisor) * KG_PER_LB;
}

function roundBillable(kg: number, rounding: ServiceRate['rounding']): number {
  if (rounding.unit === 'kg') return roundUpTo(kg, rounding.increment);
  return roundUpTo(kg / KG_PER_LB, rounding.increment) * KG_PER_LB;
}

function describeDivisor(dim: ServiceRate['dimensional']): string | null {
  if (!dim) return null;
  return dim.unit === 'cm3_per_kg'
    ? `Length × width × height in cm ÷ ${dim.divisor.toLocaleString('en-US')}`
    : `Length × width × height in inches ÷ ${dim.divisor.toLocaleString('en-US')} (result in lb)`;
}

export function computeWeights(input: EstimateInput, rate: ServiceRate): WeightBreakdown {
  const useDimensional =
    rate.dimensional !== null && (input.shipmentType !== 'document' || rate.dimensionalAppliesToDocuments);

  const packages: PackageWeight[] = input.packages.map((p) => {
    const actualKg = toKg(p.weight, input.weightUnit);
    const dimKg = useDimensional
      ? dimensionalWeightKg(
          toCm(p.length, input.lengthUnit),
          toCm(p.width, input.lengthUnit),
          toCm(p.height, input.lengthUnit),
          rate.dimensional!,
        )
      : null;
    const raw = Math.max(actualKg, dimKg ?? 0);
    return {
      quantity: p.quantity,
      actualKg,
      dimensionalKg: dimKg,
      billableKgEach: rate.roundPerPackage ? roundBillable(raw, rate.rounding) : raw,
    };
  });

  const actualKg = packages.reduce((s, p) => s + p.actualKg * p.quantity, 0);
  const dimensionalKg = useDimensional ? packages.reduce((s, p) => s + (p.dimensionalKg ?? 0) * p.quantity, 0) : null;

  let billable = rate.roundPerPackage
    ? packages.reduce((s, p) => s + p.billableKgEach * p.quantity, 0)
    : roundBillable(Math.max(actualKg, dimensionalKg ?? 0), rate.rounding);

  let basis: WeightBreakdown['basis'] = dimensionalKg !== null && dimensionalKg > actualKg ? 'dimensional' : 'actual';
  if (billable < rate.minimumBillableKg) {
    billable = rate.minimumBillableKg;
    basis = 'minimum';
  }

  const roundingDescription = `Rounded up to the next ${rate.rounding.increment} ${rate.rounding.unit}${
    rate.roundPerPackage ? ' per package' : ' for the whole shipment'
  }${rate.minimumBillableKg > 0 ? `, minimum ${rate.minimumBillableKg} kg` : ''}.`;

  return {
    actualKg: round(actualKg, 3),
    dimensionalKg: dimensionalKg === null ? null : round(dimensionalKg, 3),
    billableKg: round(billable, 3),
    basis,
    packages: packages.map((p) => ({
      ...p,
      actualKg: round(p.actualKg, 3),
      dimensionalKg: p.dimensionalKg === null ? null : round(p.dimensionalKg, 3),
      billableKgEach: round(p.billableKgEach, 3),
    })),
    divisorDescription: describeDivisor(useDimensional ? rate.dimensional : null),
    roundingDescription,
  };
}

function validateAgainstRate(input: EstimateInput, rate: ServiceRate, zone: 'domestic' | 'international'): FieldError[] {
  const errors: FieldError[] = [];
  if (!rate.shipmentTypes.includes(input.shipmentType)) {
    errors.push({
      field: 'shipmentType',
      message: `${rate.name} does not handle ${input.shipmentType} shipments. Choose ${rate.shipmentTypes.join(' or ')}.`,
    });
  }
  if (!rate.zones[zone]) {
    errors.push({
      field: 'destinationCountry',
      message:
        zone === 'domestic'
          ? `${rate.name} is for shipments between different countries. Choose a domestic service instead.`
          : `${rate.name} is only for shipments within one country. Choose an international service instead.`,
    });
  }
  input.packages.forEach((p, i) => {
    const label = input.packages.length > 1 ? `Package line ${i + 1}: ` : '';
    const kg = toKg(p.weight, input.weightUnit);
    const longest = Math.max(toCm(p.length, input.lengthUnit), toCm(p.width, input.lengthUnit), toCm(p.height, input.lengthUnit));
    if (kg > rate.limits.maxPackageWeightKg) {
      errors.push({
        field: `packages.${i}.weight`,
        message: `${label}each package can weigh at most ${rate.limits.maxPackageWeightKg} kg on ${rate.name}. Request a freight quote for heavier items.`,
      });
    }
    if (longest > rate.limits.maxLengthCm) {
      errors.push({
        field: `packages.${i}.length`,
        message: `${label}the longest side can be at most ${rate.limits.maxLengthCm} cm on ${rate.name}.`,
      });
    }
  });
  return errors;
}

/**
 * Server-side estimate. Prices are only produced when a rate card is configured
 * (demo or owner-approved); in 'disabled' mode only the billable weight is shown.
 */
export function estimate(input: EstimateInput, card: RateCard, mode: PricingMode): EstimateOutcome {
  const rate = card.services[input.pricingServiceCode];
  if (!rate) {
    return {
      ok: false,
      errors: [{ field: 'service', message: 'This service is not configured for online estimates. Please request a quote.' }],
    };
  }
  const zone = input.originCountry === input.destinationCountry ? 'domestic' : 'international';
  const errors = validateAgainstRate(input, rate, zone);
  if (input.insurance) {
    if (!card.insurance) {
      errors.push({ field: 'insurance', message: 'Optional cover is not configured. Please mention it in a quote request.' });
    } else if (!input.declaredValueMinor || input.declaredValueMinor <= 0) {
      errors.push({ field: 'declaredValue', message: 'Enter the value of the goods to estimate optional cover.' });
    } else if (input.declaredValueMinor > card.insurance.maxDeclaredValueMinor) {
      errors.push({ field: 'declaredValue', message: 'This value is above the online limit for optional cover. Please request a quote.' });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const weights = computeWeights(input, rate);
  const zoneRate = rate.zones[zone]!;
  const assumptions: string[] = [];
  if (input.packages.some((p) => p.quantity > 1)) {
    assumptions.push('Packages on the same line are treated as identical in size and weight.');
  }
  assumptions.push('Collection and delivery addresses are assumed to be standard, accessible locations.');

  const base = {
    pricingMode: mode,
    isDemonstration: card.isDemonstration || mode === 'demo',
    rateCardLabel: card.label,
    rateCardVersion: card.version,
    currency: card.currency,
    serviceName: rate.name,
    zone,
    weights,
    transit: rate.transit[zone] ?? null,
    exclusions: rate.exclusions,
  } as const;

  if (mode === 'disabled') {
    assumptions.push(
      'Online pricing is not configured. Billable weight uses common industry rules shown above; your confirmed quote may use a carrier’s own rules.',
    );
    return { ok: true, result: { ...base, status: 'weight_only', lines: [], totalMinor: null, transit: null, assumptions } };
  }

  const lines: ChargeLine[] = [];
  const transportRaw = zoneRate.baseMinor + Math.round(zoneRate.perKgMinor * weights.billableKg);
  const transport = Math.max(transportRaw, zoneRate.minimumMinor);
  lines.push({
    code: 'transport',
    label: 'Transport',
    amountMinor: transport,
    explanation:
      transport > transportRaw
        ? 'Minimum charge for this service applies.'
        : `Base charge plus a rate per kilogram of billable weight (${weights.billableKg} kg).`,
  });

  if (rate.fuelSurchargePercent > 0) {
    lines.push({
      code: 'fuel',
      label: `Fuel surcharge (${rate.fuelSurchargePercent}%)`,
      amountMinor: Math.round((transport * rate.fuelSurchargePercent) / 100),
      explanation: 'Fuel surcharges change periodically with fuel prices.',
    });
  }

  for (const s of rate.surcharges) {
    let count = 0;
    if (s.appliesWhen === 'always') {
      count = s.kind === 'per_shipment' ? 1 : input.packages.reduce((n, p) => n + p.quantity, 0);
    } else {
      for (const p of input.packages) {
        const longest = Math.max(toCm(p.length, input.lengthUnit), toCm(p.width, input.lengthUnit), toCm(p.height, input.lengthUnit));
        const kg = toKg(p.weight, input.weightUnit);
        const hit =
          (s.appliesWhen === 'oversize' && rate.limits.oversizeLengthCm !== undefined && longest > rate.limits.oversizeLengthCm) ||
          (s.appliesWhen === 'overweight' && rate.limits.overweightPackageKg !== undefined && kg > rate.limits.overweightPackageKg);
        if (hit) count += s.kind === 'per_package' ? p.quantity : 1;
      }
      if (s.kind === 'per_shipment') count = Math.min(count, 1);
    }
    if (count > 0) {
      lines.push({
        code: s.code,
        label: count > 1 ? `${s.label} × ${count}` : s.label,
        amountMinor: s.amountMinor * count,
        explanation: s.explanation,
      });
    }
  }

  if (input.insurance && card.insurance && input.declaredValueMinor) {
    const premium = Math.max(
      Math.round((input.declaredValueMinor * card.insurance.percentOfDeclaredValue) / 100),
      card.insurance.minimumMinor,
    );
    lines.push({
      code: 'cover',
      label: 'Optional shipment cover',
      amountMinor: premium,
      explanation: `${card.insurance.percentOfDeclaredValue}% of declared value, minimum applies. Terms and exclusions apply.`,
    });
  }

  const totalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  return { ok: true, result: { ...base, status: 'priced', lines, totalMinor, assumptions } };
}
