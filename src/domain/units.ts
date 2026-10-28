export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_IN;
}

/** Rounds up to the next multiple of `increment`, tolerating floating-point noise. */
export function roundUpTo(value: number, increment: number): number {
  if (increment <= 0) throw new RangeError('increment must be positive');
  const steps = value / increment;
  const rounded = Math.ceil(steps - 1e-9);
  return Number((rounded * increment).toFixed(6));
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
