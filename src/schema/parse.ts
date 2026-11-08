// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads a summary file (already parsed from YAML or JSON) into a typed
 * `Summary`. Every structural problem is collected; if there is any, a
 * `SchemaError` lists them all. Missing keys mean "not answered" and get
 * empty values; whether an answer is required is checked later by
 * `validateSummary`.
 *
 * Unknown keys are errors, so a misspelt key never silently drops an answer.
 */

import { CHECKBOX_MODALITIES, FORMAT_VERSION, SIZE_RANGES, type CheckboxModality, type StandardModality } from '../spec/template.js';
import { CONTROL_CHARS, HIDDEN_CHARS, DOMAIN_RE, MAX_DOMAINS_IN_SUMMARY, MAX_LINK, MAX_LIST, MAX_SHORT, MAX_TEXT, isIsoDate, isIsoMonth, isLink } from './checks.js';
import { trimOf } from '../util/trim.js';
import type {
  AuthorisedRepresentative,
  CollectionPeriod,
  CollectionPeriodOrUnknown,
  InformationGap,
  LargeDataset,
  ModalitySelection,
  ModelDependency,
  NamedLink,
  NotApplicableReason,
  OtherModalityRow,
  PlacementDate,
  PreviousVersion,
  StandardModalityRow,
  Summary,
  TextModalityRow,
  VersionedModel,
} from './types.js';

/** One structural problem in an input file. */
export interface SchemaIssue {
  /** Dotted path, e.g. "data_sources.public_datasets.large_datasets[0].link". */
  path: string;
  code: SchemaIssueCode;
  message: string;
}

export const SCHEMA_MESSAGES = {
  'not-object': 'Expected a mapping of keys to values.',
  'not-list': 'Expected a list.',
  'not-string': 'Expected text. Put values such as version numbers in quotes.',
  'not-boolean': 'Expected true or false.',
  'unknown-key': 'Unknown key. Check the spelling against the template mapping.',
  'too-long': 'The text is too long.',
  'too-many': 'The list has too many entries.',
  'control-character': 'The text contains control characters.',
  'hidden-character': 'The text contains invisible or bidirectional formatting characters.',
  'lone-surrogate': 'The text contains an unpaired surrogate (invalid Unicode).',
  'bad-date': 'Expected a date as YYYY-MM-DD.',
  'bad-month': 'Expected a month as YYYY-MM.',
  'bad-month-or-unknown': 'Expected a month as YYYY-MM or the words "not known".',
  'bad-link': 'Expected an http or https link without spaces (use the xn-- form for international domain names).',
  'bad-domain': 'Expected a domain name in lower case, such as example.com.',
  'bad-choice': 'This value is not one of the allowed choices.',
  'duplicate': 'This value is listed twice.',
  'bad-version': `The "sourcebook" key must be ${FORMAT_VERSION}.`,
} as const;

export type SchemaIssueCode = keyof typeof SCHEMA_MESSAGES;

/** Raised when an input file does not have the expected structure. */
export class SchemaError extends Error {
  readonly issues: SchemaIssue[];
  constructor(issues: SchemaIssue[]) {
    super(`The file has ${issues.length} structural problem${issues.length === 1 ? '' : 's'}.`);
    this.name = 'SchemaError';
    this.issues = issues;
  }
}

type Obj = Record<string, unknown>;

/** An unpaired UTF-16 surrogate (possible in JSON input such as "\ud800"). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** A small reader that records issues instead of throwing. */
export class Reader {
  readonly issues: SchemaIssue[] = [];

  issue(path: string, code: SchemaIssueCode): void {
    this.issues.push({ path, code, message: SCHEMA_MESSAGES[code] });
  }

