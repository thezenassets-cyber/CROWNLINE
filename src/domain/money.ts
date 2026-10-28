export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

export function toMinor(major: number): number {
  return Math.round(major * 100);
}
