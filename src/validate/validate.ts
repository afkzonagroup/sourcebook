// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Checks that a summary answers everything the template asks for, and that
 * the answers fit together. Errors are gaps the template does not allow;
 * warnings are likely problems; infos explain applicable rules.
 *
 * The rules follow the template's own wording: "If yes, ..." fields are
 * required only after a Yes, "Where applicable" fields produce warnings, and
 * "(optional)" fields are never required. See docs/template-mapping.md.
 */

import { FIELDS, KEY_DATES, STANDARD_MODALITIES, field, type FieldSpec } from '../spec/template.js';
import { addMonths, isIsoDate } from '../schema/checks.js';
import type { ModalitySelection, Summary } from '../schema/types.js';
import { largeDatasets, type Inventory } from '../collect/inventory.js';
import { formatMessage, type MessageCode } from './messages.js';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  code: MessageCode;
  /** Template section, e.g. "2.3" ("0" for the header lines). */
  section: string;
  /** Path in the summary file. */
  path: string;
  message: string;
}

export interface ValidationResult {
  /** True when there are no errors. */
  ok: boolean;
  errors: number;
  warnings: number;
  /** True when a covered model was placed on the market before 2 August 2025. */
  legacy_model: boolean;
  issues: ValidationIssue[];
}

export interface ValidateOptions {
  /** Date to check against ("YYYY-MM-DD"); today (UTC) by default. */
  readonly asOf?: string;
  /** An inventory to cross-check large datasets and the domain list against. */
  readonly inventory?: Inventory;
}

