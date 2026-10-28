import { html, type SafeHtml } from '../../lib/html.ts';
import type { AppConfig } from '../../config/env.ts';
import { SERVICES, type ServiceDefinition } from '../../config/services.ts';
import { formatMoney } from '../../domain/money.ts';
import type { EstimateResult } from '../../domain/pricing.ts';
import type { PublicTrackingView } from '../../services/tracking.ts';
import type { FieldErrors } from '../../validation/schemas.ts';
import { CONTACT_TOPICS } from '../../validation/schemas.ts';
import {
  badge, checkboxField, countrySelect, errorSummary, hidden, notice, picture, selectField, textArea, textField, type Values,
} from '../components.ts';
import { icons } from '../icons.ts';
import { calculatorDefaults, calculatorForm, estimateResultView, pricingModeNotice, priceFactors } from './calculator.ts';
import { FAQ_ITEMS, PROCESS_STAGES, LEGAL_DRAFT_NOTICE, TERMS_SECTIONS, PRIVACY_SECTIONS, COOKIE_SECTIONS } from './content.ts';
import { serviceCard } from './home.ts';
import { trackForm, trackingResultView } from './track.ts';

function pageHead(eyebrow: string, title: string, lead?: string, image?: { src: string; alt: string }): SafeHtml {
  return html`<section class="page-head ${image ? 'page-head-image' : ''}">
    ${image ? picture({ src: image.src, alt: '', width: 1280, height: 720, className: 'page-head-bg', eager: true }) : ''}
    <div class="container">
      <p class="eyebrow ${image ? 'eyebrow-gold' : ''}">${eyebrow}</p>
      <h1>${title}</h1>
      ${lead ? html`<p class="lead">${lead}</p>` : ''}
    </div>
  </section>`;
}

export function servicesIndexPage(): SafeHtml {
  return html`${pageHead('Services', 'Shipping services', 'Each service below explains what it is, who it suits, how it works and what we need from you. Every request is reviewed by our team before booking.')}
  <section class="section"><div class="container"><div class="service-grid">${SERVICES.map(serviceCard)}</div></div></section>`;
}

export function serviceDetailPage(s: ServiceDefinition): SafeHtml {
  const planned = s.availability === 'planned';
  return html`${pageHead(s.name, s.page.headline, s.shortDescription, { src: s.image.src, alt: s.image.alt })}
  <section class="section">
    <div class="container content-grid">
      <article class="prose">
        ${planned ? notice('warning', 'Not currently offered', 'Crownline Express is not accepting bookings for this service.') : ''}
        <h2>What it is</h2>
        <p>${s.page.whatItIs}</p>
        <h2>Who it suits</h2>
        <ul>${s.page.whoItSuits.map((w) => html`<li>${w}</li>`)}</ul>
        <h2>How it works</h2>
        <ol class="process-list">${s.page.process.map((p) => html`<li><strong>${p.title}.</strong> ${p.detail}</li>`)}</ol>
        ${s.page.informationNeeded.length
          ? html`<h2>Information we need</h2><ul>${s.page.informationNeeded.map((i) => html`<li>${i}</li>`)}</ul>`
          : ''}
        <h2>Good to know</h2>
        <ul>${s.page.goodToKnow.map((g) => html`<li>${g}</li>`)}</ul>
      </article>
      <aside class="aside">
        <figure class="media-frame">${picture({ src: s.image.src, alt: s.image.alt, width: 640, height: 400 })}</figure>
        <div class="card">
          <p>${planned ? badge('Not currently offered', 'warning') : badge('Quote on request', 'gold')}</p>
          ${planned
            ? html`<p>You can still request quotes for our transport services.</p><a class="btn btn-primary btn-block" href="/services">View available services</a>`
            : html`<h2 class="h4">Request a quote</h2><p class="small">A coordinator will confirm price, service and any documents needed before anything is booked.</p>
              <a class="btn btn-gold btn-block" href="/quote?service=${s.code}">Request a quote</a>
              ${s.pricingServiceCode ? html`<a class="btn btn-ghost btn-block" href="/calculator?service=${s.code}">Use the calculator</a>` : ''}`}
        </div>
      </aside>
    </div>
  </section>`;
}

