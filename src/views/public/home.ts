import { html, type SafeHtml } from '../../lib/html.ts';
import { translate, type Lang } from '../../i18n/index.ts';
import type { AppConfig } from '../../config/env.ts';
import { type ServiceDefinition } from '../../config/services.ts';
import { type Values } from '../components.ts';
import { icons } from '../icons.ts';
import { calculatorForm, priceFactors } from './calculator.ts';
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

const SERVICE_TAGS: Record<string, string[]> = {
  domestic_parcel: ['Same country', 'Boxes'],
  international_parcel: ['Cross-border', 'Customs papers'],
  air_freight: ['Time-critical', 'Named carrier'],
  ocean_freight: ['Shared', 'Dedicated'],
  road_freight: ['Domestic', 'Cross-border'],
  business_shipping: ['Recurring', 'One contact'],
  fulfillment: ['Storage', 'Packing', 'Dispatch'],
};

export function serviceCard(s: ServiceDefinition): SafeHtml {
  return homeService(
    `/services/${s.slug}`,
    (SERVICE_ICONS[s.code] ?? icons.parcel)(),
    s.name,
    s.shortDescription,
    SERVICE_TAGS[s.code] ?? ['Quote on request'],
    s.image,
  );
}

function homeService(
  href: string,
  icon: SafeHtml,
  title: string,
  text: string,
  tags: string[],
  photo: { src: string; alt: string },
): SafeHtml {
  return html`<a class="home-service" href="${href}">
    <img class="home-service-photo" src="${photo.src}" alt="${photo.alt}" width="900" height="1200">
    <span class="home-service-body">
      <span class="home-ico">${icon}</span>
      <h3>${title}</h3>
      <p>${text}</p>
      <div class="home-tags">${tags.map((t) => html`<span>${t}</span>`)}</div>
    </span>
  </a>`;
}

function film(src: string, kicker: string, title: string): SafeHtml {
  return html`<figure class="home-film">
    <video class="home-film-video" muted loop playsinline preload="none"><source src="${src}" type="video/mp4"></video>
    <figcaption><span>${kicker}</span> ${title}</figcaption>
  </figure>`;
}

function shot(src: string, alt: string, label: string, featured = false): SafeHtml {
  return html`<figure class="home-shot ${featured ? 'home-shot-lead' : ''}"><img src="${src}" alt="${alt}" width="1400" height="900"><figcaption>${label}</figcaption></figure>`;
}

