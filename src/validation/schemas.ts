import { z } from 'zod';
import { isCountryCode } from '../domain/countries.ts';
import { ROLES } from '../domain/permissions.ts';
import { EXCEPTION_CATEGORIES, INFO_EVENT_TYPES } from '../domain/events.ts';
import { isValidTimeZone } from '../lib/time.ts';

const text = (max: number, label: string) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `${label[0]!.toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const country = (label: string) =>
  z
    .string({ error: `Choose the ${label} country.` })
    .trim()
    .toUpperCase()
    .refine(isCountryCode, `Choose the ${label} country from the list.`);

const optionalCountry = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isCountryCode(v), 'Choose a country from the list.');

const positive = (label: string, max: number) =>
  z.coerce
    .number({ error: `Enter the ${label} as a number.` })
    .refine(Number.isFinite, `Enter the ${label} as a number.`)
    .gt(0, `The ${label} must be more than zero.`)
    .max(max, `The ${label} looks too large. Please check it or request a quote.`);

const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('1')])
  .optional()
  .transform((v) => v !== undefined);

const email = z
  .string({ error: 'Enter an email address.' })
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'The form expired. Please submit it again.');

export const SHIPMENT_TYPES = ['parcel', 'document', 'pallet', 'freight'] as const;

export const EstimateFormSchema = z.object({
  service: z.string().trim().min(1, 'Choose a service.').max(50),
  shipmentType: z.enum(SHIPMENT_TYPES, { error: 'Choose what you are sending.' }),
  originCountry: country('origin'),
  originCity: optionalText(100),
  originPostalCode: optionalText(20),
  destinationCountry: country('destination'),
  destinationCity: optionalText(100),
  destinationPostalCode: optionalText(20),
  quantity: z.coerce
    .number({ error: 'Enter how many packages.' })
    .int('Enter a whole number of packages.')
    .min(1, 'Enter at least one package.')
    .max(99, 'For more than 99 packages, please request a quote.'),
  weight: positive('weight', 10_000),
  weightUnit: z.enum(['kg', 'lb']),
  length: positive('length', 1_500),
  width: positive('width', 1_500),
  height: positive('height', 1_500),
  lengthUnit: z.enum(['cm', 'in']),
  declaredValue: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 10_000_000), 'Enter the value as a number, for example 250.'),
  insurance: checkbox,
});
export type EstimateForm = z.infer<typeof EstimateFormSchema>;

export const QuoteRequestSchema = EstimateFormSchema.extend({
  contactName: text(120, 'your name'),
  contactEmail: email,
  contactPhone: optionalText(40),
  company: optionalText(160),
  notes: optionalText(2000),
  consent: z.literal('on', { error: 'Please confirm we may contact you about this request.' }),
  idempotencyKey,
});
export type QuoteRequestForm = z.infer<typeof QuoteRequestSchema>;

export const CONTACT_TOPICS = ['quote', 'tracking', 'business', 'claims', 'other'] as const;
export const ContactSchema = z.object({
  name: text(120, 'your name'),
  email,
  topic: z.enum(CONTACT_TOPICS, { error: 'Choose a topic.' }),
  message: z.string().trim().min(10, 'Please write at least a sentence so we can help.').max(4000, 'Message must be 4,000 characters or fewer.'),
  website: z.string().max(0, 'Leave this field empty.').optional(),
});

export const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter your username.').max(254),
  password: z.string().min(1).max(200),
});

export const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: z.string().min(12, 'Use at least 12 characters.').max(200),
    confirmPassword: z.string().max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a different password.' });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || z.email().safeParse(v).success, 'Enter a valid email address.');

export const CreateShipmentSchema = z.object({
  serviceCode: z.string().trim().min(1).max(50),
  shipmentType: z.enum(SHIPMENT_TYPES),
  carrierName: optionalText(100),
  carrierTrackingNumber: optionalText(100),
  originCity: text(100, 'the origin city'),
  originRegion: optionalText(100),
  originPostalCode: optionalText(20),
  originCountry: country('origin'),
  destinationCity: text(100, 'the destination city'),
  destinationRegion: optionalText(100),
  destinationPostalCode: optionalText(20),
  destinationCountry: country('destination'),
  senderName: text(160, 'the sender name'),
  senderCompany: optionalText(160),
  senderEmail: optionalEmail,
  senderPhone: optionalText(40),
  senderAddress1: optionalText(200),
  senderAddress2: optionalText(200),
  senderPostalCode: optionalText(20),
  recipientName: text(160, 'the recipient name'),
  recipientCompany: optionalText(160),
  recipientEmail: optionalEmail,
  recipientPhone: optionalText(40),
  recipientAddress1: optionalText(200),
  recipientAddress2: optionalText(200),
  recipientPostalCode: optionalText(20),
  quantity: z.coerce.number().int().min(1, 'Enter at least one package.').max(999),
  weight: positive('weight', 50_000),
  weightUnit: z.enum(['kg', 'lb']),
  length: positive('length', 2_000),
  width: positive('width', 2_000),
  height: positive('height', 2_000),
  lengthUnit: z.enum(['cm', 'in']),
  packageDescription: optionalText(200),
  contentsDescription: optionalText(500),
  declaredValue: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), 'Enter a valid declared value.'),
  declaredValueCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^[A-Z]{3}$/.test(v), 'Use a three-letter currency code such as USD.'),
  distanceKm: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 40_000), 'Enter the distance in kilometres, up to 40,000.'),
  coverIncluded: checkbox,
  estimatedDeliveryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date.'),
  recordBooking: checkbox,
  idempotencyKey,
});
export type CreateShipmentForm = z.infer<typeof CreateShipmentSchema>;

export const AddEventSchema = z.object({
  eventType: z.string().trim().min(1, 'Choose an event type.').max(60),
  occurredAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter the date and time the event happened.'),
  timeZone: z.string().trim().refine(isValidTimeZone, 'Choose a valid time zone, for example Europe/London.'),
  locationLabel: optionalText(120),
  locationCountry: optionalCountry,
  publicNote: optionalText(500),
  internalNote: optionalText(1000),
  evidenceReference: optionalText(200),
});
export const INFO_EVENT_CODES = Object.keys(INFO_EVENT_TYPES);

export const ReasonSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters.').max(500),
  confirm: z.literal('on', { error: 'Tick the confirmation box to continue.' }),
});

export const OpenExceptionSchema = z.object({
  category: z.enum(Object.keys(EXCEPTION_CATEGORIES) as [keyof typeof EXCEPTION_CATEGORIES, ...(keyof typeof EXCEPTION_CATEGORIES)[]]),
  customerMessage: optionalText(500),
  internalNote: optionalText(1000),
});

export const ResolveExceptionSchema = z.object({
  resolutionNote: z.string().trim().min(3, 'Describe how the issue was resolved.').max(500),
});

export const DisplayProgressSchema = z.object({
  displayProgress: z.string().trim().max(3).optional(),
  clear: z.string().trim().optional(),
});

export const ChargeSchema = z.object({
  description: z.string().trim().min(3, 'Describe the charge in at least 3 characters.').max(160),
  amount: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 10_000_000, 'Enter an amount from 0 to 10000000, with up to two decimal places.'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as USD.'),
  issuedOn: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid issue date.'),
  publicNote: optionalText(300),
  visibility: z.enum(['draft', 'published']),
});

export const ChargeStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'settled', 'withdrawn']),
});

export const EstimatedDeliverySchema = z.object({
  estimatedDeliveryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date.'),
});

export const CreateUserSchema = z.object({
  email,
  displayName: text(120, 'a display name'),
  role: z.enum(ROLES),
});

export const UpdateRoleSchema = z.object({ role: z.enum(ROLES) });

export const QUOTE_STATUSES = ['new', 'in_review', 'quoted', 'declined', 'closed'] as const;
export const QuoteStatusSchema = z.object({ status: z.enum(QUOTE_STATUSES) });

export interface FieldErrors {
  [field: string]: string;
}

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
