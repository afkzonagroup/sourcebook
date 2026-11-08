// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sourcebook: draw up the public summary of the content used to train a
 * general-purpose AI model (Article 53(1)(d) of Regulation (EU) 2024/1689),
 * in the AI Office template.
 *
 * @packageDocumentation
 */

export { TEMPLATE, SECTIONS, FIELDS, SIZE_RANGES, KEY_DATES, FORMAT_VERSION, field, section } from './spec/template.js';
export type { FieldSpec, SectionSpec, Requirement, StandardModality, CheckboxModality } from './spec/template.js';
export type * from './schema/types.js';
export { parseSummary, SchemaError, SCHEMA_MESSAGES } from './schema/parse.js';
export type { SchemaIssue, SchemaIssueCode } from './schema/parse.js';
export { parseSummaryText, parseJsonSafe, JsonInputError } from './schema/load.js';
export { emptySummary } from './schema/empty.js';
export { parseYaml, splitFrontMatter, YamlError, YAML_ERRORS, DEFAULT_YAML_LIMITS } from './yaml/parse.js';
export type { YamlValue, YamlMap, YamlLimits, FrontMatter } from './yaml/parse.js';
export { summaryToYaml } from './yaml/emit.js';
export { validateSummary } from './validate/validate.js';
export type { ValidationIssue, ValidationResult, ValidateOptions, Severity } from './validate/validate.js';
export { MESSAGES } from './validate/messages.js';
export { renderMarkdown, escapeInline, escapeText } from './render/markdown.js';
export { renderHtml, escapeHtml } from './render/html.js';
export type { HtmlOptions } from './render/html.js';
export { renderJson, summaryToJson } from './render/json.js';
export { modelCardSnippet, insertIntoModelCard, MODEL_CARD_START, MODEL_CARD_END } from './render/model-card.js';
export { buildDocument } from './render/document.js';
export {
  newInventory,
  mergeInventories,
  parseInventory,
  prefillSummary,
  largeDatasets,
  sizeRangeFor,
  CATEGORIES,
} from './collect/inventory.js';
export type { Inventory, InventoryDataset, DatasetSize, DatasetCategory, LargeDatasetResult, PrefillHints } from './collect/inventory.js';
export { datasetFromHfCard, isRepoId } from './collect/hf-card.js';
export { fetchHubDataset, HubError, isAllowedUrl, isRevision, HUB_ORIGIN } from './collect/hf-hub.js';
export type { HubOptions, HubDataset } from './collect/hf-hub.js';
export { datasetsFromJsonManifest, datasetsFromCsvManifest, parseParquetFooter, parquetFooterLength, datasetFromParquet, ParquetError } from './collect/manifest.js';
export type { ParquetFacts } from './collect/manifest.js';
export { DomainRanker, LimitError, requiredCount, selectTop, sharePercent, DEFAULT_RANK_OPTIONS } from './domains/rank.js';
export type { CrawlRecord, RankOptions, DomainReport, RankedDomain, DomainGroup, TieRule, ModalityMode } from './domains/rank.js';
export { readWarc, readCdx, readCdxj, readCsv, readCsvRows, hostOfSurt, modalityOfMime, CrawlLogError, DEFAULT_READER_LIMITS } from './domains/readers.js';
export type { ReaderLimits, CsvColumns, FilterCounts } from './domains/readers.js';
export { hostOfUrl, checkHost, normaliseHost, punycodeEncode } from './domains/host.js';
export { parsePublicSuffixList, bundledPublicSuffixList, registrableDomain, publicSuffix } from './domains/psl.js';
export type { PublicSuffixList } from './domains/psl.js';
export { VERSION, ATTRIBUTION, ATTRIBUTION_URL, GENERATOR } from './version.js';
