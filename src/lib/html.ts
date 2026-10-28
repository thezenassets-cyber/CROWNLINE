/** Marker for markup that has already been escaped or is trusted template output. */
export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (c) => ESCAPES[c]!);
}

type Interpolation = SafeHtml | string | number | boolean | null | undefined | readonly Interpolation[];

function render(value: Interpolation): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map((v: Interpolation) => render(v)).join('');
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value unless it is SafeHtml.
 * All server-rendered pages are built with this, so user-supplied data is encoded by default.
 */
export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) out += render(values[i]!) + (strings[i + 1] ?? '');
  return new SafeHtml(out);
}

/** Trusted static markup such as inline SVG icons defined in source code. */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}