export function calculatorPage(config: AppConfig, values: Values, errors: FieldErrors | undefined, result: EstimateResult | null): SafeHtml {
  return html`${pageHead('Shipping calculator', 'Estimate your shipment', 'Billable weight, pricing factors and, where pricing is configured, an itemised estimate.', { src: '/images/page-calculator.jpg', alt: '' })}
  <section class="section">
    <div class="container calc-page">
      <div>
        ${pricingModeNotice(config)}
        <div class="card">${calculatorForm(values, errors)}</div>
      </div>
      <div>
        ${result ? estimateResultView(result, calculatorDefaults(values)) : priceFactors()}
      </div>
    </div>
  </section>`;
}

export function trackPage(code: string, outcome: { error?: string | undefined; view?: PublicTrackingView | undefined }): SafeHtml {
  return html`${pageHead('Tracking', 'Track a shipment', 'Enter your Crownline tracking code to see confirmed milestones.', { src: '/images/page-tracking.jpg', alt: '' })}
  <section class="section">
    <div class="container">
      <div class="card track-card">${trackForm(code, { error: outcome.error })}</div>
      ${outcome.view ? trackingResultView(outcome.view) : html`<div class="help-grid">
        <div class="card"><h2 class="h4">${icons.info()} Where is my code?</h2><p class="small">It starts with CL and is in the booking confirmation from your coordinator.</p></div>
        <div class="card"><h2 class="h4">${icons.shield()} Private by design</h2><p class="small">Tracking shows the route at city level and confirmed events. It never shows full addresses, phone numbers or values.</p></div>
        <div class="card"><h2 class="h4">${icons.mail()} Need help?</h2><p class="small">If your code does not work, <a href="/contact?topic=tracking">contact us</a> with your shipment reference.</p></div>
      </div>`}
    </div>
  </section>`;
}

