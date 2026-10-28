import { html, type SafeHtml } from '../../lib/html.ts';
import { formatDate, formatDateTime } from '../../lib/time.ts';
import type { PublicTrackingView } from '../../services/tracking.ts';
import { notice, progressBar } from '../components.ts';
import { icons } from '../icons.ts';

export function trackForm(code: string, opts: { error?: string | undefined; compact?: boolean; inverse?: boolean } = {}): SafeHtml {
  return html`<form class="track-form ${opts.inverse ? 'track-inverse' : ''}" method="get" action="/track" role="search" aria-label="Track a shipment">
    <label for="track-code-${opts.compact ? 'c' : 'f'}" class="${opts.compact ? 'visually-hidden' : 'track-label'}">Tracking code</label>
    ${opts.error ? html`<p class="field-error" id="track-error" role="alert">${opts.error}</p>` : ''}
    <div class="track-row">
      <input id="track-code-${opts.compact ? 'c' : 'f'}" name="code" type="text" value="${code}" placeholder="CL-XXXX-XXXX-XXXX"
        autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" required
        ${opts.error ? html`aria-invalid="true" aria-describedby="track-error"` : html`aria-describedby="track-help-${opts.compact ? 'c' : 'f'}"`}>
      <button class="btn btn-gold" type="submit">${icons.search()} Track</button>
    </div>
    <p class="small track-help" id="track-help-${opts.compact ? 'c' : 'f'}">Your code starts with CL and is in your booking confirmation. Letters are not case-sensitive.</p>
  </form>`;
}

function step(s: PublicTrackingView['steps'][number]): SafeHtml {
  const stateLabel = s.state === 'recorded' ? 'Confirmed' : s.state === 'passed_unconfirmed' ? 'Not separately confirmed' : 'Not yet';
  return html`<li class="step step-${s.state} ${s.isCurrent ? 'step-current' : ''}" ${s.isCurrent ? html`aria-current="step"` : ''}>
    <span class="step-dot" aria-hidden="true">${s.state === 'recorded' ? icons.check() : ''}</span>
    <span class="step-body">
      <span class="step-label">${s.label}</span>
      <span class="step-state">${stateLabel}${s.reachedAt ? html` · ${formatDate(s.reachedAt)}` : ''}</span>
    </span>
  </li>`;
}

function mapPanel(v: PublicTrackingView): SafeHtml {
  const places = [v.places.origin, v.places.destination, v.places.current].filter((p) => p !== null);
  if (places.length === 0) return html``;
  const countryLevel = places.some((p) => p.precision === 'country');
  const payload = JSON.stringify({ origin: v.places.origin, destination: v.places.destination, current: v.places.current });
  return html`<div class="map-shell">
    <div class="map-toolbar" role="group" aria-label="Map style">
      <button type="button" data-map-style="streets" aria-pressed="true">Map</button>
      <button type="button" data-map-style="satellite" aria-pressed="false">Satellite</button>
      <button type="button" data-map-style="terrain" aria-pressed="false">Terrain</button>
      <button type="button" class="map-zoom" data-map-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="map-zoom" data-map-zoom="out" aria-label="Zoom out">−</button>
    </div>
    <canvas class="shipment-map" data-map="${payload}" role="img" aria-label="Map of the booked route and last confirmed location"></canvas>
    ${countryLevel ? html`<p class="small map-note">A point shown at country level means that update named a country, or a city this map does not place precisely.</p>` : ''}
    <p class="small map-note">Imagery © Esri, Maxar, Earthstar Geographics and the GIS user community.</p>
    <script src="/js/map.js" defer></script>
  </div>`;
}

