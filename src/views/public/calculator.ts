import { html, type SafeHtml } from '../../lib/html.ts';
import { translate, type Lang } from '../../i18n/index.ts';
import type { AppConfig } from '../../config/env.ts';
import { SERVICES } from '../../config/services.ts';
import { formatMoney } from '../../domain/money.ts';
import { countryName } from '../../domain/countries.ts';
import type { EstimateResult } from '../../domain/pricing.ts';
import { fromKg } from '../../domain/units.ts';
import type { FieldErrors } from '../../validation/schemas.ts';
import { countrySelect, errorSummary, notice, selectField, textField, type Values } from '../components.ts';
import { icons } from '../icons.ts';

export const CALCULATOR_FIELDS = [
  'service', 'shipmentType', 'originCountry', 'originCity', 'originPostalCode', 'destinationCountry', 'destinationCity',
  'destinationPostalCode', 'quantity', 'weight', 'weightUnit', 'length', 'width', 'height', 'lengthUnit', 'declaredValue', 'insurance',
] as const;

export const PRICED_SERVICES = SERVICES.filter((s) => s.pricingServiceCode && s.availability === 'quote_on_request');

const TYPE_OPTIONS = [
  { value: 'parcel', label: 'Parcel (boxes)' },
  { value: 'document', label: 'Documents (envelope)' },
  { value: 'pallet', label: 'Pallet' },
  { value: 'freight', label: 'Other freight' },
];

export function calculatorDefaults(v: Values): Values {
  return { service: 'international_parcel', shipmentType: 'parcel', quantity: '1', weightUnit: 'kg', lengthUnit: 'cm', ...v };
}

export function pricingModeNotice(config: AppConfig): SafeHtml {
  if (config.pricingMode === 'demo') return html``;
  if (config.pricingMode === 'disabled') {
    return notice('info', 'Online prices are not available yet', 'The calculator shows how your shipment will be measured for pricing (its billable weight). Request a quote and our team will confirm the price.');
  }
  return notice('info', 'Estimate from Crownline’s published rate card', 'Final prices are confirmed after our team reviews your shipment details.');
}

export function calculatorForm(values: Values, errors: FieldErrors | undefined, opts: { compact?: boolean; action?: string; lang?: Lang } = {}): SafeHtml {
  const lang = opts.lang ?? 'en';
  const v = calculatorDefaults(values);
  const serviceOptions = PRICED_SERVICES.map((s) => ({ value: s.code, label: s.name }));
  return html`<form class="calc-form ${opts.compact ? 'calc-compact' : ''}" method="get" action="${opts.action ?? '/calculator'}#result" novalidate>
    ${errorSummary(errors)}
    <fieldset class="fieldset">
      <legend>${translate(lang, 'calc.service', 'Service')}</legend>
      <div class="grid-2">
        ${selectField({ name: 'service', label: 'Service', values: v, errors, options: serviceOptions, required: true })}
        ${selectField({ name: 'shipmentType', label: 'What are you sending?', values: v, errors, options: TYPE_OPTIONS, required: true })}
      </div>
    </fieldset>
    <fieldset class="fieldset">
      <legend>${translate(lang, 'calc.route', 'Route')}</legend>
      <div class="grid-2">
        ${countrySelect({ name: 'originCountry', label: 'From (country)', values: v, errors, required: true, autocomplete: 'section-origin country' })}
        ${countrySelect({ name: 'destinationCountry', label: 'To (country)', values: v, errors, required: true, autocomplete: 'section-destination country' })}
        ${opts.compact ? '' : html`
          ${textField({ name: 'originCity', label: 'From city', values: v, errors, autocomplete: 'section-origin address-level2', maxlength: 100 })}
          ${textField({ name: 'destinationCity', label: 'To city', values: v, errors, autocomplete: 'section-destination address-level2', maxlength: 100 })}
          ${textField({ name: 'originPostalCode', label: 'From postal code', values: v, errors, autocomplete: 'section-origin postal-code', maxlength: 20 })}
          ${textField({ name: 'destinationPostalCode', label: 'To postal code', values: v, errors, autocomplete: 'section-destination postal-code', maxlength: 20 })}`}
      </div>
    </fieldset>
    <fieldset class="fieldset">
      <legend>${translate(lang, 'calc.packages', 'Packages')}</legend>
      <p class="hint">Enter the size and weight of one package. If you have several identical packages, set the quantity.</p>
      <div class="grid-4">
        ${textField({ name: 'quantity', label: 'Quantity', values: v, errors, type: 'number', inputmode: 'numeric', min: '1', max: '99', step: '1', required: true })}
        ${textField({ name: 'weight', label: translate(lang, 'calc.weight', 'Weight each'), values: v, errors, type: 'number', inputmode: 'decimal', min: '0', step: 'any', required: true })}
        ${selectField({ name: 'weightUnit', label: 'Weight unit', values: v, errors, options: [{ value: 'kg', label: 'kilograms (kg)' }, { value: 'lb', label: 'pounds (lb)' }], required: true })}
        ${selectField({ name: 'lengthUnit', label: 'Size unit', values: v, errors, options: [{ value: 'cm', label: 'centimetres (cm)' }, { value: 'in', label: 'inches (in)' }], required: true })}
      </div>
      <div class="grid-3">
        ${textField({ name: 'length', label: translate(lang, 'calc.length', 'Length'), values: v, errors, type: 'number', inputmode: 'decimal', min: '0', step: 'any', required: true })}
        ${textField({ name: 'width', label: translate(lang, 'calc.width', 'Width'), values: v, errors, type: 'number', inputmode: 'decimal', min: '0', step: 'any', required: true })}
        ${textField({ name: 'height', label: translate(lang, 'calc.height', 'Height'), values: v, errors, type: 'number', inputmode: 'decimal', min: '0', step: 'any', required: true })}
      </div>
    </fieldset>
    <p class="small muted">${translate(lang, 'calc.valueNote', 'Declared value and shipment cover are recorded by your coordinator when the shipment is created.')}</p>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${icons.calculator()} ${translate(lang, 'calc.calculate', 'Calculate')}</button>
      ${opts.compact ? html`<a class="link-quiet" href="/calculator">More options (cities and postal codes)</a>` : ''}
    </div>
  </form>`;
}

