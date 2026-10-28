import { html, type SafeHtml } from '../../lib/html.ts';
import type { AppConfig } from '../../config/env.ts';
import { SERVICES, type ServiceDefinition } from '../../config/services.ts';
import { badge, picture, type Values } from '../components.ts';
import { icons } from '../icons.ts';
import { calculatorForm, pricingModeNotice, priceFactors } from './calculator.ts';
import { trackForm, trackingPreview } from './track.ts';
import { FAQ_ITEMS } from './content.ts';

const SERVICE_ICONS: Record<string, () => SafeHtml> = {
  domestic_parcel: icons.parcel,
  international_parcel: icons.globe,
  air_freight: icons.plane,
  ocean_freight: icons.ship,
  road_freight: icons.truck,
  business_shipping: icons.building,
  fulfillment: icons.warehouse,
};

export function serviceCard(s: ServiceDefinition): SafeHtml {
  return html`<article class="service-card">
    <a class="service-media" href="/services/${s.slug}" tabindex="-1" aria-hidden="true">
      ${picture({ src: s.image.src, alt: '', width: 640, height: 400 })}
    </a>
    <div class="service-body">
      <div class="service-top">
        <span class="service-icon">${(SERVICE_ICONS[s.code] ?? icons.parcel)()}</span>
        ${s.availability === 'planned' ? badge('Not currently offered', 'warning') : badge('Quote on request', 'gold')}
      </div>
      <h3><a href="/services/${s.slug}">${s.name}</a></h3>
      <p>${s.shortDescription}</p>
    </div>
  </article>`;
}

