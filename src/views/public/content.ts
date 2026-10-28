import { html, type SafeHtml } from '../../lib/html.ts';

export const FAQ_ITEMS: { q: string; a: SafeHtml }[] = [
  {
    q: 'Is the price from the calculator final?',
    a: html`<p>No. The calculator shows how your shipment is measured and, where pricing is configured, an indicative estimate. When the site is in demonstration mode the figures are samples only. A confirmed price is always sent to you by a coordinator before anything is booked.</p>`,
  },
  {
    q: 'What is dimensional (volumetric) weight?',
    a: html`<p>Carriers charge for space as well as weight. Dimensional weight converts a package’s size into a weight using a divisor, for example length × width × height in centimetres ÷ 5,000. You are charged for whichever is greater: the actual weight or the dimensional weight. This is called the billable weight.</p>`,
  },
  {
    q: 'Where do I find my tracking code?',
    a: html`<p>Your tracking code starts with <strong>CL</strong> and is sent by your coordinator when your shipment is booked. Enter it on the <a href="/track">tracking page</a>. Codes are private: share them only with people who need to follow the shipment.</p>`,
  },
  {
    q: 'Why has my tracking not changed for a while?',
    a: html`<p>Tracking updates appear when a carrier or our team confirms a milestone. Long legs such as sea crossings or customs processing can go several days without a new scan. If there is a known problem, the tracking page shows it as an issue with an explanation. If you are concerned, <a href="/contact?topic=tracking">contact us</a>.</p>`,
  },
  {
    q: 'Do you show the live location of my shipment?',
    a: html`<p>Only when a real vehicle or device tracking feed is connected, and none is connected today. Normally we show the last confirmed scan location and its time. We never animate a parcel on a map or call a position “live” without real location data.</p>`,
  },
  {
    q: 'Who pays import duties and taxes?',
    a: html`<p>Import duties and taxes are set by the destination country. They are usually paid by the recipient unless the sender has agreed otherwise. They are not included in shipping estimates.</p>`,
  },
  {
    q: 'Which carriers do you use?',
    a: html`<p>Crownline selects a suitable carrier or transport partner for each confirmed booking and tells you who it is. We do not claim partnerships or special rates with any carrier unless an agreement is in place.</p>`,
  },
  {
    q: 'Can I change the delivery address after booking?',
    a: html`<p>Sometimes, depending on the carrier and how far the shipment has travelled. Contact us as soon as possible with your shipment reference. Address changes may incur a carrier fee.</p>`,
  },
  {
    q: 'What can I not send?',
    a: html`<p>Restrictions depend on the route and carrier. Dangerous goods, lithium batteries, liquids, perishables, cash, weapons and items prohibited by the origin or destination country need advance approval or cannot be accepted. Always describe your goods accurately in your quote request.</p>`,
  },
  {
    q: 'What happens if my shipment is damaged or lost?',
    a: html`<p>Report it promptly using our <a href="/claims">claims guidance</a>. Keep the packaging and take photos. Compensation depends on the carrier’s liability terms and any optional cover you purchased.</p>`,
  },
];

export interface ProcessStage {
  title: string;
  happening: string;
  meaning: string;
  action: string;
  next: string;
}

export const PROCESS_STAGES: ProcessStage[] = [
  {
    title: 'Calculate or request a quote',
    happening: 'You describe the route, packages and goods, using the calculator or the quote form.',
    meaning: 'We learn enough about your shipment to choose a suitable service. An online estimate is not a confirmed price.',
    action: 'Give accurate weights, dimensions and a clear description of the goods.',
    next: 'A coordinator reviews your request and replies by email, usually with a confirmed quote or a few questions.',
  },
  {
    title: 'Confirm shipment details',
    happening: 'We check addresses, package details and any special requirements with you.',
    meaning: 'Accurate details prevent delays, re-weighing charges and customs problems.',
    action: 'Reply to any questions and confirm the sender and recipient contact details.',
    next: 'You receive the service, price and conditions to review.',
  },
  {
    title: 'Review the service, charges and conditions',
    happening: 'You see the itemised price, what is included and excluded, and the applicable terms.',
    meaning: 'This is the point to ask questions. Duties, taxes and some local charges may be billed separately.',
    action: 'Read the quote and terms carefully. Ask about anything that is unclear.',
    next: 'If you accept, we proceed to booking.',
  },
  {
    title: 'Complete the booking',
    happening: 'We book the shipment with the selected carrier or transport partner.',
    meaning: 'Your shipment now has a Crownline reference. Payment is arranged in writing with your coordinator.',
    action: 'Follow the booking instructions you receive, including any payment instructions.',
    next: 'You receive your shipment reference and private tracking code.',
  },
  {
    title: 'Receive your reference and tracking code',
    happening: 'Your coordinator sends a tracking code that starts with CL.',
    meaning: 'The code lets you, and anyone you share it with, see confirmed milestones. It does not reveal addresses or the value of the goods.',
    action: 'Keep the code private and share it only with people who need it.',
    next: 'Prepare the shipment for collection or drop-off.',
  },
  {
    title: 'Prepare the shipment and documents',
    happening: 'You pack the goods and gather any documents we have asked for, such as a commercial invoice for international shipments.',
    meaning: 'Good packaging prevents damage. Missing documents are the most common cause of customs delays.',
    action: 'Pack securely, attach labels as instructed and have documents ready at collection.',
    next: 'The carrier collects the shipment or you drop it off.',
  },
  {
    title: 'Follow collection, transit, customs and delivery',
    happening: 'Each confirmed milestone appears on the tracking page as it is reported.',
    meaning: 'Gaps between updates are normal on long legs. Problems are shown separately as issues, with an explanation.',
    action: 'Check the tracking page. Act on any request shown, for example to confirm an address or provide a document.',
    next: 'The shipment goes out for delivery.',
  },
  {
    title: 'Delivery confirmed',
    happening: 'The carrier or our team records delivery with evidence, such as a proof-of-delivery reference.',
    meaning: 'Only at this point does the tracking page show 100% and “Delivered”.',
    action: 'Check the goods on arrival and report any visible damage straight away.',
    next: 'On request, we can provide a shipment summary for your records.',
  },
  {
    title: 'Get help or report a problem',
    happening: 'If something goes wrong, our team investigates with the carrier.',
    meaning: 'Prompt reports give the best chance of a good outcome, especially for damage claims.',
    action: 'Contact us with your shipment reference, a description and photos if relevant.',
    next: 'We confirm receipt and keep you updated on the investigation.',
  },
];