  /** Returns the mapping at `path`, or an empty one (with an issue) when the value is not a mapping. */
  obj(value: unknown, path: string, keys: readonly string[]): Obj {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.issue(path, 'not-object');
      return {};
    }
    const o = value as Obj;
    for (const k of Object.keys(o)) if (!keys.includes(k)) this.issue(join(path, k), 'unknown-key');
    const out: Obj = {};
    for (const k of keys) if (Object.hasOwn(o, k)) out[k] = o[k];
    return out;
  }

  list(value: unknown, path: string, max = MAX_LIST): unknown[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      this.issue(path, 'not-list');
      return [];
    }
    if (value.length > max) {
      this.issue(path, 'too-many');
      return value.slice(0, max) as unknown[];
    }
    return value as unknown[];
  }

  /** Text, trimmed. Numbers are not accepted: YAML reads `1.0` as the number 1. */
  text(value: unknown, path: string, max = MAX_TEXT): string {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
      this.issue(path, 'not-string');
      return '';
    }
    const s = value;
    if (s.length > max) {
      this.issue(path, 'too-long');
      return '';
    }
    if (CONTROL_CHARS.test(s.replace(/\r\n/g, '\n'))) {
      this.issue(path, 'control-character');
      return '';
    }
    if (HIDDEN_CHARS.test(s)) {
      this.issue(path, 'hidden-character');
      return '';
    }
    if (LONE_SURROGATE.test(s)) {
      this.issue(path, 'lone-surrogate');
      return '';
    }
    return trimSpace(s.replace(/\r\n/g, '\n'));
  }

  short(value: unknown, path: string): string {
    const s = this.text(value, path, MAX_SHORT);
    if (s.includes('\n')) {
      this.issue(path, 'control-character');
      return '';
    }
    return s;
  }

  bool(value: unknown, path: string): boolean | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value;
    this.issue(path, 'not-boolean');
    return null;
  }

  link(value: unknown, path: string): string {
    const s = this.text(value, path, MAX_LINK);
    if (s === '') return '';
    if (!isLink(s)) {
      this.issue(path, 'bad-link');
      return '';
    }
    return s;
  }

  date(value: unknown, path: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !isIsoDate(value)) {
      this.issue(path, 'bad-date');
      return null;
    }
    return value;
  }

  month(value: unknown, path: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !isIsoMonth(value)) {
      this.issue(path, 'bad-month');
      return null;
    }
    return value;
  }

  choice<T extends string>(value: unknown, path: string, choices: readonly T[]): T | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string' && (choices as readonly string[]).includes(value)) return value as T;
    this.issue(path, 'bad-choice');
    return null;
  }
}

/** White space that remains allowed after the control and hidden character checks. */
const SPACE_CHARS = '\t\n \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000';

