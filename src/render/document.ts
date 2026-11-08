// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Builds a format-neutral document from a summary, in the layout of the
 * template: the same sections, labels, checkboxes and order. The Markdown
 * and HTML renderers serialise this document; the Python package builds the
 * same document, so its Markdown is byte-identical.
 */

import { CHECKBOX, CHECKBOX_MODALITIES, MODALITY_TABLE, SECTIONS, SIZE_RANGES, STANDARD_MODALITIES, TEMPLATE, field, type FieldSpec } from '../spec/template.js';
import type { ModalitySelection, Summary } from '../schema/types.js';
import { ATTRIBUTION, ATTRIBUTION_URL } from '../version.js';

export type Inline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'strong'; readonly v: string }
  | { readonly t: 'em'; readonly v: string }
  | { readonly t: 'link'; readonly href: string; readonly v: string }
  | { readonly t: 'box'; readonly checked: boolean };

export interface ListItem {
  readonly inl: readonly Inline[];
  readonly sub: readonly (readonly Inline[])[];
}

export interface ModalityRowView {
  readonly label: string;
  readonly footnote: boolean;
  readonly checked: boolean;
  /** Size cell: range checkboxes (standard modalities) or text lines. */
  readonly size: readonly (readonly Inline[])[];
  /** Types-of-content cell: narrative text, or empty. */
  readonly types: string;
  readonly examples: string;
}

export type Block =
  | { readonly b: 'h'; readonly level: 1 | 2 | 3 | 4; readonly text: string; readonly id: string }
  | { readonly b: 'p'; readonly inl: readonly Inline[] }
  | { readonly b: 'text'; readonly v: string }
  | { readonly b: 'field'; readonly label: string; readonly instruction: string; readonly body: readonly Block[] }
  | { readonly b: 'list'; readonly ordered: boolean; readonly items: readonly ListItem[] }
  | { readonly b: 'modalities'; readonly rows: readonly ModalityRowView[]; readonly footnote: string }
  | { readonly b: 'rule' };

export interface DocumentOptions {
  /** Print each field's instruction under its label (useful for drafts). */
  readonly instructions?: boolean;
}

const t = (v: string): Inline => ({ t: 'text', v });
const box = (checked: boolean): Inline => ({ t: 'box', checked });
const p = (...inl: Inline[]): Block => ({ b: 'p', inl });
const NOT_FILLED: Block = { b: 'p', inl: [{ t: 'em', v: 'Not filled in.' }] };
const NOT_APPLICABLE: Block = p(t('Not applicable.'));