export const LEGAL_DRAFT_NOTICE =
  'This document is a working draft prepared for Crownline Express. It must be reviewed and approved by a qualified legal adviser for the jurisdictions where Crownline operates before it is relied on.';

export const TERMS_SECTIONS: { h: string; body: SafeHtml }[] = [
  { h: 'Who we are', body: html`<p>Crownline Express (“Crownline”, “we”) coordinates shipping services through third-party carriers and transport partners. Unless agreed otherwise in writing, Crownline acts as an intermediary arranging carriage and is not itself the carrier.</p>` },
  { h: 'Quotes and estimates', body: html`<p>Online calculator results are estimates for information only. In demonstration mode they are sample figures. A price is binding only when confirmed in writing by Crownline. Quotes rely on the information you provide; if actual weights, dimensions or goods differ, the price may change.</p>` },
  { h: 'Your responsibilities', body: html`<ul><li>Describe goods accurately and declare their true value.</li><li>Package goods so they can withstand normal handling.</li><li>Do not tender prohibited or restricted goods without prior written approval.</li><li>Provide documents required for export and import, and comply with applicable laws.</li></ul>` },
  { h: 'Duties, taxes and third-party charges', body: html`<p>Import duties, taxes, customs brokerage and charges imposed by authorities are not included unless stated in your confirmed quote, and are normally payable by the recipient.</p>` },
  { h: 'Transit times', body: html`<p>Transit times are estimates and not guaranteed. Delays can be caused by carriers, customs, weather, security controls and other events outside our control.</p>` },
  { h: 'Liability and claims', body: html`<p>Carriers’ liability is limited by their terms and by applicable international conventions. Optional cover, where offered, is subject to its own terms. See our <a href="/claims">claims guidance</a> for time limits and evidence.</p>` },
  { h: 'Tracking information', body: html`<p>Tracking shows events confirmed by carriers or our staff. It may be delayed or incomplete and does not show live location unless a live feed is stated.</p>` },
];

export const PRIVACY_SECTIONS: { h: string; body: SafeHtml }[] = [
  { h: 'What this policy covers', body: html`<p>This policy explains how Crownline Express handles personal information on this website and in our shipment operations.</p>` },
  {
    h: 'Information we collect',
    body: html`<ul>
      <li><strong>Quote requests:</strong> your name, email, optional phone and company, route, package details, value of goods and any notes.</li>
      <li><strong>Contact messages:</strong> your name, email, topic and message.</li>
      <li><strong>Shipments:</strong> sender and recipient names, contact details and addresses entered by our staff to arrange carriage.</li>
      <li><strong>Tracking lookups:</strong> we do not ask for personal information to track a shipment. Requests are processed in memory to limit abuse; your IP address may appear in short-lived server logs.</li>
      <li><strong>Staff accounts:</strong> name, email and sign-in activity for Crownline team members.</li>
    </ul>`,
  },
  { h: 'How we use it', body: html`<p>To respond to requests, prepare quotes, arrange and track shipments, meet legal obligations such as customs and tax requirements, prevent fraud and abuse, and keep an audit trail of operational actions.</p>` },
  { h: 'Sharing', body: html`<p>We share shipment information with the carriers and transport partners who handle your shipment, and with customs authorities where required. We do not sell personal information. The public tracking page shows only the service, the origin and destination cities and countries, and confirmed events.</p>` },
  { h: 'Retention', body: html`<p>Retention periods are being finalised. Operational, financial and audit records are kept for as long as needed for the purposes above and to meet legal record-keeping obligations. Quote requests that do not lead to a shipment are intended to be deleted after a defined period.</p>` },
  { h: 'Your rights', body: html`<p>Depending on where you live, you may have the right to access, correct or delete your information, or to object to certain processing. Contact us through the <a href="/contact">contact page</a>. Corrections to shipment records are made through an authorised, audited process.</p>` },
  { h: 'Security', body: html`<p>We use access controls, encrypted connections, hashed credentials, least-privilege staff roles and an append-only audit log. No system is perfectly secure; we will notify affected people of breaches where the law requires.</p>` },
];

export const COOKIE_SECTIONS: { h: string; body: SafeHtml }[] = [
  { h: 'Public website', body: html`<p>The public website does not set cookies and does not use analytics, advertising or social-media tracking.</p>` },
  {
    h: 'Staff console',
    body: html`<p>The staff console at /admin uses strictly necessary cookies:</p>
      <ul><li><strong>Session cookie</strong>: keeps a signed-in staff member authenticated. HttpOnly, SameSite=Strict, expires after inactivity or at most 12 hours.</li>
      <li><strong>Sign-in protection cookie</strong>: protects the sign-in form against cross-site request forgery. Expires after 1 hour.</li></ul>`,
  },
  { h: 'Changes', body: html`<p>If we add any non-essential cookies in future, we will update this policy and ask for consent where required.</p>` },
];