export function quotePage(config: AppConfig, values: Values, errors: FieldErrors | undefined, idempotencyKey: string): SafeHtml {
  const v = calculatorDefaults(values);
  const options = SERVICES.filter((s) => s.availability === 'quote_on_request').map((s) => ({ value: s.code, label: s.name }));
  const types = [
    { value: 'parcel', label: 'Parcel (boxes)' },
    { value: 'document', label: 'Documents (envelope)' },
    { value: 'pallet', label: 'Pallet' },
    { value: 'freight', label: 'Other freight' },
  ];
  return html`${pageHead('Request a quote', 'Tell us about your shipment', 'A coordinator reviews every request and replies by email with a confirmed price or any questions. Nothing is booked until you agree.')}
  <section class="section">
    <div class="container calc-page">
      <form class="card" method="post" action="/quote" novalidate>
        ${errorSummary(errors)}
        ${hidden('idempotencyKey', idempotencyKey)}
        <fieldset class="fieldset">
          <legend>Your details</legend>
          <div class="grid-2">
            ${textField({ name: 'contactName', label: 'Full name', values: v, errors, required: true, autocomplete: 'name', maxlength: 120 })}
            ${textField({ name: 'contactEmail', label: 'Email', values: v, errors, required: true, type: 'email', autocomplete: 'email', maxlength: 254 })}
            ${textField({ name: 'contactPhone', label: 'Phone', values: v, errors, type: 'tel', autocomplete: 'tel', maxlength: 40 })}
            ${textField({ name: 'company', label: 'Company', values: v, errors, autocomplete: 'organization', maxlength: 160 })}
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <legend>Shipment</legend>
          <div class="grid-2">
            ${selectField({ name: 'service', label: 'Service', values: v, errors, options, required: true })}
            ${selectField({ name: 'shipmentType', label: 'What are you sending?', values: v, errors, options: types, required: true })}
            ${countrySelect({ name: 'originCountry', label: 'From (country)', values: v, errors, required: true, autocomplete: 'section-origin country' })}
            ${countrySelect({ name: 'destinationCountry', label: 'To (country)', values: v, errors, required: true, autocomplete: 'section-destination country' })}
            ${textField({ name: 'originCity', label: 'From city', values: v, errors, autocomplete: 'section-origin address-level2', maxlength: 100 })}
            ${textField({ name: 'destinationCity', label: 'To city', values: v, errors, autocomplete: 'section-destination address-level2', maxlength: 100 })}
            ${textField({ name: 'originPostalCode', label: 'From postal code', values: v, errors, autocomplete: 'section-origin postal-code', maxlength: 20 })}
            ${textField({ name: 'destinationPostalCode', label: 'To postal code', values: v, errors, autocomplete: 'section-destination postal-code', maxlength: 20 })}
          </div>
          <div class="grid-4">
            ${textField({ name: 'quantity', label: 'Quantity', values: v, errors, type: 'number', inputmode: 'numeric', min: '1', step: '1', required: true })}
            ${textField({ name: 'weight', label: 'Weight each', values: v, errors, type: 'number', inputmode: 'decimal', step: 'any', required: true })}
            ${selectField({ name: 'weightUnit', label: 'Weight unit', values: v, errors, options: [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }], required: true })}
            ${selectField({ name: 'lengthUnit', label: 'Size unit', values: v, errors, options: [{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }], required: true })}
          </div>
          <div class="grid-3">
            ${textField({ name: 'length', label: 'Length', values: v, errors, type: 'number', inputmode: 'decimal', step: 'any', required: true })}
            ${textField({ name: 'width', label: 'Width', values: v, errors, type: 'number', inputmode: 'decimal', step: 'any', required: true })}
            ${textField({ name: 'height', label: 'Height', values: v, errors, type: 'number', inputmode: 'decimal', step: 'any', required: true })}
          </div>
          <div class="grid-2">
            ${textField({ name: 'declaredValue', label: 'Value of the goods', values: v, errors, type: 'number', inputmode: 'decimal', step: 'any' })}
            ${checkboxField({ name: 'insurance', label: 'I am interested in optional shipment cover', checked: v.insurance === 'on', errors })}
          </div>
          ${textArea({ name: 'notes', label: 'Anything else we should know?', values: v, errors, hint: 'For example the goods, delivery windows, or several different package sizes.', maxlength: 2000 })}
        </fieldset>
        ${checkboxField({ name: 'consent', label: 'Crownline may contact me by email about this request.', errors, required: true, checked: v.consent === 'on' })}
        <p class="small muted">We use these details only to respond to your request. See our <a href="/legal/privacy">privacy policy</a>.</p>
        <div class="form-actions"><button class="btn btn-gold" type="submit">Send quote request</button></div>
      </form>
      <aside>
        ${pricingModeNotice(config)}
        <div class="card"><h2 class="h4">What happens next</h2>
          <ol class="process-list small"><li>We review your details, usually within one business day.</li><li>We reply with a confirmed price, or questions if we need more information.</li><li>If you accept, we arrange the booking and send your tracking code.</li></ol>
        </div>
      </aside>
    </div>
  </section>`;
}

export function quoteSubmittedPage(reference: string, estimate: EstimateResult | null): SafeHtml {
  return html`${pageHead('Quote request received', 'Thank you. Your request is with our team.')}
  <section class="section"><div class="container narrow">
    <div class="card" tabindex="-1" data-autofocus>
      <p>Your request reference is</p>
      <p class="reference">${reference}</p>
      <p>Please quote this reference if you contact us. A coordinator will review your request and reply by email. Nothing has been booked and you have not been charged.</p>
      ${estimate && estimate.status === 'priced' && estimate.totalMinor !== null
        ? notice(estimate.isDemonstration ? 'demo' : 'info', estimate.isDemonstration ? 'Sample estimate recorded' : 'Estimate recorded',
            html`We saved the ${estimate.isDemonstration ? 'demonstration ' : ''}estimate of <strong>${formatMoney(estimate.totalMinor, estimate.currency)}</strong> with your request for reference. It is not a confirmed price.`)
        : ''}
      <div class="form-actions"><a class="btn btn-primary" href="/">Back to the homepage</a><a class="btn btn-ghost" href="/how-it-works">What happens next</a></div>
    </div>
  </div></section>`;
}