/** "YYYY-MM-DD" to "DD/MM/YYYY". */
export function formatDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "YYYY-MM-DD" to the template's "DD/MM/YY". */
export function formatShortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/** "YYYY-MM" to the template's "MM/YYYY"; "not known" stays. */
export function formatMonth(month: string): string {
  return month === 'not known' ? 'not known' : `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

function yesNo(v: boolean | null): Block {
  return p(box(v === true), t(` ${CHECKBOX.yes} `), box(v === false), t(` ${CHECKBOX.no}`));
}

function modalitySelection(m: ModalitySelection): Block {
  const inl: Inline[] = [];
  for (const k of CHECKBOX_MODALITIES) {
    inl.push(box(m.selected.includes(k)), t(` ${CHECKBOX[k]} `));
  }
  inl.push(box(m.other !== ''), t(` ${CHECKBOX.other}`));
  if (m.other !== '') inl.push(t(`: ${m.other}`));
  return { b: 'p', inl };
}

function narrative(v: string, required: boolean): Block[] {
  if (v !== '') return [{ b: 'text', v }];
  return required ? [NOT_FILLED] : [];
}

/** Builds the document for a summary. */
export function buildDocument(s: Summary, options: DocumentOptions = {}): Block[] {
  const out: Block[] = [];
  const withInstructions = options.instructions === true;
  const fieldBlock = (f: FieldSpec, body: Block[], label = f.label): Block => ({ b: 'field', label, instruction: withInstructions ? f.instruction : '', body });
  const heading = (num: string): void => {
    const sec = SECTIONS.find((x) => x.number === num);
    if (sec === undefined) return;
    const depth = num.split('.').length;
    const level = depth === 1 ? 2 : depth === 2 ? 3 : 4;
    out.push({ b: 'h', level, text: `${num}. ${sec.title}`, id: `section-${num.replace(/\./g, '-')}` });
    if (num === '2.2') {
      const [intro, ...items] = sec.intro;
      if (intro !== undefined) out.push(p(t(intro)));
      out.push({ b: 'list', ordered: true, items: items.map((x) => ({ inl: [t(x)], sub: [] })) });
    } else for (const para of sec.intro) out.push(p(t(para)));
  };
  // Gap statements, grouped by the box they are printed in.
  const gapsByBox = new Map<string, { label: string; justification: string }[]>();
  for (const g of s.information_gaps) {
    let f: FieldSpec;
    try {
      f = field(g.field);
    } catch {
      continue;
    }
    const list = gapsByBox.get(f.box) ?? [];
    list.push({ label: f.label, justification: g.justification });
    gapsByBox.set(f.box, list);
  }
  const commentBox = (id: string, text: string): void => {
    const f = field(id);
    const gaps = gapsByBox.get(f.path) ?? [];
    if (text === '' && gaps.length === 0 && !withInstructions) return;
    const body: Block[] = [...narrative(text, false)];
    if (gaps.length > 0) {
      body.push(p(t('Information gaps (Explanatory Notice, point 33):')));
      body.push({ b: 'list', ordered: false, items: gaps.map((g) => ({ inl: [{ t: 'strong', v: g.label }, t(` ${g.justification}`)], sub: [] })) });
    }
    out.push(fieldBlock(f, body));
  };

  out.push({ b: 'h', level: 1, text: 'Public Summary of Training Content for General-Purpose AI models', id: 'summary' });
  out.push(p(t(`Drawn up using the ${TEMPLATE.title} ${TEMPLATE.subtitle} (${TEMPLATE.document}).`)));
  const vf = field('summary_version');
  const vbody: Block[] = [s.summary_version.version === '' ? NOT_FILLED : p(t(s.summary_version.version))];
  if (s.summary_version.previous_versions.length > 0) {
    vbody.push({
      b: 'list',
      ordered: false,
      items: s.summary_version.previous_versions.map((v) => ({ inl: [t(`Previous version ${v.version}`), ...(v.link === '' ? [] : [t(': '), { t: 'link' as const, href: v.link, v: v.link }])], sub: [] })),
    });
  }
  out.push(fieldBlock(vf, vbody));
  out.push(fieldBlock(field('last_update'), [s.last_update === null ? NOT_FILLED : p(t(formatShortDate(s.last_update)))]));

  // 1. General information
  const gi = s.general_information;
  heading('1');
  heading('1.1');
  out.push(fieldBlock(field('provider'), narrative(gi.provider.name_and_contact_details, true)));
  const ar = gi.provider.authorised_representative;
  let arBody: Block[];
  if (ar.applicable === true) arBody = narrative(ar.name_and_contact_details, true);
  else if (ar.applicable === false) {
    arBody = [
      p(
        t(
          ar.not_applicable_reason === 'open_source_exemption'
            ? 'Not applicable: the model is released under a free and open-source licence as described in Article 54(6) AI Act and does not present systemic risks.'
            : ar.not_applicable_reason === 'established_in_union'
              ? 'Not applicable: the provider is established in the Union.'
              : 'Not applicable.',
        ),
      ),
    ];
  } else arBody = [NOT_FILLED];
  out.push(fieldBlock(field('authorised_representative'), arBody));

  heading('1.2');
  const vm = gi.model.versioned_model_names;
  out.push(
    fieldBlock(
      field('versioned_model_names'),
      vm.length === 0
        ? [NOT_FILLED]
        : [
            {
              b: 'list',
              ordered: false,
              items: vm.map((m) => ({
                inl: [t(m.name)],
                sub: m.documentation_links.map((l): Inline[] => [t('Documentation: '), { t: 'link', href: l, v: l }]),
              })),
            },
          ],
    ),
  );
  const dep = gi.model.model_dependencies;
  let depBody: Block[];
  if (dep.is_modification === true) {
    depBody =
      dep.models.length === 0
        ? [NOT_FILLED]
        : [
            {
              b: 'list',
              ordered: false,
              items: dep.models.map((m) => ({ inl: [t(m.name)], sub: m.summary_link === '' ? [] : [[t('Summary: '), { t: 'link' as const, href: m.summary_link, v: m.summary_link }]] })),
            },
          ];
  } else if (dep.is_modification === false) depBody = [p(t('Not applicable: the model is not the result of a modification of a general-purpose AI model already placed on the Union market.'))];
  else depBody = [NOT_FILLED];
  out.push(fieldBlock(field('model_dependencies'), depBody));
  const pdates = gi.model.placement_dates;
  out.push(
    fieldBlock(
      field('placement_dates'),
      pdates.length === 0
        ? [NOT_FILLED]
        : [{ b: 'list', ordered: false, items: pdates.map((d) => ({ inl: [t(`${d.model}: `), d.date === null ? { t: 'em' as const, v: 'not filled in' } : t(formatDate(d.date))], sub: [] })) }],
    ),
  );

  heading('1.3');
  const rows: ModalityRowView[] = [];
  for (const m of STANDARD_MODALITIES) {
    const row = gi.modalities[m];
    const size: Inline[][] = SIZE_RANGES[m].map((r) => [box(row.size_range === r.id), t(` ${r.label}`)]);
    if (m === 'text') size.push([t(`${MODALITY_TABLE.textAlternative} ${gi.modalities.text.size_other_unit}`.trimEnd())]);
    rows.push({ label: MODALITY_TABLE.rows[m].label, footnote: m === 'audio', checked: row.present === true, size, types: row.types_of_content, examples: MODALITY_TABLE.rows[m].examples });
  }
  const others = gi.modalities.other;
  rows.push({
    label: MODALITY_TABLE.rows.other.label,
    footnote: false,
    checked: others.length > 0,
    size: others.map((o): Inline[] => [t(`${o.modality}: ${o.approximate_size}`)]),
    types: others.map((o) => (others.length > 1 ? `${o.modality}: ${o.types_of_content}` : o.types_of_content)).join('\n\n'),
    examples: MODALITY_TABLE.rows.other.examples,
  });
  out.push({ b: 'modalities', rows, footnote: MODALITY_TABLE.audioFootnote });
  const ld = gi.latest_data_collection;
  out.push(
    fieldBlock(field('latest_data_collection'), [
      ld.date === null ? NOT_FILLED : p(t(formatMonth(ld.date))),
      p(t('Continuously trained on new or dynamic data after this date: '), box(ld.continuous_training === true), t(` ${CHECKBOX.yes} `), box(ld.continuous_training === false), t(` ${CHECKBOX.no}`)),
    ]),
  );
  out.push(fieldBlock(field('linguistic_characteristics'), narrative(gi.linguistic_characteristics, true)));
  out.push(fieldBlock(field('other_characteristics'), narrative(gi.other_characteristics, true)));
  commentBox('general_additional_comments', gi.additional_comments);

  // 2. List of data sources
  const ds = s.data_sources;
  heading('2');
  heading('2.1');
  const pd = ds.public_datasets;
  out.push(fieldBlock(field('public_datasets_used'), [yesNo(pd.used)]));
  const gate = (answer: boolean | null, body: () => Block[]): Block[] => (answer === false ? [NOT_APPLICABLE] : answer === null ? [NOT_FILLED] : body());
  out.push(fieldBlock(field('public_datasets_modalities'), gate(pd.used, () => [modalitySelection(pd.modalities)])));
  out.push(
    fieldBlock(
      field('large_public_datasets'),
      gate(pd.used, () =>
        pd.large_datasets.length === 0
          ? [p(t('None.'))]
          : [
              {
                b: 'list',
                ordered: true,
                items: pd.large_datasets.map((d) => {
                  const sub: Inline[][] = [];
                  if (d.description !== '') sub.push([t(`Description: ${d.description}`)]);
                  if (d.collection_period.start !== null || d.collection_period.end !== null) {
                    sub.push([t(`Data collection: ${formatMonth(d.collection_period.start ?? 'not known')} to ${formatMonth(d.collection_period.end ?? 'not known')}`)]);
                  }
                  if (d.selection_approach !== '') sub.push([t(`Approach to selecting the parts used: ${d.selection_approach}`)]);
                  return { inl: [{ t: 'strong', v: d.name }, ...(d.link === '' ? [] : [t(': '), { t: 'link' as const, href: d.link, v: d.link }])], sub };
                }),
              },
            ],
      ),
    ),
  );
  out.push(fieldBlock(field('other_public_datasets'), gate(pd.used, () => (pd.other_datasets_description === '' ? [p(t('None.'))] : narrative(pd.other_datasets_description, false)))));
  commentBox('public_datasets_additional_comments', pd.additional_comments);

  heading('2.2');
  heading('2.2.1');
  const lic = ds.licensed_datasets;
  out.push(fieldBlock(field('licensed_datasets_concluded'), [yesNo(lic.concluded)]));
  out.push(fieldBlock(field('licensed_datasets_modalities'), gate(lic.concluded, () => [modalitySelection(lic.modalities)])));
  heading('2.2.2');
  const op = ds.other_private_datasets;
  out.push(fieldBlock(field('other_private_datasets_obtained'), [yesNo(op.obtained)]));
  out.push(fieldBlock(field('other_private_datasets_modalities'), gate(op.obtained, () => [modalitySelection(op.modalities)])));
  out.push(
    fieldBlock(
      field('publicly_known_private_datasets'),
      gate(op.obtained, () =>
        op.publicly_known_datasets.length === 0
          ? [p(t('None.'))]
          : [{ b: 'list', ordered: false, items: op.publicly_known_datasets.map((d) => ({ inl: [t(d.name), ...(d.link === '' ? [] : [t(': '), { t: 'link' as const, href: d.link, v: d.link }])], sub: [] })) }],
      ),
    ),
  );
  out.push(fieldBlock(field('non_publicly_known_private_datasets'), gate(op.obtained, () => (op.non_publicly_known_description === '' ? [p(t('None.'))] : narrative(op.non_publicly_known_description, false)))));
  commentBox('other_private_datasets_additional_comments', op.additional_comments);

  heading('2.3');
  const cd = ds.crawled_data;
  out.push(fieldBlock(field('crawlers_used'), [yesNo(cd.crawlers_used)]));
  out.push(
    fieldBlock(
      field('crawler_names'),
      gate(cd.crawlers_used, () => (cd.crawler_names.length === 0 ? [NOT_FILLED] : [{ b: 'list', ordered: false, items: cd.crawler_names.map((n) => ({ inl: [t(n)], sub: [] })) }])),
    ),
  );
  out.push(fieldBlock(field('crawler_purposes'), gate(cd.crawlers_used, () => narrative(cd.purposes, true))));
  out.push(fieldBlock(field('crawler_behaviour'), gate(cd.crawlers_used, () => narrative(cd.crawler_behaviour, true))));
  out.push(
    fieldBlock(
      field('crawl_period'),
      gate(cd.crawlers_used, () => [p(t(`From ${cd.collection_period.from === null ? '..' : formatMonth(cd.collection_period.from)} to ${cd.collection_period.to === null ? '..' : formatMonth(cd.collection_period.to)}`))]),
    ),
  );
  out.push(fieldBlock(field('crawled_content'), gate(cd.crawlers_used, () => narrative(cd.content_description, true))));
  out.push(fieldBlock(field('crawled_modalities'), gate(cd.crawlers_used, () => [modalitySelection(cd.modalities)])));
  out.push(
    fieldBlock(
      field('top_domains'),
      gate(cd.crawlers_used, () => {
        const body: Block[] = [];
        if (cd.top_domains.domains.length > 0) body.push({ b: 'list', ordered: true, items: cd.top_domains.domains.map((d) => ({ inl: [t(d)], sub: [] })) });
        if (cd.top_domains.access_information !== '') body.push({ b: 'text', v: cd.top_domains.access_information });
        return body.length === 0 ? [NOT_FILLED] : body;
      }),
    ),
  );
  commentBox('crawled_additional_comments', cd.additional_comments);

  heading('2.4');
  const ud = ds.user_data;
  out.push(fieldBlock(field('user_data_model_interactions'), [yesNo(ud.from_model_interactions)]));
  out.push(fieldBlock(field('user_data_other_services'), [yesNo(ud.from_other_services)]));
  out.push(fieldBlock(field('user_data_services'), gate(ud.from_other_services, () => narrative(ud.services_description, true))));
  const anyUser = ud.from_model_interactions === true || ud.from_other_services === true ? true : ud.from_model_interactions === false && ud.from_other_services === false ? false : null;
  out.push(fieldBlock(field('user_data_modalities'), gate(anyUser, () => [modalitySelection(ud.modalities)])));
  commentBox('user_data_additional_comments', ud.additional_comments);

  heading('2.5');
  const sy = ds.synthetic_data;
  out.push(fieldBlock(field('synthetic_data_created'), [yesNo(sy.created)]));
  out.push(fieldBlock(field('synthetic_data_modalities'), gate(sy.created, () => [modalitySelection(sy.modalities)])));
  out.push(
    fieldBlock(
      field('synthetic_market_models'),
      gate(sy.created, () =>
        sy.market_models.length === 0
          ? [p(t('None.'))]
          : [
              {
                b: 'list',
                ordered: false,
                items: sy.market_models.map((m) => ({ inl: [t(m.name)], sub: m.summary_link === '' ? [] : [[t('Summary: '), { t: 'link' as const, href: m.summary_link, v: m.summary_link }]] })),
              },
            ],
      ),
    ),
  );
  out.push(fieldBlock(field('synthetic_other_models'), gate(sy.created, () => (sy.other_models_information === '' ? [p(t('None.'))] : narrative(sy.other_models_information, false)))));
  commentBox('synthetic_additional_comments', sy.additional_comments);

  heading('2.6');
  const os = ds.other_sources;
  out.push(fieldBlock(field('other_sources_used'), [yesNo(os.used)]));
  out.push(fieldBlock(field('other_sources_description'), gate(os.used, () => narrative(os.description, true))));
  commentBox('other_sources_additional_comments', os.additional_comments);

  // 3. Data processing aspects
  const dp = s.data_processing;
  heading('3');
  heading('3.1');
  out.push(fieldBlock(field('code_of_practice_signatory'), [yesNo(dp.tdm_reservations.code_of_practice_signatory)]));
  out.push(fieldBlock(field('tdm_measures'), narrative(dp.tdm_reservations.measures, true)));
  commentBox('tdm_additional_comments', dp.tdm_reservations.additional_comments);
  heading('3.2');
  out.push(fieldBlock(field('illegal_content_measures'), narrative(dp.illegal_content.measures, true)));
  heading('3.3');
  const otherInfo = field('other_information');
  const otherGaps = gapsByBox.get(otherInfo.path) ?? [];
  const otherBody: Block[] = [...narrative(dp.other_information, false)];
  if (otherGaps.length > 0) {
    otherBody.push(p(t('Information gaps (Explanatory Notice, point 33):')));
    otherBody.push({ b: 'list', ordered: false, items: otherGaps.map((g) => ({ inl: [{ t: 'strong', v: g.label }, t(` ${g.justification}`)], sub: [] })) });
  }
  out.push(fieldBlock(otherInfo, otherBody.length === 0 ? [p(t('None.'))] : otherBody));

  out.push({ b: 'rule' });
  out.push(p(t(`Template: ${TEMPLATE.document} of 5 December 2025, `), { t: 'link', href: TEMPLATE.sourceUrl, v: TEMPLATE.sourceUrl }, t(`. ${TEMPLATE.copyright}`)));
  out.push(p(t('Prepared with '), { t: 'link', href: ATTRIBUTION_URL, v: ATTRIBUTION }, t('.')));
  return out;
}