/** Trims the white space characters that remain allowed after the control and hidden character checks. */
export function trimSpace(s: string): string {
  return trimOf(s, SPACE_CHARS);
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function at(path: string, i: number): string {
  return `${path}[${i}]`;
}

function modalitySelection(r: Reader, value: unknown, path: string): ModalitySelection {
  const o = r.obj(value, path, ['selected', 'other']);
  const selected: CheckboxModality[] = [];
  r.list(o.selected, join(path, 'selected'), CHECKBOX_MODALITIES.length + 1).forEach((v, i) => {
    const c = r.choice(v, at(join(path, 'selected'), i), CHECKBOX_MODALITIES);
    if (c === null) return;
    if (selected.includes(c)) r.issue(at(join(path, 'selected'), i), 'duplicate');
    else selected.push(c);
  });
  // Keep the template's order: Text, Image, Video, Audio.
  selected.sort((a, b) => CHECKBOX_MODALITIES.indexOf(a) - CHECKBOX_MODALITIES.indexOf(b));
  return { selected, other: r.short(o.other, join(path, 'other')) };
}

function namedLinks(r: Reader, value: unknown, path: string, linkKey: 'link' | 'summary_link'): { name: string; link: string }[] {
  return r.list(value, path).map((v, i) => {
    const p = at(path, i);
    const o = r.obj(v, p, ['name', linkKey]);
    return { name: r.short(o.name, join(p, 'name')), link: r.link(o[linkKey], join(p, linkKey)) };
  });
}

function standardRow(r: Reader, value: unknown, path: string, modality: StandardModality): StandardModalityRow {
  const o = r.obj(value, path, ['present', 'size_range', 'types_of_content']);
  return {
    present: r.bool(o.present, join(path, 'present')),
    size_range: r.choice(o.size_range, join(path, 'size_range'), SIZE_RANGES[modality].map((x) => x.id)),
    types_of_content: r.text(o.types_of_content, join(path, 'types_of_content')),
  };
}

function textRow(r: Reader, value: unknown, path: string): TextModalityRow {
  const o = r.obj(value, path, ['present', 'size_range', 'size_other_unit', 'types_of_content']);
  return {
    present: r.bool(o.present, join(path, 'present')),
    size_range: r.choice(o.size_range, join(path, 'size_range'), SIZE_RANGES.text.map((x) => x.id)),
    size_other_unit: r.short(o.size_other_unit, join(path, 'size_other_unit')),
    types_of_content: r.text(o.types_of_content, join(path, 'types_of_content')),
  };
}

function monthOrUnknown(r: Reader, value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'not known') return 'not known';
  if (typeof value !== 'string' || !isIsoMonth(value)) {
    r.issue(path, 'bad-month-or-unknown');
    return null;
  }
  return value;
}

/**
 * Converts parsed YAML or JSON into a `Summary`.
 *
 * @throws SchemaError listing every structural problem.
 */
