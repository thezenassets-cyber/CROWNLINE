import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { Db, Queryable } from '../db/index.ts';
import { findServiceByCode } from '../config/services.ts';
import { documentReference } from '../domain/codes.ts';
import { countryName } from '../domain/countries.ts';
import { EXCEPTION_CATEGORIES, INFO_EVENT_TYPES, SYSTEM_EVENT_TYPES } from '../domain/events.ts';
import { formatMoney } from '../domain/money.ts';
import { can } from '../domain/permissions.ts';
import { ForbiddenError } from '../lib/errors.ts';
import { formatDate, formatDateTime } from '../lib/time.ts';
import { recordAudit } from './audit.ts';
import { loadMilestones } from './milestones.ts';
import { getQuoteRequest } from './quotes.ts';
import { getShipmentDetail, type StaffActor } from './shipments.ts';

const NAVY = '#0f1d36';
const GOLD = '#b8924a';
const INK = '#1d2433';
const MUTED = '#5b6475';

export interface GeneratedDocument {
  reference: string;
  filename: string;
  bytes: Buffer;
}

/** The standard PDF fonts only cover Windows-1252; replace anything else so text never renders as garbage. */
function t(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return String(value)
    .replace(/→/g, '->')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u20AC]/g, '?');
}

function newDoc(title: string) {
  return new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: title, Author: 'Crownline Express', Creator: 'Crownline platform' } });
}

function render(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 40;
      doc.save();
      doc.moveTo(50, bottom - 8).lineTo(doc.page.width - 50, bottom - 8).lineWidth(0.5).strokeColor('#d8d2c4').stroke();
      doc.fontSize(8).fillColor(MUTED).text(`Crownline Express  ·  Page ${i + 1} of ${range.count}`, 50, bottom, {
        width: doc.page.width - 100, align: 'center', lineBreak: false,
      });
      doc.restore();
    }
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string, reference: string, generatedBy: string, now: Date): void {
  doc.rect(0, 0, doc.page.width, 86).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('CROWNLINE LOGISTICS', 50, 28, { characterSpacing: 1.5 });
  doc.fillColor(GOLD).font('Helvetica').fontSize(9).text('One Partner. A World of Possibilities.', 50, 50);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(t(title), 300, 30, { width: doc.page.width - 350, align: 'right' });
  doc.font('Helvetica').fontSize(8).text(`Document ${reference}`, 300, 48, { width: doc.page.width - 350, align: 'right' });
  doc.rect(0, 86, doc.page.width, 3).fill(GOLD);
  doc.fillColor(MUTED).fontSize(8).text(`Generated ${t(formatDateTime(now))} by ${t(generatedBy)}`, 50, 100);
  doc.moveDown(1);
}

function notice(doc: PDFKit.PDFDocument, text: string, tone: 'info' | 'warning'): void {
  const y = doc.y;
  const h = doc.heightOfString(t(text), { width: doc.page.width - 124 }) + 16;
  doc.rect(50, y, doc.page.width - 100, h).fill(tone === 'warning' ? '#fbf3df' : '#eef1f6');
  doc.rect(50, y, 3, h).fill(tone === 'warning' ? GOLD : NAVY);
  doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(t(text), 62, y + 8, { width: doc.page.width - 124 });
  doc.y = y + h + 10;
  doc.x = 50;
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(t(title), 50);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).lineWidth(0.5).strokeColor(GOLD).stroke();
  doc.moveDown(0.5);
}

function rows(doc: PDFKit.PDFDocument, pairs: [string, string | number | null | undefined][]): void {
  for (const [k, v] of pairs) {
    if (doc.y > doc.page.height - 90) doc.addPage();
    const y = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(t(k), 50, y, { width: 150 });
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(t(v), 205, y, { width: doc.page.width - 255 });
    doc.y = Math.max(doc.y, y + 12) + 3;
  }
  doc.x = 50;
}