export function homePage(config: AppConfig, calcValues: Values, lang: Lang = 'en'): SafeHtml {
  return html`<div class="home">
  <section class="home-hero" aria-labelledby="hero-title">
    <div class="home-hero-media" aria-hidden="true">
      <video class="home-hero-film" autoplay muted loop playsinline preload="auto">
        <source src="/video/port-operations.mp4" type="video/mp4">
      </video>
      <div class="home-hero-scrim"></div>
    </div>
    <div class="container home-hero-copy">
      <div class="home-hero-text">
        <h1 class="home-title" id="hero-title">Crownline Express</h1>
        <p class="home-discipline">${translate(lang, 'hero.discipline', 'Shipping coordination')}</p>
        <p class="lead">${translate(lang, 'hero.lead', 'You receive a written quote before booking and a private tracking code after it. Map, Satellite and Terrain show the last confirmed scan.')}</p>
        <div class="home-actions">
          <a class="btn btn-gold" href="#calculator">${icons.calculator()} ${translate(lang, 'hero.calculate', 'Calculate shipping')}</a>
          <a class="btn btn-ghost" href="#tracking">${icons.search()} ${translate(lang, 'hero.track', 'Track a shipment')}</a>
        </div>
        ${trackForm('', { compact: true, inverse: true })}
      </div>
    </div>
  </section>

  <div class="home-principles-wrap">
    <ul class="container home-principles">
      <li><strong>Written quote</strong><span>The price, the service and the conditions, before anything is booked.</span></li>
      <li><strong>Private code</strong><span>Issued after booking. Random, stored as a keyed hash, and revocable.</span></li>
      <li><strong>Three map views</strong><span>Map, Satellite and Terrain, placed on the last confirmed scan.</span></li>
      <li><strong>Delivery evidence</strong><span>The record is complete only when delivery is recorded with evidence.</span></li>
    </ul>
  </div>

  <section class="home-band home-band-sand" id="operations">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Operations</p>
        <h2>Air, ocean and road</h2>
        <p>The confirmation names the service and the carrier.</p>
      </header>
      <div class="home-films">
        ${film('/video/air-freight-operations.mp4', 'Air', 'Freight operations')}
        ${film('/video/ocean-freight-operations.mp4', 'Ocean', 'Cargo fleet')}
        ${film('/video/road-freight-operations.mp4', 'Road', 'Express ground delivery')}
      </div>
    </div>
  </section>

  <section class="home-band" id="overview">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Overview</p>
        <h2>A coordinator reads every request</h2>
        <p>The carrier is named on the confirmation. Milestones appear when they are confirmed.</p>
      </header>
      <div class="home-mosaic">
        ${shot('/images/ops/parcel-floor.jpg', 'Cardboard parcels on a roller conveyor', 'Parcel handling', true)}
        ${shot('/images/ops/handlers.jpg', 'A person handling cartons in a warehouse aisle', 'Handlers')}
        ${shot('/images/ops/loading.jpg', 'Containers at a port', 'Loading')}
        ${shot('/images/ops/distribution.jpg', 'Pallets in a distribution aisle', 'Distribution')}
        ${shot('/images/ops/handling.jpg', 'Hands closing a carton', 'Packing')}
      </div>
      <div class="home-split">
        <div>
          <h3>One reference. One tracking page.</h3>
          <p>You get a written record of the service, the price and the conditions. Nothing is booked on a calculator figure alone.</p>
          <div class="home-rules">
            <article><span class="home-ico">${icons.document()}</span><div><h3>Quote in writing</h3><p>The price, what it includes, and what it leaves out are sent before you accept.</p></div></article>
            <article><span class="home-ico">${icons.shield()}</span><div><h3>Cover when it is written</h3><p>Shipment cover applies only when it is on the confirmed quote.</p></div></article>
            <article><span class="home-ico">${icons.clock()}</span><div><h3>A page you can return to</h3><p>Confirmed milestones stay on the tracking page. Your coordinator replies by email.</p></div></article>
            <article><span class="home-ico">${icons.check()}</span><div><h3>Delivery with evidence</h3><p>Delivered status needs a proof-of-delivery reference.</p></div></article>
          </div>
        </div>
        <aside class="home-note">
          <img src="/images/home/tracking.jpg" alt="" width="900" height="1200">
          <div class="home-note-body">
            <p class="eyebrow eyebrow-gold">From code to confirmation</p>
            <ol>
              <li><strong>CL</strong><span>Code prefix on every tracking reference</span></li>
              <li><strong>3</strong><span>Map views: Map, Satellite, Terrain</span></li>
              <li><strong>1</strong><span>Coordinator on the booking</span></li>
              <li><strong>Written</strong><span>Confirmation before a carrier is booked</span></li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  </section>

  <section class="home-band home-band-white" id="services">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Services</p>
        <h2>${translate(lang, 'svc.heading', 'Each request is reviewed first')}</h2>
        <p>${translate(lang, 'svc.lead', 'Ocean, air, road, fulfilment, documents and tracking. A coordinator confirms each one in writing.')}</p>
      </header>
      <div class="home-services">
        ${homeService('/services/ocean-freight', icons.ship(), translate(lang, 'svc.ocean.title', 'Ocean freight'), translate(lang, 'svc.ocean.text', 'Shared or dedicated container space for cargo that can travel by sea.'), ['Shared', 'Dedicated', 'Quoted first'], { src: '/images/home/ocean-freight.jpg', alt: 'A container ship at sea' })}
        ${homeService('/services/air-freight', icons.plane(), translate(lang, 'svc.air.title', 'Air freight'), translate(lang, 'svc.air.text', 'Heavier or urgent cargo moved by air, quoted before it is booked.'), ['Time-critical', 'Named carrier'], { src: '/images/home/air-freight.jpg', alt: 'A white jet in flight with Crownline Express on the fuselage' })}
        ${homeService('/services/road-freight', icons.truck(), translate(lang, 'svc.road.title', 'Road freight'), translate(lang, 'svc.road.text', 'Pallets and part-loads by truck, within a country or across a land border.'), ['Domestic', 'Cross-border'], { src: '/images/home/road-freight.jpg', alt: 'A truck on an open highway' })}
        ${homeService('/services/fulfillment', icons.warehouse(), translate(lang, 'svc.fulfil.title', 'Shipment coordination & fulfilment'), translate(lang, 'svc.fulfil.text', 'A coordinator arranges storage, packing and dispatch. The confirmation names the facility.'), ['Storage', 'Packing', 'Dispatch'], { src: '/images/home/warehousing.jpg', alt: 'A carton aisle in a warehouse' })}
        ${homeService('/services/international-parcel-shipping', icons.document(), translate(lang, 'svc.customs.title', 'Customs documents'), translate(lang, 'svc.customs.text', 'We help you prepare the papers the carrier asks for. Clearance is carried out by the carrier or a broker named on the confirmation.'), ['Invoice', 'Named broker'], { src: '/images/home/customs-documents.jpg', alt: 'Papers and a pen on a desk' })}
        ${homeService('/track', icons.route(), translate(lang, 'svc.track.title', 'Tracking'), translate(lang, 'svc.track.text', 'Map, Satellite and Terrain show the origin, the destination and the last confirmed scan.'), ['Map', 'Satellite', 'Terrain'], { src: '/images/home/tracking.jpg', alt: 'A world map on an office screen' })}
      </div>
    </div>
  </section>

  <section class="home-band home-band-sand" id="coverage">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Movement</p>
        <h2>Where freight is handled</h2>
        <p>Collection, linehaul, storage and delivery are arranged after you accept the written quote. The confirmation names the carrier and, for fulfilment, the facility.</p>
      </header>
      <div class="home-lede">
        <figure><img src="/images/ops/parcel-floor.jpg" alt="A parcel conveyor in a distribution building" width="1400" height="800"></figure>
        <div class="home-lede-copy">
          <h3>Fulfilment is coordinated, then confirmed</h3>
          <p>Storage, packing and dispatch are booked only after a coordinator confirms the facility and the price in writing.</p>
        </div>
      </div>
      <div class="home-coverage">
        <article class="home-photo"><img src="/images/ops/handlers.jpg" alt="A handler with cartons" width="1400" height="900"><div><h3>Collection</h3><p>Arranged with the carrier after you accept the written quote.</p></div></article>
        <article class="home-photo"><img src="/images/ops/loading.jpg" alt="Containers being loaded" width="1400" height="900"><div><h3>Linehaul</h3><p>Air, ocean or road, as written on the confirmation.</p></div></article>
        <article class="home-photo"><img src="/images/ops/distribution.jpg" alt="Pallets ready for dispatch" width="1400" height="900"><div><h3>Delivery</h3><p>Recorded when evidence is on the tracking page.</p></div></article>
      </div>
    </div>
  </section>

  <section class="home-band" id="calculator">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Calculator</p>
        <h2>Shipping calculator</h2>
        <p>Billable weight, and an itemised estimate where a rate card is loaded. A coordinator confirms the price in writing.</p>
      </header>
      <div class="home-tools">
        <div>
          ${priceFactors()}
        </div>
        <div class="home-panel calc-instrument">${calculatorForm(calcValues, undefined, { compact: true, lang })}</div>
      </div>
    </div>
  </section>

  <section class="home-band home-band-white" id="tracking">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Tracking</p>
        <h2>Follow a shipment</h2>
        <p>Map, Satellite and Terrain show the last confirmed place. There is no live vehicle feed.</p>
      </header>
      <div class="home-panel home-track">
        ${trackForm('')}
        <ul class="home-views" aria-label="Map views"><li>Map</li><li>Satellite</li><li>Terrain</li></ul>
      </div>
    </div>
  </section>

  <section class="home-band home-band-sand" id="record">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Record</p>
        <h2>The record a customer sees</h2>
        <p>Status, progress, and the three milestones. There are no live counters.</p>
      </header>
      <div class="home-track">${trackingPreview()}</div>
    </div>
  </section>

  <section class="home-band" id="why">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Reliance</p>
        <h2>Why the record can be trusted</h2>
        <p>The price you accept is the one a coordinator sends in writing. The tracking code is private. Delivery is recorded with evidence.</p>
      </header>
      <div class="home-services">
        <article class="home-card"><span class="home-ico">${icons.document()}</span><h3>Written price</h3><p>Nothing is booked on the calculator figure alone.</p></article>
        <article class="home-card"><span class="home-ico">${icons.shield()}</span><h3>Private code</h3><p>The code is random, stored as a keyed hash, and can be revoked.</p></article>
        <article class="home-card"><span class="home-ico">${icons.check()}</span><h3>Delivery with evidence</h3><p>A proof of delivery is required before the shipment is marked delivered.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band home-band-white" id="standards">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Standards</p>
        <h2>How the platform is run</h2>
        <p>Operating rules for quotes, tracking and staff access.</p>
      </header>
      <div class="home-quad">
        <article class="home-card"><span class="home-ico">${icons.document()}</span><h3>Written confirmation</h3><p>Service, price and conditions before booking.</p></article>
        <article class="home-card"><span class="home-ico">${icons.shield()}</span><h3>Private tracking codes</h3><p>Hashed. No address or goods value on the public page.</p></article>
        <article class="home-card"><span class="home-ico">${icons.check()}</span><h3>Staff audit log</h3><p>Operational actions are appended.</p></article>
        <article class="home-card"><span class="home-ico">${icons.clock()}</span><h3>Delivery evidence</h3><p>Delivered status needs a proof-of-delivery reference.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band home-band-sand" id="checks">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Records</p>
        <h2>What you can check</h2>
        <p>Four records on your shipment. Not a list of client quotes.</p>
      </header>
      <div class="home-quad">
        <article class="home-card"><h3>The written quote</h3><p>Service, price and conditions, sent before you book.</p></article>
        <article class="home-card"><h3>The carrier name</h3><p>The company moving that shipment, on the confirmation.</p></article>
        <article class="home-card"><h3>The tracking timeline</h3><p>Confirmed milestones, with the time and place of the last scan.</p></article>
        <article class="home-card"><h3>The claims path</h3><p>How to report damage, delay or loss, and what evidence to keep.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band" id="carriers">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Carriage</p>
        <h2>Who moves the freight</h2>
        <p>The carrier is identified in writing when the booking is confirmed.</p>
      </header>
      <div class="home-quad">
        <article class="home-card"><span class="home-ico">${icons.parcel()}</span><h3>Collection</h3><p>The pickup party named for that booking.</p></article>
        <article class="home-card"><span class="home-ico">${icons.ship()}</span><h3>Linehaul</h3><p>The air, ocean or road carrier for the main leg.</p></article>
        <article class="home-card"><span class="home-ico">${icons.document()}</span><h3>Documents</h3><p>The papers the carrier needs, prepared with you.</p></article>
        <article class="home-card"><span class="home-ico">${icons.truck()}</span><h3>Delivery</h3><p>The final handoff, recorded when evidence is on file.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band home-band-white" id="reach">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Routes</p>
        <h2>Quoted to a real country pair</h2>
        <p>Each route is priced for the countries you enter.</p>
      </header>
      <div class="home-quad">
        <article class="home-card"><span class="home-ico">${icons.parcel()}</span><h3>Parcel</h3><p>Boxes and documents, domestic or international.</p></article>
        <article class="home-card"><span class="home-ico">${icons.plane()}</span><h3>Air</h3><p>When the transit time is short.</p></article>
        <article class="home-card"><span class="home-ico">${icons.ship()}</span><h3>Ocean</h3><p>Heavier consignments that can travel by sea.</p></article>
        <article class="home-card"><span class="home-ico">${icons.truck()}</span><h3>Road</h3><p>Pallets by truck, including across a land border.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band home-band-sand" id="how">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Process</p>
        <h2>How it works</h2>
        <p>From the quote to delivery with evidence.</p>
      </header>
      <div class="home-steps">
        <article class="home-step"><span class="home-step-num">01</span><h3>Request a quote</h3><p>Use the calculator or send a quote request. The price is confirmed in writing before anything is booked.</p></article>
        <article class="home-step"><span class="home-step-num">02</span><h3>Confirm and collect</h3><p>A coordinator confirms the service, the carrier and the conditions. Collection follows your acceptance.</p></article>
        <article class="home-step"><span class="home-step-num">03</span><h3>Follow confirmed updates</h3><p>You receive a private tracking code. Map, Satellite and Terrain show the last confirmed place.</p></article>
        <article class="home-step"><span class="home-step-num">04</span><h3>Delivery with evidence</h3><p>The shipment is marked delivered only when delivery is recorded with evidence.</p></article>
      </div>
    </div>
  </section>

  <section class="home-band" id="faq">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Questions</p>
        <h2>Frequently asked questions</h2>
        <p>Tracking, transit, documents and cover.</p>
      </header>
      <div class="faq">
        ${FAQ_ITEMS.slice(0, 6).map((f) => html`<details><summary>${f.q}</summary><div class="faq-a">${f.a}</div></details>`)}
      </div>
      <p class="center"><a href="/faq">All questions</a></p>
    </div>
  </section>

  <section class="home-band home-band-white" id="contact">
    <div class="container">
      <header class="home-head">
        <p class="eyebrow">Contact</p>
        <h2>Talk to a coordinator</h2>
        <p>Send a message. A coordinator replies by email. There is no published phone number or office address.</p>
      </header>
      <div class="home-quad">
        <a class="home-card" href="/contact"><span class="home-ico">${icons.mail()}</span><h3>Send a message</h3><p>The contact form is the way to reach a coordinator.</p></a>
        <a class="home-card" href="/quote"><span class="home-ico">${icons.document()}</span><h3>Request a quote</h3><p>Describe the shipment. The price comes back in writing.</p></a>
        <a class="home-card" href="/track"><span class="home-ico">${icons.search()}</span><h3>Track a shipment</h3><p>Use the private code from your booking confirmation.</p></a>
        <a class="home-card" href="/claims"><span class="home-ico">${icons.alert()}</span><h3>Claims</h3><p>Report damage, delay or loss and keep the evidence.</p></a>
      </div>
    </div>
  </section>
  </div>`;
}