export function parseSummary(data: unknown): Summary {
  const r = new Reader();
  const top = r.obj(data, '', ['sourcebook', 'summary_version', 'last_update', 'general_information', 'data_sources', 'data_processing', 'information_gaps']);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SchemaError(r.issues.length > 0 ? r.issues : [{ path: '', code: 'not-object', message: SCHEMA_MESSAGES['not-object'] }]);
  if (top.sourcebook !== FORMAT_VERSION) r.issue('sourcebook', 'bad-version');

  const sv = r.obj(top.summary_version, 'summary_version', ['version', 'previous_versions']);
  const previous: PreviousVersion[] = r.list(sv.previous_versions, 'summary_version.previous_versions').map((v, i) => {
    const p = at('summary_version.previous_versions', i);
    const o = r.obj(v, p, ['version', 'link']);
    return { version: r.short(o.version, join(p, 'version')), link: r.link(o.link, join(p, 'link')) };
  });

  // 1. General information
  const G = 'general_information';
  const gi = r.obj(top.general_information, G, ['provider', 'model', 'modalities', 'latest_data_collection', 'linguistic_characteristics', 'other_characteristics', 'additional_comments']);
  const pv = r.obj(gi.provider, `${G}.provider`, ['name_and_contact_details', 'authorised_representative']);
  const arPath = `${G}.provider.authorised_representative`;
  const ar = r.obj(pv.authorised_representative, arPath, ['applicable', 'name_and_contact_details', 'not_applicable_reason']);
  const authorised: AuthorisedRepresentative = {
    applicable: r.bool(ar.applicable, join(arPath, 'applicable')),
    name_and_contact_details: r.text(ar.name_and_contact_details, join(arPath, 'name_and_contact_details')),
    not_applicable_reason: r.choice<NotApplicableReason>(ar.not_applicable_reason, join(arPath, 'not_applicable_reason'), ['established_in_union', 'open_source_exemption']),
  };
  const md = r.obj(gi.model, `${G}.model`, ['versioned_model_names', 'model_dependencies', 'placement_dates']);
  const vmPath = `${G}.model.versioned_model_names`;
  const versioned: VersionedModel[] = r.list(md.versioned_model_names, vmPath).map((v, i) => {
    const p = at(vmPath, i);
    const o = r.obj(v, p, ['name', 'documentation_links']);
    return {
      name: r.short(o.name, join(p, 'name')),
      documentation_links: r.list(o.documentation_links, join(p, 'documentation_links'), 100).map((l, j) => r.link(l, at(join(p, 'documentation_links'), j))).filter((l) => l !== ''),
    };
  });
  const depPath = `${G}.model.model_dependencies`;
  const dep = r.obj(md.model_dependencies, depPath, ['is_modification', 'models']);
  const depModels: ModelDependency[] = namedLinks(r, dep.models, join(depPath, 'models'), 'summary_link').map((x) => ({ name: x.name, summary_link: x.link }));
  const pdPath = `${G}.model.placement_dates`;
  const placement: PlacementDate[] = r.list(md.placement_dates, pdPath).map((v, i) => {
    const p = at(pdPath, i);
    const o = r.obj(v, p, ['model', 'date']);
    return { model: r.short(o.model, join(p, 'model')), date: r.date(o.date, join(p, 'date')) };
  });
  const mPath = `${G}.modalities`;
  const mo = r.obj(gi.modalities, mPath, ['text', 'image', 'audio', 'video', 'other']);
  const other: OtherModalityRow[] = r.list(mo.other, join(mPath, 'other'), 100).map((v, i) => {
    const p = at(join(mPath, 'other'), i);
    const o = r.obj(v, p, ['modality', 'approximate_size', 'types_of_content']);
    return {
      modality: r.short(o.modality, join(p, 'modality')),
      approximate_size: r.short(o.approximate_size, join(p, 'approximate_size')),
      types_of_content: r.text(o.types_of_content, join(p, 'types_of_content')),
    };
  });
  const ldPath = `${G}.latest_data_collection`;
  const ld = r.obj(gi.latest_data_collection, ldPath, ['date', 'continuous_training']);

  // 2. List of data sources
  const D = 'data_sources';
  const ds = r.obj(top.data_sources, D, ['public_datasets', 'licensed_datasets', 'other_private_datasets', 'crawled_data', 'user_data', 'synthetic_data', 'other_sources']);
  const pdsPath = `${D}.public_datasets`;
  const pds = r.obj(ds.public_datasets, pdsPath, ['used', 'modalities', 'large_datasets', 'other_datasets_description', 'additional_comments']);
  const large: LargeDataset[] = r.list(pds.large_datasets, join(pdsPath, 'large_datasets')).map((v, i) => {
    const p = at(join(pdsPath, 'large_datasets'), i);
    const o = r.obj(v, p, ['name', 'link', 'description', 'collection_period', 'selection_approach']);
    const cp = r.obj(o.collection_period, join(p, 'collection_period'), ['start', 'end']);
    const period: CollectionPeriodOrUnknown = {
      start: monthOrUnknown(r, cp.start, join(p, 'collection_period.start')),
      end: monthOrUnknown(r, cp.end, join(p, 'collection_period.end')),
    };
    return {
      name: r.short(o.name, join(p, 'name')),
      link: r.link(o.link, join(p, 'link')),
      description: r.text(o.description, join(p, 'description')),
      collection_period: period,
      selection_approach: r.text(o.selection_approach, join(p, 'selection_approach')),
    };
  });
  const licPath = `${D}.licensed_datasets`;
  const lic = r.obj(ds.licensed_datasets, licPath, ['concluded', 'modalities']);
  const oprPath = `${D}.other_private_datasets`;
  const opr = r.obj(ds.other_private_datasets, oprPath, ['obtained', 'modalities', 'publicly_known_datasets', 'non_publicly_known_description', 'additional_comments']);
  const known: NamedLink[] = namedLinks(r, opr.publicly_known_datasets, join(oprPath, 'publicly_known_datasets'), 'link');
  const crPath = `${D}.crawled_data`;
  const cr = r.obj(ds.crawled_data, crPath, [
    'crawlers_used',
    'crawler_names',
    'purposes',
    'crawler_behaviour',
    'collection_period',
    'content_description',
    'modalities',
    'top_domains',
    'additional_comments',
  ]);
  const crp = r.obj(cr.collection_period, join(crPath, 'collection_period'), ['from', 'to']);
  const crawlPeriod: CollectionPeriod = { from: r.month(crp.from, join(crPath, 'collection_period.from')), to: r.month(crp.to, join(crPath, 'collection_period.to')) };
  const td = r.obj(cr.top_domains, join(crPath, 'top_domains'), ['domains', 'access_information']);
  const domainsPath = join(crPath, 'top_domains.domains');
  const seen = new Set<string>();
  const domains: string[] = [];
  r.list(td.domains, domainsPath, MAX_DOMAINS_IN_SUMMARY).forEach((v, i) => {
    const s = r.short(v, at(domainsPath, i));
    if (s === '') return;
    if (!DOMAIN_RE.test(s)) r.issue(at(domainsPath, i), 'bad-domain');
    else if (seen.has(s)) r.issue(at(domainsPath, i), 'duplicate');
    else {
      seen.add(s);
      domains.push(s);
    }
  });
  const udPath = `${D}.user_data`;
  const ud = r.obj(ds.user_data, udPath, ['from_model_interactions', 'from_other_services', 'services_description', 'modalities', 'additional_comments']);
  const syPath = `${D}.synthetic_data`;
  const sy = r.obj(ds.synthetic_data, syPath, ['created', 'modalities', 'market_models', 'other_models_information', 'additional_comments']);
  const osPath = `${D}.other_sources`;
  const os = r.obj(ds.other_sources, osPath, ['used', 'description', 'additional_comments']);

  // 3. Data processing aspects
  const P = 'data_processing';
  const dp = r.obj(top.data_processing, P, ['tdm_reservations', 'illegal_content', 'other_information']);
  const tdm = r.obj(dp.tdm_reservations, `${P}.tdm_reservations`, ['code_of_practice_signatory', 'measures', 'additional_comments']);
  const ill = r.obj(dp.illegal_content, `${P}.illegal_content`, ['measures']);

  const gaps: InformationGap[] = r.list(top.information_gaps, 'information_gaps').map((v, i) => {
    const p = at('information_gaps', i);
    const o = r.obj(v, p, ['field', 'justification']);
    return { field: r.short(o.field, join(p, 'field')), justification: r.text(o.justification, join(p, 'justification')) };
  });

  const summary: Summary = {
    sourcebook: 1,
    summary_version: { version: r.short(sv.version, 'summary_version.version'), previous_versions: previous },
    last_update: r.date(top.last_update, 'last_update'),
    general_information: {
      provider: { name_and_contact_details: r.text(pv.name_and_contact_details, `${G}.provider.name_and_contact_details`), authorised_representative: authorised },
      model: {
        versioned_model_names: versioned,
        model_dependencies: { is_modification: r.bool(dep.is_modification, join(depPath, 'is_modification')), models: depModels },
        placement_dates: placement,
      },
      modalities: {
        text: textRow(r, mo.text, join(mPath, 'text')),
        image: standardRow(r, mo.image, join(mPath, 'image'), 'image'),
        audio: standardRow(r, mo.audio, join(mPath, 'audio'), 'audio'),
        video: standardRow(r, mo.video, join(mPath, 'video'), 'video'),
        other,
      },
      latest_data_collection: { date: r.month(ld.date, join(ldPath, 'date')), continuous_training: r.bool(ld.continuous_training, join(ldPath, 'continuous_training')) },
      linguistic_characteristics: r.text(gi.linguistic_characteristics, `${G}.linguistic_characteristics`),
      other_characteristics: r.text(gi.other_characteristics, `${G}.other_characteristics`),
      additional_comments: r.text(gi.additional_comments, `${G}.additional_comments`),
    },
    data_sources: {
      public_datasets: {
        used: r.bool(pds.used, join(pdsPath, 'used')),
        modalities: modalitySelection(r, pds.modalities, join(pdsPath, 'modalities')),
        large_datasets: large,
        other_datasets_description: r.text(pds.other_datasets_description, join(pdsPath, 'other_datasets_description')),
        additional_comments: r.text(pds.additional_comments, join(pdsPath, 'additional_comments')),
      },
      licensed_datasets: { concluded: r.bool(lic.concluded, join(licPath, 'concluded')), modalities: modalitySelection(r, lic.modalities, join(licPath, 'modalities')) },
      other_private_datasets: {
        obtained: r.bool(opr.obtained, join(oprPath, 'obtained')),
        modalities: modalitySelection(r, opr.modalities, join(oprPath, 'modalities')),
        publicly_known_datasets: known,
        non_publicly_known_description: r.text(opr.non_publicly_known_description, join(oprPath, 'non_publicly_known_description')),
        additional_comments: r.text(opr.additional_comments, join(oprPath, 'additional_comments')),
      },
      crawled_data: {
        crawlers_used: r.bool(cr.crawlers_used, join(crPath, 'crawlers_used')),
        crawler_names: r.list(cr.crawler_names, join(crPath, 'crawler_names'), 1000).map((v, i) => r.short(v, at(join(crPath, 'crawler_names'), i))).filter((s) => s !== ''),
        purposes: r.text(cr.purposes, join(crPath, 'purposes')),
        crawler_behaviour: r.text(cr.crawler_behaviour, join(crPath, 'crawler_behaviour')),
        collection_period: crawlPeriod,
        content_description: r.text(cr.content_description, join(crPath, 'content_description')),
        modalities: modalitySelection(r, cr.modalities, join(crPath, 'modalities')),
        top_domains: { domains, access_information: r.text(td.access_information, join(crPath, 'top_domains.access_information')) },
        additional_comments: r.text(cr.additional_comments, join(crPath, 'additional_comments')),
      },
      user_data: {
        from_model_interactions: r.bool(ud.from_model_interactions, join(udPath, 'from_model_interactions')),
        from_other_services: r.bool(ud.from_other_services, join(udPath, 'from_other_services')),
        services_description: r.text(ud.services_description, join(udPath, 'services_description')),
        modalities: modalitySelection(r, ud.modalities, join(udPath, 'modalities')),
        additional_comments: r.text(ud.additional_comments, join(udPath, 'additional_comments')),
      },
      synthetic_data: {
        created: r.bool(sy.created, join(syPath, 'created')),
        modalities: modalitySelection(r, sy.modalities, join(syPath, 'modalities')),
        market_models: namedLinks(r, sy.market_models, join(syPath, 'market_models'), 'summary_link').map((x) => ({ name: x.name, summary_link: x.link })),
        other_models_information: r.text(sy.other_models_information, join(syPath, 'other_models_information')),
        additional_comments: r.text(sy.additional_comments, join(syPath, 'additional_comments')),
      },
      other_sources: {
        used: r.bool(os.used, join(osPath, 'used')),
        description: r.text(os.description, join(osPath, 'description')),
        additional_comments: r.text(os.additional_comments, join(osPath, 'additional_comments')),
      },
    },
    data_processing: {
      tdm_reservations: {
        code_of_practice_signatory: r.bool(tdm.code_of_practice_signatory, `${P}.tdm_reservations.code_of_practice_signatory`),
        measures: r.text(tdm.measures, `${P}.tdm_reservations.measures`),
        additional_comments: r.text(tdm.additional_comments, `${P}.tdm_reservations.additional_comments`),
      },
      illegal_content: { measures: r.text(ill.measures, `${P}.illegal_content.measures`) },
      other_information: r.text(dp.other_information, `${P}.other_information`),
    },
    information_gaps: gaps,
  };
  if (r.issues.length > 0) throw new SchemaError(r.issues);
  return summary;
}