async function saveRecord(
  q: Queryable,
  actor: StaffActor,
  d: { reference: string; type: 'shipment_summary' | 'quote_estimate'; shipmentId?: string; quoteId?: string; bytes: Buffer },
): Promise<void> {
  const sha = createHash('sha256').update(d.bytes).digest('hex');
  await q.query(
    `insert into documents (reference, document_type, shipment_id, quote_request_id, generated_by, sha256, byte_size) values ($1,$2,$3,$4,$5,$6,$7)`,
    [d.reference, d.type, d.shipmentId ?? null, d.quoteId ?? null, actor.userId, sha, d.bytes.length],
  );
  await recordAudit(q, { userId: actor.userId, label: actor.label, ip: actor.ip }, {
    action: 'document.generated',
    entityType: d.shipmentId ? 'shipment' : 'quote_request',
    entityId: d.shipmentId ?? d.quoteId!,
    details: { reference: d.reference, type: d.type, sha256: sha },
  });
}

export async function generateShipmentSummary(db: Db, actor: StaffActor, shipmentId: string, now = new Date()): Promise<GeneratedDocument> {
  if (!can(actor.role, 'documents.generate')) throw new ForbiddenError();
  const detail = await getShipmentDetail(db, shipmentId);
  const defs = await loadMilestones(db);
  const s = detail.shipment;
  const label = (type: string) =>
    defs.find((m) => m.code === type)?.label ??
    (INFO_EVENT_TYPES as Record<string, { label: string }>)[type]?.label ??
    (SYSTEM_EVENT_TYPES as Record<string, { label: string }>)[type]?.label ??
    type;
  const reference = documentReference();
  const doc = newDoc(`Shipment summary ${s.reference}`);

  header(doc, 'Shipment summary', reference, actor.label, now);
  notice(doc, 'This Crownline shipment summary is produced from Crownline records at the time shown above. It is not a carrier label, air waybill, bill of lading, customs declaration, invoice or proof of delivery.', 'info');

  section(doc, 'Shipment');
  rows(doc, [
    ['Reference', s.reference],
    ['Service', findServiceByCode(s.service_code)?.name ?? s.service_code],
    ['Shipment type', s.shipment_type],
    ['Status', s.lifecycle_state === 'active' ? (s.delivered_at ? 'Delivered' : 'Active') : s.lifecycle_state],
    ['Current milestone', s.current_milestone ? label(s.current_milestone) : 'Not started'],
    ['Progress', `${s.progress_percent}%`],
    ['Carrier', s.carrier_name ? `${s.carrier_name}${s.carrier_tracking_number ? ` (${s.carrier_tracking_number})` : ''}` : 'Not assigned'],
    ['Estimated delivery', s.estimated_delivery_date ? `${formatDate(s.estimated_delivery_date)} (${s.estimated_delivery_source === 'carrier' ? 'carrier estimate' : 'Crownline estimate'})` : 'Not available'],
    ['Delivered', s.delivered_at ? formatDateTime(s.delivered_at) : 'Not yet confirmed'],
    ['Created', formatDateTime(s.created_at)],
  ]);

  section(doc, 'Route and parties');
  rows(doc, [
    ['Origin', `${s.origin_city}${s.origin_region ? `, ${s.origin_region}` : ''}, ${countryName(s.origin_country)}`],
    ['Destination', `${s.destination_city}${s.destination_region ? `, ${s.destination_region}` : ''}, ${countryName(s.destination_country)}`],
    ...detail.parties.map((p): [string, string] => [
      p.party_role === 'sender' ? 'Sender' : 'Recipient',
      [p.name, p.company, p.address_line1, p.address_line2, [p.postal_code, p.city].filter(Boolean).join(' '), p.country ? countryName(p.country) : null].filter(Boolean).join(', '),
    ]),
  ]);

  section(doc, 'Packages');
  rows(doc, detail.packages.map((p): [string, string] => [
    `Line ${p.package_index}`,
    `${p.quantity} × ${Number(p.weight_kg).toFixed(2)} kg, ${Number(p.length_cm).toFixed(1)} × ${Number(p.width_cm).toFixed(1)} × ${Number(p.height_cm).toFixed(1)} cm${p.description ? ` · ${p.description}` : ''}`,
  ]));
  if (s.declared_value_minor !== null) rows(doc, [['Declared value', formatMoney(s.declared_value_minor, s.declared_value_currency ?? 'USD')]]);

  section(doc, 'Confirmed events');
  const live = detail.events.filter((e) => !e.voided_at);
  if (live.length === 0) rows(doc, [['-', 'No events recorded yet.']]);
  else rows(doc, live.map((e): [string, string] => [
    formatDateTime(e.occurred_at, e.occurred_timezone ?? 'UTC'),
    `${label(e.event_type)}${e.location_label ? ` · ${e.location_label}${e.location_country ? `, ${e.location_country}` : ''}` : ''}${e.public_note ? ` · ${e.public_note}` : ''}`,
  ]));

  const open = detail.exceptions.filter((x) => !x.resolved_at);
  if (open.length) {
    section(doc, 'Open issues');
    rows(doc, open.map((x): [string, string] => [EXCEPTION_CATEGORIES[x.category].label, x.customer_message]));
  }

  const bytes = await render(doc);
  await db.transaction((tx) => saveRecord(tx, actor, { reference, type: 'shipment_summary', shipmentId, bytes }));
  return { reference, filename: `${s.reference}-summary-${reference}.pdf`, bytes };
}