export function contactPage(config: AppConfig, values: Values, errors: FieldErrors | undefined, sent: boolean): SafeHtml {
  const c = config.company;
  const topicLabels: Record<(typeof CONTACT_TOPICS)[number], string> = {
    quote: 'A quote or booking', tracking: 'Tracking a shipment', business: 'Business shipping', claims: 'Damage, loss or a claim', other: 'Something else',
  };
  return html`${pageHead('Contact', 'Talk to a coordinator', 'Send us a message and we will reply by email.')}
  <section class="section"><div class="container calc-page">
    ${sent
      ? html`<div class="card" tabindex="-1" data-autofocus>${notice('success', 'Message sent', 'Thank you. A coordinator will reply by email. If your message is about a shipment, keep your reference to hand.')}<a class="btn btn-primary" href="/">Back to the homepage</a></div>`
      : html`<form class="card" method="post" action="/contact" novalidate>
          ${errorSummary(errors)}
          <div class="grid-2">
            ${textField({ name: 'name', label: 'Full name', values, errors, required: true, autocomplete: 'name', maxlength: 120 })}
            ${textField({ name: 'email', label: 'Email', values, errors, required: true, type: 'email', autocomplete: 'email', maxlength: 254 })}
          </div>
          ${selectField({ name: 'topic', label: 'Topic', values, errors, required: true, options: CONTACT_TOPICS.map((t) => ({ value: t, label: topicLabels[t] })) })}
          ${textArea({ name: 'message', label: 'Message', values, errors, required: true, rows: 6, maxlength: 4000, hint: 'Please do not include payment card details.' })}
          <div class="hp" aria-hidden="true"><label for="f-website">Leave this field empty</label><input id="f-website" name="website" tabindex="-1" autocomplete="off"></div>
          <p class="small muted">See our <a href="/legal/privacy">privacy policy</a> for how we handle your message.</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Send message</button></div>
        </form>`}
    <aside class="card">
      <h2 class="h4">Other ways to reach us</h2>
      ${c.email || c.phone || c.address
        ? html`<ul class="footer-contact dark">
            ${c.email ? html`<li>${icons.mail()} <a href="mailto:${c.email}">${c.email}</a></li>` : ''}
            ${c.phone ? html`<li>${icons.info()} <a href="tel:${c.phone.replace(/[^+\d]/g, '')}">${c.phone}</a></li>` : ''}
            ${c.address ? html`<li>${icons.pin()} ${c.address}</li>` : ''}
          </ul>`
        : html`<p class="small">The contact form is currently the best way to reach us.</p>`}
      <h2 class="h4">Tracking questions</h2>
      <p class="small">Include your shipment reference or the last four characters of your tracking code. Never send the full tracking code to anyone you do not trust.</p>
    </aside>
  </div></section>`;
}

export function howItWorksPage(): SafeHtml {
  return html`${pageHead('How it works', 'The shipping process, step by step', 'Every stage answers four questions: what is happening, what it means, whether you need to do anything, and what happens next.', { src: '/images/page-how-it-works.jpg', alt: '' })}
  <section class="section"><div class="container narrow">
    <ol class="stage-list">
      ${PROCESS_STAGES.map(
        (s, i) => html`<li class="stage card">
          <span class="stage-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <h2 class="h3">${s.title}</h2>
            <dl class="stage-dl">
              <div><dt>What is happening</dt><dd>${s.happening}</dd></div>
              <div><dt>What it means</dt><dd>${s.meaning}</dd></div>
              <div><dt>Do you need to do anything?</dt><dd>${s.action}</dd></div>
              <div><dt>What happens next</dt><dd>${s.next}</dd></div>
            </dl>
          </div>
        </li>`,
      )}
    </ol>
    <div class="contact-band card"><div><h2 class="h3">Ready to start?</h2><p>Estimate your shipment or send us the details for a confirmed quote.</p></div>
      <div class="contact-actions"><a class="btn btn-ghost" href="/calculator">Use the calculator</a><a class="btn btn-gold" href="/quote">Request a quote</a></div></div>
  </div></section>`;
}

