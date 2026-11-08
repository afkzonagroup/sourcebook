// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Self-contained HTML output. Two variants:
 *
 * - `screen`: for publishing on a website.
 * - `print`: A4 page layout for "Print to PDF" in any browser (no DOCX or
 *   PDF library needed).
 *
 * Every text is HTML-escaped, links are only validated http(s) URLs with
 * `rel="noopener noreferrer"`, and the page carries a Content Security
 * Policy that allows no scripts, no network requests and only its own
 * stylesheet (by hash). The attribution footer "Sourcebook by AFKzona Group"
 * is required by LICENSE-ADDITIONAL-TERMS.md.
 */

import { createHash } from 'node:crypto';
import { isLink } from '../schema/checks.js';
import type { Summary } from '../schema/types.js';
import { buildDocument, type Block, type DocumentOptions, type Inline } from './document.js';

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const SCREEN_CSS = `:root{color-scheme:light dark;--fg:#1b1d21;--muted:#565b66;--line:#d5d8de;--bg:#ffffff;--head:#f3f4f6;--accent:#1f4fa3}
@media (prefers-color-scheme:dark){:root{--fg:#e8eaee;--muted:#a5abb8;--line:#3a3f4a;--bg:#15171b;--head:#1f2228;--accent:#8fb3ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main,.wrap{max-width:52rem;margin:0 auto;padding:2rem 1rem 3rem}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 .75rem}
h2{font-size:1.3rem;margin:2.5rem 0 .75rem;padding-bottom:.35rem;border-bottom:2px solid var(--line)}
h3{font-size:1.08rem;margin:2rem 0 .5rem}
h4{font-size:1rem;margin:1.5rem 0 .5rem}
p{margin:.5rem 0}
.field{margin:1rem 0;padding:.75rem 1rem;border:1px solid var(--line);border-radius:6px}
.label{font-weight:600;margin:0 0 .35rem}
.instruction{color:var(--muted);font-size:.92rem;font-style:italic}
.nf{color:var(--muted);font-style:italic}
ol,ul{margin:.35rem 0;padding-left:1.4rem}
li{margin:.15rem 0}
ol.domains{columns:2 16rem;column-gap:2rem}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.95rem}
th,td{border:1px solid var(--line);padding:.5rem .6rem;vertical-align:top;text-align:left}
thead th{background:var(--head)}
.examples{color:var(--muted);font-size:.88rem;margin-top:.35rem}
.footnote{color:var(--muted);font-size:.88rem}
a{color:var(--accent);overflow-wrap:anywhere}
hr{border:0;border-top:1px solid var(--line);margin:2.5rem 0 1rem}
footer p{color:var(--muted);font-size:.88rem}
@media (max-width:40rem){main,.wrap{padding:1.25rem 1rem 2rem}table,thead,tbody,tr,th,td{display:block}thead{display:none}td{border-top:0}tr{border-top:1px solid var(--line);margin-bottom:.75rem}}`;

const PRINT_CSS = `@page{size:A4;margin:18mm 16mm 20mm}
*{box-sizing:border-box}
body{margin:0;color:#000;background:#fff;font:10.5pt/1.45 "Times New Roman",Georgia,serif}
main,.wrap{max-width:none;margin:0;padding:0}
h1{font-size:16pt;margin:0 0 6pt}
h2{font-size:13pt;margin:16pt 0 6pt;break-after:avoid;border-bottom:1pt solid #000;padding-bottom:2pt}
h3{font-size:11.5pt;margin:12pt 0 4pt;break-after:avoid}
h4{font-size:10.5pt;margin:10pt 0 4pt;break-after:avoid}
p{margin:3pt 0}
.field{margin:6pt 0;padding:5pt 7pt;border:.75pt solid #000;break-inside:avoid-page}
.label{font-weight:700;margin:0 0 2pt}
.instruction{font-style:italic;font-size:9.5pt}
.nf{font-style:italic}
ol,ul{margin:2pt 0;padding-left:16pt}
ol.domains{columns:3;column-gap:12pt;font-size:9pt}
table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:9.5pt;break-inside:auto}
th,td{border:.75pt solid #000;padding:3pt 5pt;vertical-align:top;text-align:left}
tr{break-inside:avoid}
.examples{font-size:8.5pt;font-style:italic;margin-top:2pt}
.footnote{font-size:8.5pt}
a{color:#000;text-decoration:underline;overflow-wrap:anywhere}
hr{border:0;border-top:.75pt solid #000;margin:14pt 0 6pt}
footer p{font-size:8.5pt}
@media screen{main,.wrap{max-width:210mm;margin:0 auto;padding:12mm 16mm}}`;

function cspHash(css: string): string {
  return `sha256-${createHash('sha256').update(css, 'utf8').digest('base64')}`;
}