const MODALITY_NAMES: Record<string, string> = { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video' };

function filled(s: string): boolean {
  return s.trim() !== '';
}

function selectionFilled(m: ModalitySelection): boolean {
  return m.selected.length > 0 || filled(m.other);
}

/**
 * Validates a summary against the template.
 *
 * @example
 * const result = validateSummary(summary, { asOf: '2026-11-08' });
 * if (!result.ok) for (const i of result.issues) console.log(i.message);
 */
export function validateSummary(summary: Summary, options: ValidateOptions = {}): ValidationResult {
  if (options.asOf !== undefined && !isIsoDate(options.asOf)) throw new RangeError('asOf must be a date as YYYY-MM-DD.');
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const issues: ValidationIssue[] = [];
  const gi = summary.general_information;
  const ds = summary.data_sources;
  const dp = summary.data_processing;

  // Notice point 33 allows information gaps only for models placed on the market before 2 August 2025. A summary
  // that also covers a later (or not yet placed) model may not use them, so every listed model must qualify.
  const dates = gi.model.placement_dates;
  const legacy = dates.length > 0 && dates.every((p) => p.date !== null && p.date < KEY_DATES.obligationsApply);
  const gapFields = new Set(summary.information_gaps.map((g) => g.field));

  const add = (severity: Severity, code: MessageCode, section: string, path: string, values: Record<string, string> = {}): void => {
    issues.push({ severity, code, section, path, message: formatMessage(code, { section, ...values }) });
  };
  /** Reports a missing required answer, unless a permitted information gap covers it. */
  const need = (id: string, present: boolean, path?: string): void => {
    if (present) return;
    const f = field(id);
    if (gapFields.has(id) && legacy) {
      add('info', 'gap-stated', f.section, path ?? f.path, { label: f.label });
      return;
    }
    add('error', 'missing', f.section, path ?? f.path, { label: f.label });
  };
  const whereApplicable = (id: string, present: boolean): void => {
    if (present) return;
    const f = field(id);
    if (gapFields.has(id) && legacy) {
      add('info', 'gap-stated', f.section, f.path, { label: f.label });
      return;
    }
    add('warning', 'missing-where-applicable', f.section, f.path, { label: f.label });
  };
  const notAfterNo = (id: string, present: boolean): void => {
    if (!present) return;
    const f = field(id);
    add('warning', 'inconsistent', f.section, f.path, { label: f.label });
  };

  // Header.
  need('summary_version', filled(summary.summary_version.version), 'summary_version.version');
  summary.summary_version.previous_versions.forEach((p, i) => {
    if (!filled(p.link)) add('error', 'previous-version-link', '0', `summary_version.previous_versions[${i}].link`, { name: p.version === '' ? `#${i + 1}` : p.version });
  });
  if (summary.last_update === null) need('last_update', false);
  else if (summary.last_update > asOf) add('warning', 'last-update-future', '0', 'last_update', { name: summary.last_update, detail: asOf });

  // 1.1
  need('provider', filled(gi.provider.name_and_contact_details));
  const ar = gi.provider.authorised_representative;
  if (ar.applicable === null) need('authorised_representative', false, `${field('authorised_representative').path}.applicable`);
  else if (ar.applicable) need('authorised_representative', filled(ar.name_and_contact_details), `${field('authorised_representative').path}.name_and_contact_details`);
  else {
    if (ar.not_applicable_reason === null) add('error', 'authorised-representative-reason', '1.1', `${field('authorised_representative').path}.not_applicable_reason`);
    notAfterNo('authorised_representative', filled(ar.name_and_contact_details));
  }

  // 1.2
  const models = gi.model.versioned_model_names;
  need('versioned_model_names', models.some((m) => filled(m.name)));
  const names = new Set<string>();
  models.forEach((m, i) => {
    if (!filled(m.name)) add('error', 'model-name-missing', '1.2', `${field('versioned_model_names').path}[${i}].name`);
    else if (names.has(m.name)) add('error', 'model-name-duplicate', '1.2', `${field('versioned_model_names').path}[${i}].name`, { name: m.name });
    else names.add(m.name);
  });
  const dep = gi.model.model_dependencies;
  if (dep.is_modification === null) need('model_dependencies', false, `${field('model_dependencies').path}.is_modification`);
  else if (dep.is_modification) {
    need('model_dependencies', dep.models.length > 0, `${field('model_dependencies').path}.models`);
    dep.models.forEach((m, i) => {
      if (!filled(m.name)) add('error', 'dependency-name-missing', '1.2', `${field('model_dependencies').path}.models[${i}].name`);
    });
  } else notAfterNo('model_dependencies', dep.models.length > 0);
  const dated = new Map(gi.model.placement_dates.map((p) => [p.model, p.date]));
  need('placement_dates', gi.model.placement_dates.some((p) => p.date !== null));
  for (const n of names) {
    if (!dated.has(n) || dated.get(n) === null) {
      if (!(gapFields.has('placement_dates') && legacy)) add('error', 'placement-date-missing', '1.2', field('placement_dates').path, { name: n });
    }
  }
  gi.model.placement_dates.forEach((p, i) => {
    if (filled(p.model) && !names.has(p.model)) add('error', 'placement-date-unknown-model', '1.2', `${field('placement_dates').path}[${i}].model`, { name: p.model });
  });

  // 1.3
  const mods = gi.modalities;
  const present = new Set<string>();
  for (const m of STANDARD_MODALITIES) {
    const row = mods[m];
    const path = `general_information.modalities.${m}`;
    if (row.present === true) {
      present.add(m);
      const altOk = m === 'text' && filled(mods.text.size_other_unit);
      if (row.size_range === null && !altOk) {
        if (!(gapFields.has('modalities') && legacy)) add('error', 'missing-size', '1.3', `${path}.size_range`, { name: MODALITY_NAMES[m] ?? m, detail: m === 'text' ? ' or give the size in another unit' : '' });
      }
      if (!filled(row.types_of_content) && !(gapFields.has('modalities') && legacy)) add('error', 'missing-types', '1.3', `${path}.types_of_content`, { name: MODALITY_NAMES[m] ?? m });
    } else if (row.size_range !== null || filled(row.types_of_content) || (m === 'text' && filled(mods.text.size_other_unit))) {
      add('warning', 'inconsistent', '1.3', `${path}.present`, { label: MODALITY_NAMES[m] ?? m });
    }
  }
  mods.other.forEach((o, i) => {
    if (!filled(o.modality) || !filled(o.approximate_size) || !filled(o.types_of_content)) {
      add('error', 'other-modality-incomplete', '1.3', `general_information.modalities.other[${i}]`, { name: o.modality === '' ? `#${i + 1}` : o.modality });
    }
  });
  if (present.size === 0 && mods.other.length === 0) {
    if (gapFields.has('modalities') && legacy) {
      add('info', 'gap-stated', '1.3', field('modalities').path, { label: field('modalities').label });
    } else add('error', 'no-modality', '1.3', field('modalities').path);
  }
  need('latest_data_collection', gi.latest_data_collection.date !== null, `${field('latest_data_collection').path}.date`);
  need('latest_data_collection', gi.latest_data_collection.continuous_training !== null, `${field('latest_data_collection').path}.continuous_training`);
  whereApplicable('linguistic_characteristics', filled(gi.linguistic_characteristics));
  whereApplicable('other_characteristics', filled(gi.other_characteristics));
  if (gi.latest_data_collection.continuous_training === true && summary.last_update !== null && addMonths(summary.last_update, 6) < asOf) {
    add('warning', 'update-due', '0', 'last_update', { name: summary.last_update });
  }

  const overview = new Set<string>([...present, ...(mods.other.length > 0 ? ['other'] : [])]);
  const checkModalities = (sectionNo: string, path: string, m: ModalitySelection): void => {
    for (const x of m.selected) if (!overview.has(x)) add('warning', 'modality-not-in-overview', sectionNo, path, { name: MODALITY_NAMES[x] ?? x });
    if (filled(m.other) && !overview.has('other')) add('warning', 'modality-not-in-overview', sectionNo, path, { name: 'Other' });
  };

  // 2.1
  const pd = ds.public_datasets;
  need('public_datasets_used', pd.used !== null);
  if (pd.used === true) {
    need('public_datasets_modalities', selectionFilled(pd.modalities));
    checkModalities('2.1', field('public_datasets_modalities').path, pd.modalities);
    if (pd.large_datasets.length === 0 && !filled(pd.other_datasets_description)) {
      if (gapFields.has('large_public_datasets') && legacy) {
        add('info', 'gap-stated', '2.1', field('large_public_datasets').path, { label: field('large_public_datasets').label });
      } else add('error', 'public-datasets-empty', '2.1', field('large_public_datasets').path);
    }
    pd.large_datasets.forEach((d, i) => {
      const p = `${field('large_public_datasets').path}[${i}]`;
      if (!filled(d.name)) add('error', 'large-dataset-name-missing', '2.1', `${p}.name`);
      else if (!filled(d.link) && !(filled(d.description) && d.collection_period.start !== null && d.collection_period.end !== null)) {
        add('error', 'large-dataset-incomplete', '2.1', p, { name: d.name });
      }
    });
  } else if (pd.used === false) {
    notAfterNo('public_datasets_modalities', selectionFilled(pd.modalities));
    notAfterNo('large_public_datasets', pd.large_datasets.length > 0);
    notAfterNo('other_public_datasets', filled(pd.other_datasets_description));
  }

  // 2.2.1
  const lic = ds.licensed_datasets;
  need('licensed_datasets_concluded', lic.concluded !== null);
  if (lic.concluded === true) {
    need('licensed_datasets_modalities', selectionFilled(lic.modalities));
    checkModalities('2.2.1', field('licensed_datasets_modalities').path, lic.modalities);
  } else if (lic.concluded === false) notAfterNo('licensed_datasets_modalities', selectionFilled(lic.modalities));

  // 2.2.2
  const op = ds.other_private_datasets;
  need('other_private_datasets_obtained', op.obtained !== null);
  if (op.obtained === true) {
    need('other_private_datasets_modalities', selectionFilled(op.modalities));
    checkModalities('2.2.2', field('other_private_datasets_modalities').path, op.modalities);
    if (op.publicly_known_datasets.length === 0 && !filled(op.non_publicly_known_description)) {
      if (gapFields.has('non_publicly_known_private_datasets') && legacy) {
        add('info', 'gap-stated', '2.2.2', field('non_publicly_known_private_datasets').path, { label: field('non_publicly_known_private_datasets').label });
      } else add('error', 'private-datasets-empty', '2.2.2', field('publicly_known_private_datasets').path);
    }
    op.publicly_known_datasets.forEach((d, i) => {
      if (!filled(d.name)) add('error', 'named-entry-missing', '2.2.2', `${field('publicly_known_private_datasets').path}[${i}].name`, { label: field('publicly_known_private_datasets').label });
    });
  } else if (op.obtained === false) {
    notAfterNo('other_private_datasets_modalities', selectionFilled(op.modalities));
    notAfterNo('publicly_known_private_datasets', op.publicly_known_datasets.length > 0);
    notAfterNo('non_publicly_known_private_datasets', filled(op.non_publicly_known_description));
  }

  // 2.3
  const cd = ds.crawled_data;
  need('crawlers_used', cd.crawlers_used !== null);
  if (cd.crawlers_used === true) {
    need('crawler_names', cd.crawler_names.length > 0);
    need('crawler_purposes', filled(cd.purposes));
    need('crawler_behaviour', filled(cd.crawler_behaviour));
    need('crawl_period', cd.collection_period.from !== null, `${field('crawl_period').path}.from`);
    need('crawl_period', cd.collection_period.to !== null, `${field('crawl_period').path}.to`);
    if (cd.collection_period.from !== null && cd.collection_period.to !== null && cd.collection_period.from > cd.collection_period.to) {
      add('error', 'period-order', '2.3', field('crawl_period').path, { name: cd.collection_period.from, detail: cd.collection_period.to });
    }
    need('crawled_content', filled(cd.content_description));
    need('crawled_modalities', selectionFilled(cd.modalities));
    checkModalities('2.3', field('crawled_modalities').path, cd.modalities);
    if (cd.top_domains.domains.length === 0 && !filled(cd.top_domains.access_information)) {
      if (gapFields.has('top_domains') && legacy) {
        add('info', 'gap-stated', '2.3', field('top_domains').path, { label: field('top_domains').label });
      } else add('error', 'top-domains-empty', '2.3', field('top_domains').path);
    }
  } else if (cd.crawlers_used === false) {
    notAfterNo('crawler_names', cd.crawler_names.length > 0);
    notAfterNo('crawler_purposes', filled(cd.purposes));
    notAfterNo('crawler_behaviour', filled(cd.crawler_behaviour));
    notAfterNo('crawl_period', cd.collection_period.from !== null || cd.collection_period.to !== null);
    notAfterNo('crawled_content', filled(cd.content_description));
    notAfterNo('crawled_modalities', selectionFilled(cd.modalities));
    notAfterNo('top_domains', cd.top_domains.domains.length > 0 || filled(cd.top_domains.access_information));
  }

  // 2.4
  const ud = ds.user_data;
  need('user_data_model_interactions', ud.from_model_interactions !== null);
  need('user_data_other_services', ud.from_other_services !== null);
  if (ud.from_other_services === true) need('user_data_services', filled(ud.services_description));
  else if (ud.from_other_services === false) notAfterNo('user_data_services', filled(ud.services_description));
  if (ud.from_model_interactions === true || ud.from_other_services === true) {
    need('user_data_modalities', selectionFilled(ud.modalities));
    checkModalities('2.4', field('user_data_modalities').path, ud.modalities);
  } else if (ud.from_model_interactions === false && ud.from_other_services === false) notAfterNo('user_data_modalities', selectionFilled(ud.modalities));

  // 2.5
  const sy = ds.synthetic_data;
  need('synthetic_data_created', sy.created !== null);
  if (sy.created === true) {
    need('synthetic_data_modalities', selectionFilled(sy.modalities));
    checkModalities('2.5', field('synthetic_data_modalities').path, sy.modalities);
    if (sy.market_models.length === 0 && !filled(sy.other_models_information)) {
      if ((gapFields.has('synthetic_market_models') || gapFields.has('synthetic_other_models')) && legacy) {
        const id = gapFields.has('synthetic_market_models') ? 'synthetic_market_models' : 'synthetic_other_models';
        add('info', 'gap-stated', '2.5', field(id).path, { label: field(id).label });
      } else add('error', 'synthetic-models-empty', '2.5', field('synthetic_market_models').path);
    }
    sy.market_models.forEach((m, i) => {
      if (!filled(m.name)) add('error', 'named-entry-missing', '2.5', `${field('synthetic_market_models').path}[${i}].name`, { label: field('synthetic_market_models').label });
    });
  } else if (sy.created === false) {
    notAfterNo('synthetic_data_modalities', selectionFilled(sy.modalities));
    notAfterNo('synthetic_market_models', sy.market_models.length > 0);
    notAfterNo('synthetic_other_models', filled(sy.other_models_information));
  }

  // 2.6
  const os = ds.other_sources;
  need('other_sources_used', os.used !== null);
  if (os.used === true) need('other_sources_description', filled(os.description));
  else if (os.used === false) notAfterNo('other_sources_description', filled(os.description));

  // 3.1, 3.2
  need('code_of_practice_signatory', dp.tdm_reservations.code_of_practice_signatory !== null);
  need('tdm_measures', filled(dp.tdm_reservations.measures));
  need('illegal_content_measures', filled(dp.illegal_content.measures));

  // Information gaps.
  const known = new Map<string, FieldSpec>(FIELDS.map((f) => [f.id, f]));
  summary.information_gaps.forEach((g, i) => {
    const f = known.get(g.field);
    const path = `information_gaps[${i}]`;
    if (f === undefined) {
      add('error', 'gap-unknown-field', '0', `${path}.field`, { name: g.field === '' ? '(empty)' : g.field });
      return;
    }
    if (!filled(g.justification)) add('error', 'gap-no-justification', f.section, `${path}.justification`, { label: f.label });
    if (f.requirement === 'optional') add('warning', 'gap-optional-field', f.section, `${path}.field`, { label: f.label });
    else if (!legacy) add('warning', 'gap-not-allowed', f.section, `${path}.field`, { label: f.label });
  });
  if (legacy) add('info', 'legacy-model', '1.2', field('placement_dates').path);

  // Cross-checks against an inventory.
  const inv = options.inventory;
  if (inv !== undefined) {
    if (pd.used !== false) {
      const listedNames = new Set(pd.large_datasets.map((d) => d.name.toLowerCase()));
      const listedLinks = new Set(pd.large_datasets.map((d) => d.link).filter((l) => l !== ''));
      for (const r of largeDatasets(inv.datasets)) {
        if (!r.determined) {
          add('warning', 'large-datasets-undetermined', '2.1', field('large_public_datasets').path, { name: r.modality });
          continue;
        }
        for (const l of r.large) {
          const d = inv.datasets.find((x) => x.id === l.id);
          if (d === undefined) continue;
          if (!listedNames.has(d.name.toLowerCase()) && !(d.link !== '' && listedLinks.has(d.link))) {
            add('error', 'large-dataset-not-listed', '2.1', field('large_public_datasets').path, { name: d.name, detail: r.modality });
          }
        }
      }
    }
    const report = inv.domain_report;
    if (report !== null && cd.crawlers_used !== false && cd.top_domains.domains.length > 0) {
      const listed = new Set(cd.top_domains.domains);
      for (const d of report.domains) {
        if (!listed.has(d.domain)) add('error', 'domain-not-listed', '2.3', field('top_domains').path, { name: d.domain, detail: String(d.rank) });
      }
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const sectionKey = (s: string): string => s.split('.').map((p) => p.padStart(3, '0')).join('.');
  issues.sort((a, b) => order[a.severity] - order[b.severity] || (sectionKey(a.section) < sectionKey(b.section) ? -1 : sectionKey(a.section) > sectionKey(b.section) ? 1 : 0));
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return { ok: errors === 0, errors, warnings, legacy_model: legacy, issues };
}
