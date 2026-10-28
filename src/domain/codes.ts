import { createHmac, randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so codes are easy to read aloud and retype. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = ALPHABET.length;

export function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  // 256 is a multiple of 32, so masking keeps the distribution uniform.
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! & 31];
  return out;
}

/** Luhn mod N check character: catches every single-character typo and most adjacent swaps. */
export function luhnCheckChar(payload: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = payload.length - 1; i >= 0; i--) {
    const codePoint = ALPHABET.indexOf(payload[i]!);
    if (codePoint < 0) throw new RangeError('invalid character');
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }
  const check = (N - (sum % N)) % N;
  return ALPHABET[check]!;
}

export const TRACKING_PREFIX = 'CL';
const TRACKING_RANDOM_LENGTH = 11; // 55 bits of entropy

/** Generates a public tracking code such as CL-7KQ2-M9XD-4TR8 (last char is a check digit). */
export function generateTrackingCode(): string {
  const payload = randomBase32(TRACKING_RANDOM_LENGTH);
  const body = payload + luhnCheckChar(payload);
  return formatTrackingCode(body);
}

export function formatTrackingCode(body: string): string {
  return `${TRACKING_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export type ParsedTrackingCode = { ok: true; body: string } | { ok: false; reason: 'format' | 'checksum' };

/** Normalises user input (case, spaces, dashes, look-alike characters) and validates it. */
export function parseTrackingCode(input: string): ParsedTrackingCode {
  let s = input.toUpperCase().replace(/[\s\-_.]/g, '');
  if (s.startsWith(TRACKING_PREFIX)) s = s.slice(TRACKING_PREFIX.length);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== TRACKING_RANDOM_LENGTH + 1 || ![...s].every((c) => ALPHABET.includes(c))) {
    return { ok: false, reason: 'format' };
  }
  const payload = s.slice(0, TRACKING_RANDOM_LENGTH);
  if (luhnCheckChar(payload) !== s.slice(TRACKING_RANDOM_LENGTH)) return { ok: false, reason: 'checksum' };
  return { ok: true, body: s };
}

/** Keyed hash so a database leak does not reveal usable tracking codes. */
export function hashTrackingCode(body: string, secret: string): string {
  return createHmac('sha256', secret).update(`tracking:${body}`).digest('hex');
}

export function shipmentReference(): string {
  return `CLS-${randomBase32(8)}`;
}

export function quoteReference(): string {
  return `CLQ-${randomBase32(8)}`;
}

export function documentReference(): string {
  return `CLD-${randomBase32(10)}`;
}