export async function generateQuoteEstimate(db: Db, actor: StaffActor, quoteId: string, now = new Date()): Promise<GeneratedDocument> {
  if (!can(actor.role, 'documents.generate')) throw new ForbiddenError();
  const q = await getQuoteRequest(db, quoteId);
  const est = q.estimate;
  if (!est) throw new ForbiddenError('This request has no estimate to document.');
  const reference = documentReference();
  const doc = newDoc(`Estimate ${q.reference}`);

  header(doc, est.isDemonstration ? 'Demonstration estimate' : 'Indicative estimate', reference, actor.label, now);
  if (est.isDemonstration) {
    notice(doc, 'DEMONSTRATION FIGURES. These amounts come from a sample rate card used to demonstrate the platform. They are not a carrier rate, not a quote and not an offer.', 'warning');
  }
  notice(doc, 'This estimate is indicative only and is not an invoice or a binding quotation. A confirmed price, service and conditions will be provided in writing by Crownline before booking. Duties, taxes and charges imposed by authorities are not included.', 'info');

  section(doc, 'Request');
  rows(doc, [
    ['Quote request', q.reference],
    ['Received', formatDateTime(q.created_at)],
    ['Prepared for', `${q.contact_name}${q.company ? `, ${q.company}` : ''}`],
    ['Service', est.serviceName],
    ['Route', `${[q.origin_city, countryName(q.origin_country)].filter(Boolean).join(', ')} -> ${[q.destination_city, countryName(q.destination_country)].filter(Boolean).join(', ')}`],
    ['Packages', q.packages.map((p) => `${p.quantity} × ${p.weight} ${p.weightUnit}, ${p.length} × ${p.width} × ${p.height} ${p.lengthUnit}`).join('; ')],
  ]);

  section(doc, 'Weight');
  rows(doc, [
    ['Actual weight', `${est.weights.actualKg.toFixed(2)} kg`],
    ['Dimensional weight', est.weights.dimensionalKg !== null ? `${est.weights.dimensionalKg.toFixed(2)} kg` : 'Not applied'],
    ['Billable weight', `${est.weights.billableKg.toFixed(2)} kg (${est.weights.basis})`],
    ['Method', [est.weights.divisorDescription, est.weights.roundingDescription].filter(Boolean).join('. ')],
  ]);

  if (est.status === 'priced') {
    section(doc, 'Charges');
    rows(doc, est.lines.map((l): [string, string] => [l.label, `${formatMoney(l.amountMinor, est.currency)}  (${l.explanation})`]));
    if (est.totalMinor !== null) rows(doc, [['Estimated total', `${formatMoney(est.totalMinor, est.currency)} ${est.currency}`]]);
  }
  if (est.transit) rows(doc, [['Typical transit', `${est.transit.minDays}-${est.transit.maxDays} business days after collection (not guaranteed)`]]);

  section(doc, 'Assumptions and exclusions');
  rows(doc, [...est.assumptions.map((a): [string, string] => ['Assumption', a]), ...est.exclusions.map((e): [string, string] => ['Not included', e])]);
  rows(doc, [['Rate card', `${est.rateCardLabel} (${est.rateCardVersion})`]]);

  const bytes = await render(doc);
  await db.transaction((tx) => saveRecord(tx, actor, { reference, type: 'quote_estimate', quoteId, bytes }));
  return { reference, filename: `${q.reference}-estimate-${reference}.pdf`, bytes };
}