function kg(value: number, unit: string): string {
  if (unit === 'lb') return `${fromKg(value, 'lb').toFixed(2)} lb (${value.toFixed(2)} kg)`;
  return `${value.toFixed(2)} kg`;
}

export function quoteLink(values: Values): string {
  const q = new URLSearchParams();
  for (const k of CALCULATOR_FIELDS) {
    const val = values[k];
    if (val) q.set(k, val);
  }
  return `/quote?${q.toString()}`;
}

export function estimateResultView(r: EstimateResult, values: Values, lang: Lang = 'en'): SafeHtml {
  const unit = values.weightUnit ?? 'kg';
  const route = `${countryName(values.originCountry ?? '')}${values.originCity ? ` (${values.originCity})` : ''} → ${countryName(values.destinationCountry ?? '')}${values.destinationCity ? ` (${values.destinationCity})` : ''}`;
  const basisText =
    r.weights.basis === 'dimensional'
      ? 'Your packages take up more space than their weight suggests, so the size-based (dimensional) weight is used.'
      : r.weights.basis === 'minimum'
        ? 'Your shipment is below the minimum chargeable weight for this service, so the minimum applies.'
        : 'Your packages are heavier than their size-based weight, so the actual weight is used.';

  return html`<section class="result-card" id="result" aria-labelledby="result-title" tabindex="-1" data-autofocus>
    <header class="result-head">
      <div>
        <p class="eyebrow">${r.serviceName} · ${r.zone === 'domestic' ? 'Domestic' : 'International'}</p>
        <h2 id="result-title">${r.status === 'priced' ? (r.isDemonstration ? 'Demonstration estimate' : 'Indicative estimate') : 'Billable weight'}</h2>
        <p class="muted">${route}</p>
      </div>
      ${r.status === 'priced' && r.totalMinor !== null
        ? html`<div class="result-total">
            <span class="result-total-label">${r.isDemonstration ? 'Sample total (not a quote)' : 'Estimated total'}</span>
            <strong>${formatMoney(r.totalMinor, r.currency)}</strong>
            <span class="small muted">${r.currency}, excluding items listed below</span>
          </div>`
        : html`<div class="result-total"><span class="result-total-label">Billable weight</span><strong>${kg(r.weights.billableKg, unit)}</strong></div>`}
    </header>

    ${r.isDemonstration && r.status === 'priced'
      ? notice('demo', 'These are sample figures', `Calculated from "${r.rateCardLabel}". They show how pricing works and are not a carrier rate or a confirmed price.`)
      : ''}

    <div class="result-grid">
      <div>
        <h3>How your shipment is measured</h3>
        <dl class="dl">
          <div><dt>${translate(lang, 'calc.actual', 'Actual weight')}</dt><dd>${kg(r.weights.actualKg, unit)}</dd></div>
          ${r.weights.dimensionalKg !== null
            ? html`<div><dt>${translate(lang, 'calc.dimensional', 'Dimensional weight')}</dt><dd>${kg(r.weights.dimensionalKg, unit)}</dd></div>`
            : html`<div><dt>${translate(lang, 'calc.dimensional', 'Dimensional weight')}</dt><dd>Not applied to documents on this service</dd></div>`}
          <div><dt>${translate(lang, 'calc.billable', 'Billable weight')}</dt><dd><strong>${kg(r.weights.billableKg, unit)}</strong></dd></div>
          <div><dt>${translate(lang, 'calc.distance', 'Distance')}</dt><dd>${r.distanceKm === null
            ? translate(lang, values.originCountry === values.destinationCountry ? 'calc.distanceSame' : 'calc.distanceMissing', 'Your coordinator records the kilometres.')
            : html`${r.distanceKm.toLocaleString('en-US')} km`}</dd></div>
        </dl>
        ${r.distanceKm !== null ? html`<p class="small muted">${translate(lang, 'calc.distanceNote', r.distanceNote)}</p>` : ''}
        <p class="small">${basisText}</p>
        ${r.weights.divisorDescription ? html`<p class="small muted">Dimensional weight = ${r.weights.divisorDescription}. ${r.weights.roundingDescription}</p>` : html`<p class="small muted">${r.weights.roundingDescription}</p>`}
      </div>
      <div>
        ${r.status === 'priced'
          ? html`<h3>Charges</h3>
            <table class="table table-compact">
              <caption class="visually-hidden">Itemised charges</caption>
              <thead><tr><th scope="col">Item</th><th scope="col" class="num">Amount</th></tr></thead>
              <tbody>
                ${r.lines.map((l) => html`<tr><td>${l.label}<span class="cell-note">${l.explanation}</span></td><td class="num">${formatMoney(l.amountMinor, r.currency)}</td></tr>`)}
              </tbody>
              <tfoot><tr><th scope="row">Total</th><td class="num"><strong>${formatMoney(r.totalMinor ?? 0, r.currency)}</strong></td></tr></tfoot>
            </table>`
          : html`<h3>Price</h3><p>Online pricing is not configured. Request a quote and a coordinator will confirm the price and service options.</p>`}
        ${r.transit
          ? html`<p class="small">${icons.clock()} Typical transit for this service: <strong>${r.transit.minDays}–${r.transit.maxDays} business days</strong> after collection. This is a general range, not a delivery commitment.</p>`
          : ''}
      </div>
    </div>

    <div class="result-grid">
      ${r.exclusions.length
        ? html`<div><h3>Not included</h3><ul class="list-tight">${r.exclusions.map((e) => html`<li>${e}</li>`)}</ul></div>`
        : ''}
      <div><h3>Assumptions</h3><ul class="list-tight">${r.assumptions.map((a) => html`<li>${a}</li>`)}</ul></div>
    </div>

    <div class="result-actions">
      <a class="btn btn-gold" href="${quoteLink(values)}">Request a confirmed quote with these details ${icons.arrowRight()}</a>
      <p class="small muted">Your details carry over, so you will not need to retype them.</p>
    </div>
  </section>`;
}

export function priceFactors(): SafeHtml {
  return html`<div class="factors">
    <h2 class="h3">What affects the price</h2>
    <ul class="factor-list">
      <li><strong>Billable weight.</strong> Carriers charge for the greater of the actual weight and the dimensional weight, which reflects how much space a package takes up.</li>
      <li><strong>Route.</strong> International shipments involve export and import steps and usually cost more than domestic ones.</li>
      <li><strong>Service.</strong> Faster services cost more. Sea freight is slower but often cheaper for heavy goods.</li>
      <li><strong>Size and handling.</strong> Very long or heavy packages can attract handling surcharges.</li>
      <li><strong>Fuel and extras.</strong> Fuel surcharges change over time; optional cover and special handling are extra.</li>
      <li><strong>Duties and taxes.</strong> Import charges are set by the destination country and are not part of the shipping price.</li>
    </ul>
  </div>`;
}
