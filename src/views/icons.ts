import { raw, type SafeHtml } from '../lib/html.ts';

const svg = (body: string, size = 24) =>
  raw(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
  );

/** Custom line icons drawn for Crownline. */
export const icons = {
  parcel: () => svg('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/><path d="m7.8 5.3 8.4 4.5"/>'),
  globe: () => svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5S9.4 5.9 12 3.5z"/>'),
  plane: () => svg('<path d="M10.2 13.8 4 12.2l1.3-1.3 6.4.4 4.6-4.6a1.8 1.8 0 0 1 2.5 2.5l-4.6 4.6.4 6.4-1.3 1.3-1.6-6.2-3.3 3.3.2 2-1 1-1.2-2.8-2.8-1.2 1-1 2 .2z"/>'),
  ship: () => svg('<path d="M3 17.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M4.5 14.5 3.8 11h16.4l-1.4 3.5"/><path d="M7 11V7.5h4V11M11 9h4v2M9 7.5V5"/>'),
  truck: () => svg('<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>'),
  building: () => svg('<path d="M4 20.5V6l8-3 8 3v14.5"/><path d="M8 9h2M14 9h2M8 13h2M14 13h2M10 20.5v-4h4v4M2.5 20.5h19"/>'),
  warehouse: () => svg('<path d="M3 20.5V9l9-5 9 5v11.5"/><path d="M7 20.5v-8h10v8M7 15.5h10M7 18h10"/>'),
  calculator: () => svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'),
  search: () => svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  route: () => svg('<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>'),
  document: () => svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2"/>'),
  shield: () => svg('<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>'),
  bell: () => svg('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  check: () => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 20),
  alert: () => svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17h.01"/>', 20),
  info: () => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', 20),
  clock: () => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 20),
  pin: () => svg('<path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>', 20),
  arrowRight: () => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 20),
  mail: () => svg('<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>', 20),
  handshake: () => svg('<path d="m3 12 3.5-3.5 4 1.5 2.5-2 3 .5L21 12"/><path d="m6.5 8.5 4.5 7a1.6 1.6 0 0 0 2.5.2l3.5-3.7M10 14l2 2M12.5 12.5l2 2"/>'),
} satisfies Record<string, () => SafeHtml>;

export function crownlineMark(size = 44): SafeHtml {
  return raw(
    `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="30" fill="#0c1730"/><circle cx="32" cy="32" r="30" fill="none" stroke="#d7b56a" stroke-width="2.5"/><circle cx="32" cy="32" r="25" fill="none" stroke="#d7b56a" stroke-width="1"/><path fill="#f7f1e4" d="M18.5 39.2h27v3.4h-27z"/><path fill="#f7f1e4" d="M19.2 39.2 23.6 27.4 29.2 34.2 32 19.6 34.8 34.2 40.4 27.4 44.8 39.2z"/><circle cx="23.6" cy="25.5" r="1.85" fill="#d7b56a"/><circle cx="32" cy="17.6" r="2.05" fill="#d7b56a"/><circle cx="40.4" cy="25.5" r="1.85" fill="#d7b56a"/><rect x="18.5" y="44.6" width="27" height="2.5" rx="0.6" fill="#d7b56a"/></svg>`,
  );
}