export function trackingResultView(v: PublicTrackingView): SafeHtml {
  const latest = v.latestEvent;
  const located = v.timeline.find((e) => e.location);
  return html`<section class="track-result" aria-labelledby="track-status" tabindex="-1" data-autofocus>
    <div class="track-summary card">
      <div class="track-summary-head">
        <div>
          <p class="eyebrow">${v.serviceName} · code ending ${v.codeHint}</p>
          <h2 id="track-status" class="track-status">${v.status.label}</h2>
          <p>${v.status.explanation}</p>
          ${v.status.customerAction ? html`<p class="callout">${icons.info()} <span><strong>What you can do:</strong> ${v.status.customerAction}</span></p>` : ''}
        </div>
        <div class="route-chip" aria-label="Route">
          <span>${icons.pin()} ${v.origin}</span>
          <span class="route-arrow" aria-hidden="true">${icons.arrowRight()}</span>
          <span>${icons.pin()} ${v.destination}</span>
        </div>
      </div>

      ${progressBar(v.progressPercent, 'Milestone progress')}
      <p class="small muted">The percentage reflects confirmed shipment milestones, not the distance travelled. It only reaches 100% when delivery is confirmed.</p>

      <div class="track-facts">
        <div>
          <span class="fact-label">Latest confirmed update</span>
          ${latest
            ? html`<span class="fact-value">${latest.label}${latest.location ? html` · ${latest.location}` : ''}</span>
                <span class="small muted">${formatDateTime(latest.occurredAt, latest.timeZone)}</span>`
            : html`<span class="fact-value">No updates yet</span>`}
        </div>
        <div>
          <span class="fact-label">${v.deliveredAt ? 'Delivered' : 'Expected delivery'}</span>
          ${v.deliveredAt
            ? html`<span class="fact-value">${formatDateTime(v.deliveredAt)}</span>`
            : v.estimatedDelivery
              ? html`<span class="fact-value">${formatDate(v.estimatedDelivery.date)}</span>
                  <span class="small muted">${v.estimatedDelivery.source === 'carrier' ? 'Estimate provided by the carrier' : 'Estimate from the Crownline team'} — not guaranteed</span>`
              : html`<span class="fact-value">Not yet available</span><span class="small muted">We only show a date when a carrier or our team provides one.</span>`}
        </div>
      </div>
    </div>

    <div aria-live="polite">
      ${v.openExceptions.map((x) => notice('warning', x.label, html`<p>${x.message}</p><p class="small muted">Reported ${formatDateTime(x.since)}</p>`))}
      ${v.dataNotes.map((n) => notice('info', 'About this information', n))}
    </div>

    <div class="track-columns">
      <section class="card" aria-labelledby="milestones-title">
        <h3 id="milestones-title">Milestones</h3>
        <ol class="steps">${v.steps.map(step)}</ol>
      </section>

      <section class="card" aria-labelledby="timeline-title">
        <h3 id="timeline-title">Shipment history</h3>
        ${v.timeline.length === 0
          ? html`<p class="muted">No confirmed events have been recorded yet.</p>`
          : html`<ol class="timeline">
              ${v.timeline.map(
                (e) => html`<li class="tl tl-${e.kind}">
                  <span class="tl-time"><time datetime="${e.occurredAt.toISOString()}">${formatDateTime(e.occurredAt, e.timeZone)}</time></span>
                  <span class="tl-label">${e.label}</span>
                  ${e.location ? html`<span class="tl-loc">${icons.pin()} ${e.location}</span>` : ''}
                  ${e.note ? html`<span class="tl-note">${e.note}</span>` : ''}
                  <span class="tl-source">Source: ${e.sourceLabel}</span>
                </li>`,
              )}
            </ol>`}
      </section>
    </div>

    <div class="track-columns">
      <section class="card map-card" aria-labelledby="location-title">
        <h3 id="location-title">Location</h3>
        ${mapPanel(v)}
        <p>${located
          ? html`Last confirmed location: <strong>${located.location}</strong> (${located.label}, ${formatDateTime(located.occurredAt, located.timeZone)}).`
          : 'No scan location has been confirmed yet. The map shows the booked origin and destination.'}</p>
        <p class="small muted">Map, satellite and terrain show the booked route and the last confirmed place. This is not a live vehicle position.</p>
      </section>
      <section class="card" aria-labelledby="docs-title">
        <h3 id="docs-title">Documents and notifications</h3>
        <p class="small">To protect your privacy, shipment documents are not available on this public page. Your Crownline coordinator can send them to the sender or recipient on request.</p>
        <p class="small">Return to this page for the latest confirmed status. Your coordinator sends any email updates.</p>
        <p class="small"><a href="/contact?topic=tracking">Report a problem with this shipment</a></p>
      </section>
    </div>
  </section>`;
}

/** Static, clearly labelled example for the homepage. No database data is used. */
export function trackingPreview(): SafeHtml {
  return html`<figure class="preview card" aria-labelledby="preview-caption">
    <div class="preview-flag">Example only · fictional shipment</div>
    <p class="eyebrow">International parcel · code ending 4TR8</p>
    <p class="track-status">In international transit</p>
    ${progressBar(60, 'Milestone progress')}
    <ol class="timeline timeline-compact">
      <li class="tl tl-milestone"><span class="tl-time">14 Oct, 09:12 CEST</span><span class="tl-label">In international transit</span><span class="tl-loc">${icons.pin()} Amsterdam, Netherlands</span></li>
      <li class="tl tl-milestone"><span class="tl-time">13 Oct, 18:40 CEST</span><span class="tl-label">Departed origin</span></li>
      <li class="tl tl-milestone"><span class="tl-time">12 Oct, 11:05 CEST</span><span class="tl-label">Collected</span></li>
    </ol>
    <figcaption id="preview-caption" class="small muted">Illustration of the tracking page using invented data. Real tracking pages show only events confirmed for your shipment.</figcaption>
  </figure>`;
}