function inline(parts: readonly Inline[]): string {
  let out = '';
  for (const part of parts) {
    switch (part.t) {
      case 'text':
        out += escapeHtml(part.v);
        break;
      case 'strong':
        out += `<strong>${escapeHtml(part.v)}</strong>`;
        break;
      case 'em':
        out += `<em class="nf">${escapeHtml(part.v)}</em>`;
        break;
      case 'link':
        out += isLink(part.href) ? `<a href="${escapeHtml(part.href)}" rel="noopener noreferrer">${escapeHtml(part.v)}</a>` : escapeHtml(part.v);
        break;
      case 'box':
        out += part.checked ? '<span role="img" aria-label="selected">☒</span>' : '<span role="img" aria-label="not selected">☐</span>';
        break;
    }
  }
  return out;
}

function paragraphs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((para) =>
      para
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .map(escapeHtml)
        .join('<br>\n'),
    )
    .filter((para) => para !== '')
    .map((para) => `<p>${para}</p>`)
    .join('\n');
}

function block(b: Block, domainsList: boolean): string {
  switch (b.b) {
    case 'h':
      return `<h${b.level} id="${escapeHtml(b.id)}">${escapeHtml(b.text)}</h${b.level}>`;
    case 'p':
      return `<p>${inline(b.inl)}</p>`;
    case 'text':
      return paragraphs(b.v);
    case 'rule':
      return '<hr>';
    case 'field': {
      const domains = b.label.startsWith('Summary of the most relevant domain names');
      const body = b.body.map((x) => block(x, domains)).join('\n');
      const instruction = b.instruction === '' ? '' : `\n<p class="instruction">${escapeHtml(b.instruction)}</p>`;
      return `<section class="field">\n<p class="label">${escapeHtml(b.label)}</p>${instruction}\n${body}\n</section>`;
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const cls = b.ordered && domainsList ? ' class="domains"' : '';
      const items = b.items
        .map((item) => {
          const sub = item.sub.length === 0 ? '' : `<ul>${item.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>`;
          return `<li>${inline(item.inl)}${sub}</li>`;
        })
        .join('\n');
      return `<${tag}${cls}>\n${items}\n</${tag}>`;
    }
    case 'modalities': {
      const rows = b.rows
        .map((row) => {
          const label = `${row.checked ? '<span role="img" aria-label="selected">☒</span>' : '<span role="img" aria-label="not selected">☐</span>'} ${escapeHtml(row.label)}${row.footnote ? '<sup>1</sup>' : ''}`;
          const size = row.size.map((line) => `<div>${inline(line)}</div>`).join('');
          const types = row.types === '' ? '' : paragraphs(row.types);
          return `<tr><th scope="row">${label}</th><td>${size}</td><td>${types}<p class="examples">${escapeHtml(row.examples)}</p></td></tr>`;
        })
        .join('\n');
      return `<table>\n<thead><tr><th scope="col">Modality</th><th scope="col">Training data size</th><th scope="col">Types of content</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n<p class="footnote"><sup>1</sup> ${escapeHtml(b.footnote)}</p>`;
    }
  }
}

export interface HtmlOptions extends DocumentOptions {
  /** "screen" (default) or "print" (A4 layout for printing to PDF). */
  readonly variant?: 'screen' | 'print';
  /** Language of the document (BCP 47); "en" by default. */
  readonly lang?: string;
}

/**
 * Renders a summary as one self-contained HTML page.
 *
 * @example renderHtml(summary, { variant: 'print' }).includes('@page{size:A4') // => true
 */
export function renderHtml(summary: Summary, options: HtmlOptions = {}): string {
  const doc = buildDocument(summary, options);
  const css = options.variant === 'print' ? PRINT_CSS : SCREEN_CSS;
  const lang = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(options.lang ?? 'en') ? (options.lang ?? 'en') : 'en';
  const models = summary.general_information.model.versioned_model_names.map((m) => m.name).filter((n) => n !== '');
  const title = `Public Summary of Training Content${models.length > 0 ? `: ${models.join(', ')}` : ''}`;
  const footerStart = doc.findIndex((b) => b.b === 'rule');
  const mainBlocks = footerStart < 0 ? doc : doc.slice(0, footerStart);
  const footerBlocks = footerStart < 0 ? [] : doc.slice(footerStart + 1);
  const csp = `default-src 'none'; style-src '${cspHash(css)}'; img-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="Sourcebook by AFKzona Group">
<title>${escapeHtml(title.length > 200 ? `${title.slice(0, 197)}...` : title)}</title>
<style>${css}</style>
</head>
<body>
<main>
${mainBlocks.map((b) => block(b, false)).join('\n')}
</main>
<footer class="wrap">
<hr>
${footerBlocks.map((b) => block(b, false)).join('\n')}
</footer>
</body>
</html>
`;
}
