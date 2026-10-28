import { html, type SafeHtml } from '../lib/html.ts';
import { COUNTRY_OPTIONS } from '../domain/countries.ts';
import type { FieldErrors } from '../validation/schemas.ts';
import { icons } from './icons.ts';

export type Values = Record<string, string | undefined>;

const id = (name: string) => `f-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export function errorSummary(errors: FieldErrors | undefined, title = 'Please check the highlighted details', idPrefix?: string): SafeHtml {
  if (!errors || Object.keys(errors).length === 0) return html``;
  const target = (field: string) => (idPrefix ? `${idPrefix}${field}` : id(field));
  return html`<div class="alert alert-error" role="alert" tabindex="-1" data-autofocus>
    <div class="alert-icon">${icons.alert()}</div>
    <div>
      <h2 class="alert-title">${title}</h2>
      <ul class="error-list">
        ${Object.entries(errors).map(([field, msg]) => html`<li><a href="#${target(field)}">${msg}</a></li>`)}
      </ul>
    </div>
  </div>`;
}

interface FieldOpts {
  name: string;
  id?: string;
  label: string;
  values?: Values | undefined;
  errors?: FieldErrors | undefined;
  hint?: string;
  type?: string;
  required?: boolean;
  autocomplete?: string;
  inputmode?: string;
  step?: string;
  min?: string;
  max?: string;
  maxlength?: number;
  placeholder?: string;
  className?: string;
  hideOptional?: boolean;
}

export function textField(o: FieldOpts): SafeHtml {
  const err = o.errors?.[o.name];
  const fid = o.id ?? id(o.name);
  const hintId = o.hint ? `${fid}-hint` : undefined;
  const errId = err ? `${fid}-error` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return html`<div class="field ${o.className ?? ''} ${err ? 'has-error' : ''}">
    <label for="${fid}">${o.label}${o.required || o.hideOptional ? '' : html` <span class="optional">(optional)</span>`}</label>
    ${o.hint ? html`<p class="hint" id="${hintId}">${o.hint}</p>` : ''}
    ${err ? html`<p class="field-error" id="${errId}">${err}</p>` : ''}
    <input id="${fid}" name="${o.name}" type="${o.type ?? 'text'}" value="${o.values?.[o.name] ?? ''}"
      ${o.required ? 'required' : ''} ${o.autocomplete ? html`autocomplete="${o.autocomplete}"` : ''}
      ${o.inputmode ? html`inputmode="${o.inputmode}"` : ''} ${o.step ? html`step="${o.step}"` : ''}
      ${o.min ? html`min="${o.min}"` : ''} ${o.max ? html`max="${o.max}"` : ''}
      ${o.maxlength ? html`maxlength="${o.maxlength}"` : ''} ${o.placeholder ? html`placeholder="${o.placeholder}"` : ''}
      ${describedBy ? html`aria-describedby="${describedBy}"` : ''} ${err ? html`aria-invalid="true"` : ''}>
  </div>`;
}

export function textArea(o: FieldOpts & { rows?: number }): SafeHtml {
  const err = o.errors?.[o.name];
  const fid = o.id ?? id(o.name);
  return html`<div class="field ${o.className ?? ''} ${err ? 'has-error' : ''}">
    <label for="${fid}">${o.label}${o.required || o.hideOptional ? '' : html` <span class="optional">(optional)</span>`}</label>
    ${o.hint ? html`<p class="hint" id="${fid}-hint">${o.hint}</p>` : ''}
    ${err ? html`<p class="field-error" id="${fid}-error">${err}</p>` : ''}
    <textarea id="${fid}" name="${o.name}" rows="${o.rows ?? 4}" ${o.required ? 'required' : ''}
      ${o.maxlength ? html`maxlength="${o.maxlength}"` : ''} ${err ? html`aria-invalid="true"` : ''}
      ${o.hint || err ? html`aria-describedby="${[o.hint ? `${fid}-hint` : '', err ? `${fid}-error` : ''].join(' ').trim()}"` : ''}>${o.values?.[o.name] ?? ''}</textarea>
  </div>`;
}

export function selectField(o: FieldOpts & { options: readonly { value: string; label: string; disabled?: boolean }[]; placeholderOption?: string }): SafeHtml {
  const err = o.errors?.[o.name];
  const fid = o.id ?? id(o.name);
  const current = o.values?.[o.name] ?? '';
  return html`<div class="field ${o.className ?? ''} ${err ? 'has-error' : ''}">
    <label for="${fid}">${o.label}${o.required || o.hideOptional ? '' : html` <span class="optional">(optional)</span>`}</label>
    ${o.hint ? html`<p class="hint" id="${fid}-hint">${o.hint}</p>` : ''}
    ${err ? html`<p class="field-error" id="${fid}-error">${err}</p>` : ''}
    <select id="${fid}" name="${o.name}" ${o.required ? 'required' : ''} ${o.autocomplete ? html`autocomplete="${o.autocomplete}"` : ''} ${err ? html`aria-invalid="true"` : ''}
      ${o.hint || err ? html`aria-describedby="${[o.hint ? `${fid}-hint` : '', err ? `${fid}-error` : ''].join(' ').trim()}"` : ''}>
      ${o.placeholderOption !== undefined ? html`<option value="">${o.placeholderOption}</option>` : ''}
      ${o.options.map(
        (opt) => html`<option value="${opt.value}" ${opt.value === current ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}>${opt.label}</option>`,
      )}
    </select>
  </div>`;
}

export function countrySelect(o: FieldOpts): SafeHtml {
  return selectField({ ...o, options: COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.name })), placeholderOption: 'Choose a country' });
}

export function checkboxField(o: { name: string; id?: string; label: string; hint?: string; checked?: boolean; errors?: FieldErrors | undefined; required?: boolean }): SafeHtml {
  const err = o.errors?.[o.name];
  const fid = o.id ?? id(o.name);
  return html`<div class="field field-check ${err ? 'has-error' : ''}">
    ${err ? html`<p class="field-error" id="${fid}-error">${err}</p>` : ''}
    <label class="check">
      <input type="checkbox" id="${fid}" name="${o.name}" ${o.checked ? 'checked' : ''} ${o.required ? 'required' : ''} ${err ? html`aria-invalid="true"` : ''}>
      <span>${o.label}${o.hint ? html`<span class="hint">${o.hint}</span>` : ''}</span>
    </label>
  </div>`;
}

/** WebP with a JPEG fallback. WebP files are produced by `npm run assets:optimize`. */
export function picture(o: { src: string; alt: string; width: number; height: number; className?: string; eager?: boolean }): SafeHtml {
  const webp = o.src.replace(/\.jpg$/, '.webp');
  return html`<picture>
    ${webp !== o.src ? html`<source srcset="${webp}" type="image/webp">` : ''}
    <img src="${o.src}" alt="${o.alt}" width="${o.width}" height="${o.height}" decoding="async" ${o.eager ? html`fetchpriority="high"` : html`loading="lazy"`} ${o.className ? html`class="${o.className}"` : ''}>
  </picture>`;
}

export function hidden(name: string, value: string): SafeHtml {
  return html`<input type="hidden" name="${name}" value="${value}">`;
}

export function badge(text: string, tone: 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info' = 'neutral'): SafeHtml {
  return html`<span class="badge badge-${tone}">${text}</span>`;
}

export function progressBar(percent: number, label: string): SafeHtml {
  return html`<div class="progress">
    <div class="progress-meta"><span>${label}</span><strong>${percent}%</strong></div>
    <progress max="100" value="${percent}" aria-label="${label}: ${percent}%">${percent}%</progress>
  </div>`;
}

export function notice(kind: 'info' | 'warning' | 'success' | 'error' | 'demo', title: string, body: SafeHtml | string): SafeHtml {
  const icon = kind === 'success' ? icons.check() : kind === 'info' ? icons.info() : icons.alert();
  return html`<div class="alert alert-${kind}" role="${kind === 'error' ? 'alert' : 'note'}">
    <div class="alert-icon">${icon}</div>
    <div><p class="alert-title">${title}</p><div class="alert-body">${body}</div></div>
  </div>`;
}

export function pagination(base: string, params: URLSearchParams, page: number, pageSize: number, total: number): SafeHtml {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return html`<p class="muted small">${total} ${total === 1 ? 'record' : 'records'}</p>`;
  const link = (p: number) => {
    const q = new URLSearchParams(params);
    q.set('page', String(p));
    return `${base}?${q.toString()}`;
  };
  return html`<nav class="pagination" aria-label="Pagination">
    <span class="muted small">Page ${page} of ${pages} · ${total} records</span>
    ${page > 1 ? html`<a class="btn btn-ghost btn-sm" href="${link(page - 1)}" rel="prev">Previous</a>` : ''}
    ${page < pages ? html`<a class="btn btn-ghost btn-sm" href="${link(page + 1)}" rel="next">Next</a>` : ''}
  </nav>`;
}