export function aboutPage(): SafeHtml {
  return html`${pageHead('About Crownline', 'One partner for your shipping', 'Crownline Express coordinates shipping across available carriers and transport services, so customers have one point of contact and one clear view of every shipment.', { src: '/images/tracking-operations-control-room.jpg', alt: '' })}
  <section class="section"><div class="container content-grid">
    <article class="prose">
      <h2>What we do</h2>
      <p>We help individuals and businesses move parcels and freight by matching each shipment to a suitable carrier or transport partner, preparing the information it needs, and following it through to delivery. Every request is reviewed by a person before it is booked.</p>
      <h2>How we work</h2>
      <ul>
        <li><strong>Plain language.</strong> We explain shipping terms in context so you can make informed decisions.</li>
        <li><strong>Honest information.</strong> Estimates are labelled as estimates. Tracking shows only confirmed events. We do not claim a capability we do not have.</li>
        <li><strong>Privacy and security.</strong> Tracking codes are private credentials, staff access is role-based, and sensitive actions are recorded in an audit trail.</li>
      </ul>
      <h2>Where we are today</h2>
      <p>Crownline is a growing business. Our services are offered on a quote-on-request basis while we build direct carrier integrations, online payments and business accounts. We will update these pages as each capability becomes available, and our <a href="/services">services page</a> always shows what is available now.</p>
    </article>
    <aside class="aside"><figure class="media-frame">${picture({ src: '/images/service-customs-documentation-check.jpg', alt: 'A logistics employee checking a shipping document while scanning a parcel.', width: 1152, height: 864 })}</figure></aside>
  </div></section>`;
}

export function faqPage(): SafeHtml {
  return html`${pageHead('Help', 'Frequently asked questions')}
  <section class="section"><div class="container narrow"><div class="faq">
    ${FAQ_ITEMS.map((f) => html`<details><summary>${f.q}</summary><div class="faq-a">${f.a}</div></details>`)}
  </div><p>Still have a question? <a href="/contact">Contact us</a>.</p></div></section>`;
}

function legalPage(title: string, sections: { h: string; body: SafeHtml }[], updated: string): SafeHtml {
  return html`${pageHead('Legal', title)}
  <section class="section"><div class="container narrow prose">
    ${notice('info', 'Draft for review', LEGAL_DRAFT_NOTICE)}
    <p class="small muted">Last updated ${updated}</p>
    ${sections.map((s) => html`<h2>${s.h}</h2>${s.body}`)}
  </div></section>`;
}

export const termsPage = () => legalPage('Shipping terms', TERMS_SECTIONS, '27 October 2026');
export const privacyPage = () => legalPage('Privacy policy', PRIVACY_SECTIONS, '27 October 2026');
export const cookiesPage = () => legalPage('Cookie policy', COOKIE_SECTIONS, '27 October 2026');

export function claimsPage(): SafeHtml {
  return html`${pageHead('Claims and shipment issues', 'If something goes wrong', 'How to report damage, loss or delay, and what to expect.')}
  <section class="section"><div class="container narrow prose">
    ${notice('info', 'Draft for review', LEGAL_DRAFT_NOTICE)}
    <h2>Report it quickly</h2>
    <p>Carriers set strict time limits for claims. Visible damage should be reported on the day of delivery wherever possible. Hidden damage and loss should be reported as soon as you discover it.</p>
    <h2>What to send us</h2>
    <ul>
      <li>Your shipment reference or the last four characters of your tracking code</li>
      <li>A description of the problem</li>
      <li>Photos of the packaging, labels and damaged goods</li>
      <li>Proof of the value of the goods, such as an invoice</li>
    </ul>
    <h2>Keep the packaging</h2>
    <p>Do not throw away the packaging or the goods until the claim is resolved. The carrier may ask to inspect them.</p>
    <h2>What happens next</h2>
    <p>We confirm receipt, open an investigation with the carrier, and keep you informed. Compensation depends on the carrier’s liability terms and any optional cover purchased. We cannot promise an outcome before the carrier’s investigation is complete.</p>
    <p><a class="btn btn-primary" href="/contact?topic=claims">Report a problem</a></p>
  </div></section>`;
}

export function errorPage(status: number, title: string, message: string): SafeHtml {
  return html`<section class="section error-page"><div class="container narrow">
    <p class="eyebrow">Error ${status}</p>
    <h1>${title}</h1>
    <p class="lead-sm">${message}</p>
    <div class="form-actions"><a class="btn btn-primary" href="/">Go to the homepage</a><a class="btn btn-ghost" href="/track">Track a shipment</a><a class="btn btn-ghost" href="/contact">Contact us</a></div>
  </div></section>`;
}