export function homePage(config: AppConfig, calcValues: Values): SafeHtml {
  return html`
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-media">
      <picture class="hero-still">
        <source srcset="/images/hero-container-port-blue-hour.webp" type="image/webp">
        <img src="/images/hero-container-port-blue-hour.jpg" alt="" width="1280" height="720" fetchpriority="high" decoding="async">
      </picture>
      <video autoplay muted loop playsinline poster="/images/hero-container-port-blue-hour.jpg">
        <source src="/video/port-operations.mp4" type="video/mp4">
      </video>
    </div>
    <div class="container hero-inner">
      <div class="hero-copy">
        <p class="eyebrow eyebrow-gold">One Partner. A World of Possibilities.</p>
        <h1 id="hero-title">Your Shipments.<br>One Clear View.</h1>
        <p class="lead">Coordinate shipping, compare available options, and follow your shipment from dispatch to delivery with greater clarity.</p>
        <div class="hero-actions">
          <a class="btn btn-gold" href="#calculate">${icons.calculator()} Calculate Shipping</a>
          <a class="btn btn-outline-light" href="#track">${icons.search()} Track a Shipment</a>
          <a class="btn btn-link-light" href="/quote?service=business_shipping">Request a Business Quote ${icons.arrowRight()}</a>
        </div>
      </div>
      <div class="hero-track" id="track">
        <h2 class="hero-track-title">Track a shipment</h2>
        ${trackForm('', { compact: true, inverse: true })}
      </div>
    </div>
  </section>

  <section class="mode-bar" aria-label="How freight moves">
    <div class="container">
      <ul>
        <li><strong>Parcel</strong><span>Door to door, at home and abroad</span></li>
        <li><strong>Air</strong><span>Freight when the clock is short</span></li>
        <li><strong>Ocean</strong><span>Heavier cargo, shared or dedicated</span></li>
        <li><strong>Road</strong><span>Regional and cross-border freight</span></li>
      </ul>
    </div>
  </section>

  <section class="section section-calc" id="calculate" aria-labelledby="calc-title">
    <div class="container calc-layout">
      <div class="calc-intro">
        <p class="eyebrow">Shipping calculator</p>
        <h2 id="calc-title">See how your shipment will be priced</h2>
        <p>Enter the route and the size and weight of your packages. You will see the billable weight, the factors that affect the price and, where pricing is configured, an itemised estimate.</p>
        ${pricingModeNotice(config)}
        ${priceFactors()}
      </div>
      <div class="card card-raised">
        ${calculatorForm(calcValues, undefined, { compact: true })}
      </div>
    </div>
  </section>

  <section class="section section-sand" aria-labelledby="services-title">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Services</p>
        <h2 id="services-title">Shipping options, explained plainly</h2>
        <p class="lead-sm">Crownline Express coordinates each request with a suitable carrier or transport partner. Every request is reviewed by our team before anything is booked.</p>
      </div>
      <div class="service-grid">${SERVICES.map(serviceCard)}</div>
    </div>
  </section>

  <section class="section" aria-labelledby="how-title">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">How it works</p>
        <h2 id="how-title">Three steps from question to delivery</h2>
      </div>
      <ol class="steps-3">
        <li>
          <span class="step-num">1</span>
          <h3>Estimate or request a quote</h3>
          <p>Use the calculator to understand billable weight and pricing factors, then send your details for a confirmed quote.</p>
        </li>
        <li>
          <span class="step-num">2</span>
          <h3>Confirm and book</h3>
          <p>A coordinator confirms the service, price and conditions. Nothing is booked until you agree.</p>
        </li>
        <li>
          <span class="step-num">3</span>
          <h3>Follow every milestone</h3>
          <p>You receive a private tracking code. The tracking page shows each confirmed milestone and explains what it means.</p>
        </li>
      </ol>
      <p class="center"><a class="link-arrow" href="/how-it-works">The full shipping process, step by step ${icons.arrowRight()}</a></p>
    </div>
  </section>

  <section class="section section-navy" aria-labelledby="visibility-title">
    <div class="container split">
      <div>
        <p class="eyebrow eyebrow-gold">Shipment visibility</p>
        <h2 id="visibility-title">Clear updates, honestly labelled</h2>
        <ul class="feature-list">
          <li>${icons.check()} <span><strong>Confirmed milestones only.</strong> We never show a shipment as collected, cleared or delivered unless that event has been confirmed.</span></li>
          <li>${icons.check()} <span><strong>Progress that means something.</strong> The percentage follows real milestones, not a guess about distance.</span></li>
          <li>${icons.check()} <span><strong>Issues explained.</strong> Delays, customs holds and address problems are shown separately, with what happens next.</span></li>
          <li>${icons.check()} <span><strong>Private by design.</strong> Tracking pages never show full addresses, phone numbers or the value of the goods.</span></li>
          <li>${icons.bell()} <span><strong>A page you can return to.</strong> Confirmed milestones stay on the tracking page. Your coordinator sends any email updates.</span></li>
        </ul>
      </div>
      ${trackingPreview()}
    </div>
  </section>

  <section class="section" aria-labelledby="business-title">
    <div class="container split split-media">
      <figure class="media-frame">
        ${picture({ src: '/images/service-business-shipping-packing.jpg', alt: 'A small-business owner carefully packing a ceramic cup into a shipping box.', width: 1152, height: 864 })}
      </figure>
      <div>
        <p class="eyebrow">Business shipping</p>
        <h2 id="business-title">One coordinator for your recurring shipments</h2>
        <p>If you ship regularly, Crownline Express can act as your single point of contact across parcel, freight and international services, with one reference system and one tracking page format for every shipment.</p>
        <ul class="list-check">
          <li>${icons.check()} A coordinator who reviews your shipping profile</li>
          <li>${icons.check()} Written pricing and service terms before you ship</li>
          <li>${icons.check()} Consistent tracking codes and shipment summaries</li>
        </ul>
        <p class="small muted">Business accounts, bulk upload and an API are not part of this service yet.</p>
        <a class="btn btn-primary" href="/quote?service=business_shipping">Request a business quote</a>
      </div>
    </div>
  </section>

  <section class="section section-sand" aria-labelledby="faq-title">
    <div class="container narrow">
      <div class="section-head">
        <p class="eyebrow">Questions</p>
        <h2 id="faq-title">Frequently asked questions</h2>
      </div>
      <div class="faq">
        ${FAQ_ITEMS.slice(0, 5).map((f) => html`<details><summary>${f.q}</summary><div class="faq-a">${f.a}</div></details>`)}
      </div>
      <p class="center"><a class="link-arrow" href="/faq">All questions ${icons.arrowRight()}</a></p>
    </div>
  </section>

  <section class="section" aria-labelledby="contact-title">
    <div class="container contact-band">
      <div>
        <h2 id="contact-title">Talk to a coordinator</h2>
        <p>Tell us what you need to move. We will reply by email with options, or with the questions we need answered to quote accurately.</p>
      </div>
      <div class="contact-actions">
        <a class="btn btn-primary" href="/contact">${icons.mail()} Send a message</a>
        <a class="btn btn-ghost" href="/quote">Request a quote</a>
      </div>
    </div>
  </section>`;
}
