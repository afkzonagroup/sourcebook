// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Writes the shared test vectors (test-vectors/*.json) and crawl-log
// fixtures from the built TypeScript package. The TypeScript and Python test
// suites both check their results against these files.
//
// Run: npm run build && node scripts/generate-vectors.mjs
// Review the diff before committing: a changed vector is a changed result.

import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import * as sb from '../dist/index.js';
import { isLink } from '../dist/schema/checks.js';

const root = new URL('../', import.meta.url);
// Invisible and bidirectional characters are written as \\u escapes, so that no tracked file contains them raw.
const escapeHidden = (text) => text.replace(/[\u0080-\u009f\u00a0\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const out = (name, data) => writeFileSync(new URL(`test-vectors/${name}`, root), escapeHidden(`${JSON.stringify(data, null, 2)}\n`));
const fixture = (name) => new URL(`test/fixtures/${name}`, root);

// ---------------------------------------------------------------- YAML
const yamlCases = [
  ['mapping', 'a: 1\nb: two\nc: true\nd: null\ne: ~\nf:\n'],
  ['core-schema-strings', 'lang: [no, yes, on, off, y, n]\nversion: 1.0\nhex: 0x1F\noct: 0o17\nneg: -12\nexp: 1e3\nstr: "1.0"\n'],
  ['big-int', 'n: 123456789012345678901234567890\n'],
  ['block-seq-same-indent', 'language:\n- en\n- fr\nnext: x\n'],
  ['nested-compact', 'configs:\n  - config_name: default\n    data_files:\n      - split: train\n        path: data/*\n  - - nested\n    - list\n'],
  ['quoted', 'a: "tab\\there \\u00e9 \\x41 quote\\" backslash\\\\"\nb: \'it\'\'s\'\nc: "line one\n  line two\n\n  line three"\nd: \'folded\n  single\'\n'],
  ['escaped-break', 'a: "abc\\\n  def"\n'],
  ['block-literal', 'a: |\n  line 1\n    indented\n\n  line 3\nb: |-\n  stripped\nc: |+\n  kept\n\nd: x\n'],
  ['block-folded', 'a: >\n  one\n  two\n\n  three\n    more\n  four\n'],
  ['block-indicator', 'a: |2\n    two extra\n  base\n'],
  ['plain-multiline', 'a: one\n  two\n\n  three\nb: x\n'],
  ['flow', 'a: [1, "two", three, {k: v, q: "x"}, [nested]]\nb: {url: http://example.com/a, empty: , n: 5}\nc: []\nd: {}\n'],
  ['flow-multiline', 'a: [one,\n  two, # comment\n  three]\n'],
  ['comments', '# top\na: 1 # trailing\n# middle\nb: "x # not a comment"\nc: x#y\n'],
  ['document-markers', '---\na: 1\n...\n'],
  ['urls-and-colons', 'url: https://huggingface.co/datasets/x\ntime: 12:30\nwin: C:\\path\n'],
  ['bom-crlf', '\ufeffa: 1\r\nb: 2\r\n'],
  ['top-level-list', '- 1\n- 2\n'],
  ['empty', ''],
  ['norway', 'language:\n  - "no"\n  - no\n  - nb\n'],
  ['unicode', 'name: "Ελληνικά 中文 ‘quotes’"\nplain: Žemaitija\n'],
  ['key-quoted', '"a b": 1\n\'c: d\': 2\n'],
  ['err-anchor', 'a: &x 1\nb: *x\n'],
  ['err-alias', 'a: 1\nb: *x\n'],
  ['err-anchor-in-flow', 'a: [&x 1, 2]\n'],
  ['err-alias-in-flow', 'a: {k: *x}\n'],
  ['err-tag-in-flow', 'a: [!!str 1]\n'],
  ['err-tag', 'a: !!python/object:os.system x\n'],
  ['err-merge', 'base: {a: 1}\nderived:\n  <<: {a: 2}\n'],
  ['err-complex-key', '? a\n: b\n'],
  ['err-duplicate', 'a: 1\na: 2\n'],
  ['err-proto', '__proto__: {polluted: true}\n'],
  ['err-constructor', 'a:\n  constructor: x\n'],
  ['err-proto-flow', 'a: {__proto__: 1}\n'],
  ['err-tab-indent', 'a:\n\tb: 1\n'],
  ['err-control', 'a: "x\u0007"\n'],
  ['err-bad-indent', 'a: 1\n  b: 2\n'],
  ['err-mapping-in-scalar', 'a: b: c\n'],
  ['err-two-documents', 'a: 1\n---\nb: 2\n'],
  ['err-directive', '%YAML 1.2\n---\na: 1\n'],
  ['err-unterminated-string', 'a: "abc\n'],
  ['err-unterminated-flow', 'a: [1, 2\n'],
  ['err-bad-escape', 'a: "\\q"\n'],
  ['err-surrogate-escape', 'a: "\\ud800"\n'],
  ['err-inf', 'a: .inf\n'],
  ['err-nan', 'a: .NaN\n'],
  ['err-huge-float', 'a: 1e400\n'],
  ['err-empty-flow-entry', 'a: [1,,2]\n'],
  ['err-flow-pair', 'a: [k: v]\n'],
  ['err-bad-block-header', 'a: |x\n  t\n'],
  ['err-lone-cr', 'a: 1\rb: 2\n'],
  ['err-reserved', 'a: @x\n'],
];
const yamlVectors = yamlCases.map(([name, input]) => {
  try {
    return { name, input, expect: sb.parseYaml(input) };
  } catch (e) {
    return { name, input, error: e.code, line: e.line };
  }
});
// Limits: depth and node count (the same limits are used in Python).
const deep = `${Array.from({ length: 70 }, (_, i) => `${'  '.repeat(i)}k:`).join('\n')} 1\n`;
const many = `list: [${Array.from({ length: 300 }, (_, i) => i).join(', ')}]\n`;
for (const [name, input, limits] of [
  ['limit-depth', deep, sb.DEFAULT_YAML_LIMITS],
  ['limit-nodes', many, { maxDepth: 64, maxNodes: 100, maxScalarLength: 1000 }],
  ['limit-scalar', `a: ${'x'.repeat(2000)}\n`, { maxDepth: 64, maxNodes: 1000, maxScalarLength: 1000 }],
]) {
  try {
    yamlVectors.push({ name, input, limits, expect: sb.parseYaml(input, limits) });
  } catch (e) {
    yamlVectors.push({ name, input, limits, error: e.code, line: e.line });
  }
}
out('yaml.json', yamlVectors);

// ---------------------------------------------------------------- Hosts
const urlCases = [
  'https://www.Example.COM/path?q=1#f',
  'http://user:pass@news.bbc.co.uk:8080/x',
  'HTTPS://Example.org.',
  'https://bücher.example/',
  'https://xn--bcher-kva.example/',
  'https://例え.テスト/',
  'https://ÉCOLE.fr/',
  'https://straße.de/',
  'https://ﬁle.example/',
  'https://a。b。example/',
  'https://192.168.0.1/',
  'https://0x7f.0.0.1/',
  'https://[::1]/',
  'https://example.com:99999/',
  'https://example.com:/x',
  'ftp://example.com/file',
  'mailto:someone@example.com',
  'dns:example.com',
  'example.com/no-scheme',
  '',
  'https://',
  'https://exa mple.com/',
  'https://exa%6dple.com/',
  'https://-weird-.example.com/',
  'https://under_score.example.com/',
  'https://a..b.com/',
  `https://${'a'.repeat(64)}.com/`,
  `https://${'a.'.repeat(130)}com/`,
  'https://emoji\u{1F600}.com/',
  'https://localhost/',
  // Added in the independent review: compatibility characters, dotted capital I, Kelvin sign, user info.
  'https://\uff21\uff22.example/',
  'https://\u2160.example/',
  'https://\u0130stanbul.com.tr/',
  'https://\u212a.example/',
  'https://a@b@c.example.com/',
  'https://a.com../',
  'https://www.city.kawasaki.jp/',
];
const hostVectors = {
  urls: urlCases.map((input) => ({ input, expect: sb.hostOfUrl(input) })),
  punycode: ['bücher', 'münchen', 'ελληνικά', '中文', 'españa', 'ü', 'abc', 'straße', 'ⓐ', '3年b組金八先生'].map((input) => ({ input, expect: sb.punycodeEncode(input) })),
  required_count: [0, 1, 5, 9, 10, 11, 19, 20, 21, 99, 100, 101, 19999, 20000, 20001, 30000, 1000000].flatMap((n) => [false, true].map((sme) => ({ n, sme, expect: sb.requiredCount(n, sme) }))),
  share: [
    ['1', '3'],
    ['2', '3'],
    ['0', '5'],
    ['5', '5'],
    ['123456789012345678901234567890', '987654321098765432109876543210'],
    ['7', '0'],
  ].map(([size, total]) => ({ size, total, expect: sb.sharePercent(BigInt(size), BigInt(total)) })),
  // Links (isLink), with characters on which JavaScript's and Python's \s differ.
  links: [
    'https://example.org/a?b=c#d',
    'http://example.org',
    'https://example.org:8080/x',
    'https://example.org:65536/x',
    'javascript:alert(1)',
    'https://example.org/a b',
    'https://example.org/a\u0085b',
    'https://example.org/a\u00a0b',
    'https://example.org/a\ufeffb',
    'https://example.org/a\u202eb',
    'https://example.org/a\u2003b',
    'https://example.org/a\u001fb',
    'https://example.org/caf\u00e9',
    'https://example.org/a>b',
  ].map((input) => ({ input, expect: isLink(input) })),
  surt: ['com,example,www)/path', 'uk,co,bbc)/news', 'com,example:8080)/x', 'http://(com,example,)/', 'nonsense', ')/x'].map((input) => ({ input, expect: sb.hostOfSurt(input) })),
};
out('hosts.json', hostVectors);

// ---------------------------------------------------------------- Ranking
const r = (url, size, extra = {}) => ({ url, size: String(size), ...extra });
const rankingCases = [
  {
    name: 'top-10-percent-rounds-up',
    options: {},
    records: Array.from({ length: 25 }, (_, i) => r(`https://www.site${String(i).padStart(2, '0')}.com/`, 1000 - i * 10)),
  },
  {
    name: 'ties-included-at-cutoff',
    options: {},
    records: [r('https://a.org/', 100), r('https://b.org/', 50), r('https://c.org/', 50), ...Array.from({ length: 17 }, (_, i) => r(`https://filler${i}.org/`, 10))],
  },
  {
    name: 'ties-cut-alphabetical',
    options: { ties: 'cut' },
    records: [r('https://a.org/', 100), r('https://c.org/', 50), r('https://b.org/', 50), ...Array.from({ length: 17 }, (_, i) => r(`https://filler${i}.org/`, 10))],
  },
  {
    name: 'all-tied',
    options: {},
    records: Array.from({ length: 12 }, (_, i) => r(`https://same${i}.net/`, 7)),
  },
  {
    name: 'sme-five-percent',
    options: { sme: true },
    records: Array.from({ length: 100 }, (_, i) => r(`https://d${String(i).padStart(3, '0')}.eu/`, 10_000 - i)),
  },
  {
    name: 'not-sme-same-input',
    options: { sme: false },
    records: Array.from({ length: 100 }, (_, i) => r(`https://d${String(i).padStart(3, '0')}.eu/`, 10_000 - i)),
  },
  {
    name: 'registrable-domain-grouping',
    options: {},
    records: [
      r('https://news.bbc.co.uk/1', 300),
      r('https://www.bbc.co.uk/2', 300),
      r('https://bbc.co.uk/3', 1),
      r('https://alice.github.io/a', 500),
      r('https://bob.github.io/b', 500),
      r('https://www.gov.uk/x', 50),
      r('https://bücher.de/x', 40),
      r('https://xn--bcher-kva.de/y', 40),
      r('https://192.168.1.1/', 9999),
      r('https://[2001:db8::1]/', 9999),
      r('ftp://files.example.com/a', 9999),
      r('not a url', 9999),
      r('https://co.uk/', 9999),
      r('https://zero.example/', 0),
      ...Array.from({ length: 6 }, (_, i) => r(`https://small${i}.example/`, 5)),
    ],
  },
  {
    name: 'private-suffixes-split-owners',
    options: { includePrivateSuffixes: true },
    records: [r('https://alice.github.io/a', 500), r('https://bob.github.io/b', 400), r('https://www.example.com/', 100)],
  },
  {
    name: 'per-modality-union',
    options: { modalityMode: 'per-modality' },
    records: [
      ...Array.from({ length: 10 }, (_, i) => r(`https://text${i}.org/`, 1000 - i, { modality: 'text' })),
      ...Array.from({ length: 10 }, (_, i) => r(`https://img${i}.org/`, 10 - i, { modality: 'image' })),
      r('https://text0.org/pic', 3, { modality: 'image' }),
    ],
  },
  {
    name: 'combined-same-input',
    options: { modalityMode: 'combined' },
    records: [
      ...Array.from({ length: 10 }, (_, i) => r(`https://text${i}.org/`, 1000 - i, { modality: 'text' })),
      ...Array.from({ length: 10 }, (_, i) => r(`https://img${i}.org/`, 10 - i, { modality: 'image' })),
      r('https://text0.org/pic', 3, { modality: 'image' }),
    ],
  },
  {
    name: 'months-and-hosts',
    options: {},
    records: [
      { host: 'WWW.Example.com', size: '10', month: '2025-03' },
      { host: 'example.com.', size: '5', month: '2024-11' },
      { host: 'bad host', size: '5' },
      { host: '10.0.0.1', size: '5' },
      { url: 'https://other.example.org/', size: '1', month: '2026-13' },
    ],
  },
  { name: 'empty', options: {}, records: [] },
];
const rankingVectors = rankingCases.map((c) => {
  const ranker = new sb.DomainRanker({ ...c.options, maxDomains: 1000 });
  for (const rec of c.records) ranker.add({ ...rec, size: BigInt(rec.size) });
  const rep = ranker.report();
  return { ...c, expect: { method: { ...rep.method, public_suffix_list: '(bundled)' }, records: rep.records, collection_period: rep.collection_period, totals: rep.totals, groups: rep.groups, domains: rep.domains } };
});
out('ranking.json', rankingVectors);

// ---------------------------------------------------------------- Crawl log fixtures
const crlf = (lines) => lines.join('\r\n');
function warcRecord(headers, block) {
  const body = Buffer.from(block, 'utf8');
  const head = crlf(['WARC/1.1', ...Object.entries({ ...headers, 'Content-Length': String(body.length) }).map(([k, v]) => `${k}: ${v}`), '', '']);
  return Buffer.concat([Buffer.from(head, 'utf8'), body, Buffer.from('\r\n\r\n')]);
}
const http = (status, type, body) => `HTTP/1.1 ${status}\r\nContent-Type: ${type}\r\nServer: test\r\n\r\n${body}`;
const warc = Buffer.concat([
  warcRecord({ 'WARC-Type': 'warcinfo', 'WARC-Date': '2025-01-01T00:00:00Z', 'Content-Type': 'application/warc-fields' }, 'software: test\r\n'),
  warcRecord({ 'WARC-Type': 'request', 'WARC-Target-URI': 'https://news.example.co.uk/a', 'WARC-Date': '2025-02-03T10:00:00Z', 'Content-Type': 'application/http; msgtype=request' }, 'GET /a HTTP/1.1\r\nHost: news.example.co.uk\r\n\r\n'),
  warcRecord({ 'WARC-Type': 'response', 'WARC-Target-URI': 'https://news.example.co.uk/a', 'WARC-Date': '2025-02-03T10:00:01Z', 'Content-Type': 'application/http; msgtype=response' }, http('200 OK', 'text/html; charset=utf-8', '<html>'.padEnd(1000, 'x'))),
  warcRecord({ 'WARC-Type': 'response', 'WARC-Target-URI': '<https://www.example.co.uk/b>', 'WARC-Date': '2025-03-04T10:00:01Z', 'Content-Type': 'application/http; msgtype=response' }, http('200 OK', 'text/html', 'y'.repeat(500))),
  warcRecord({ 'WARC-Type': 'response', 'WARC-Target-URI': 'https://blog.example.org/c', 'WARC-Date': '2025-04-05T10:00:01Z', 'Content-Type': 'application/http; msgtype=response' }, http('404 Not Found', 'text/html', 'z'.repeat(5000))),
  warcRecord({ 'WARC-Type': 'response', 'WARC-Target-URI': 'https://img.example.net/p.jpg', 'WARC-Date': '2025-05-06T10:00:01Z', 'Content-Type': 'application/http; msgtype=response' }, http('200 OK', 'image/jpeg', 'j'.repeat(2000))),
  warcRecord({ 'WARC-Type': 'revisit', 'WARC-Target-URI': 'https://news.example.co.uk/a', 'WARC-Date': '2025-06-07T10:00:01Z', 'Content-Type': 'application/http; msgtype=response' }, 'HTTP/1.1 200 OK\r\n\r\n'),
  warcRecord({ 'WARC-Type': 'resource', 'WARC-Target-URI': 'https://files.example.org/doc.txt', 'WARC-Date': '2025-07-08T10:00:01Z', 'Content-Type': 'text/plain' }, 'r'.repeat(300)),
  warcRecord({ 'WARC-Type': 'metadata', 'WARC-Target-URI': 'https://news.example.co.uk/a', 'WARC-Date': '2025-02-03T10:00:02Z', 'Content-Type': 'application/warc-fields' }, 'via: x\r\n'),
]);
writeFileSync(fixture('crawl/sample.warc'), warc);
writeFileSync(fixture('crawl/sample.warc.gz'), Buffer.concat([gzipSync(warc.subarray(0, 700), { level: 9 }), gzipSync(warc.subarray(700), { level: 9 })]));
writeFileSync(
  fixture('crawl/sample.cdx'),
  [
    ' CDX N b a m s k r M S V g',
    'uk,co,example,news)/a 20250203100001 https://news.example.co.uk/a text/html 200 AAAA - - 1200 0 sample.warc.gz',
    'uk,co,example,www)/b 20250304100001 https://www.example.co.uk/b text/html 200 BBBB - - 700 1200 sample.warc.gz',
    'org,example,blog)/c 20250405100001 https://blog.example.org/c text/html 404 CCCC - - 5100 1900 sample.warc.gz',
    'net,example,img)/p.jpg 20250506100001 https://img.example.net/p.jpg image/jpeg 200 DDDD - - 2100 7000 sample.warc.gz',
    'uk,co,example,news)/a 20250607100001 https://news.example.co.uk/a warc/revisit - AAAA - - 300 9100 sample.warc.gz',
    'org,example,files)/doc.txt 20250708100001 - text/plain - EEEE - - 400 9400 sample.warc.gz',
    'broken line',
    '',
  ].join('\n'),
);
writeFileSync(
  fixture('crawl/sample.cdxj'),
  [
    '!meta {"comment": "pywb style"}',
    'uk,co,example,news)/a 20250203100001 {"url": "https://news.example.co.uk/a", "mime": "text/html", "status": "200", "length": "1200", "offset": "0", "filename": "sample.warc.gz"}',
    'uk,co,example,www)/b 20250304100001 {"url": "https://www.example.co.uk/b", "mime": "text/html", "status": "200", "length": 700}',
    'org,example,blog)/c 20250405100001 {"url": "https://blog.example.org/c", "mime": "text/html", "status": "404", "length": "5100"}',
    'net,example,img)/p.jpg 20250506100001 {"url": "https://img.example.net/p.jpg", "mime": "image/jpeg", "status": "200", "length": "2100"}',
    'uk,co,example,news)/a 20250607100001 {"url": "https://news.example.co.uk/a", "mime": "warc/revisit", "length": "300"}',
    'org,example,files)/doc.txt 20250708100001 {"mime": "text/plain", "length": "400"}',
    'org,example)/x 20250101000000 {not json}',
    'org,example)/y 20250101000000 ["array"]',
    'org,example)/z 20250101000000 {"url": "https://z.example.org/", "length": "-5"}',
    '',
  ].join('\n'),
);
writeFileSync(
  fixture('crawl/sample.csv'),
  [
    'url,bytes,modality,date',
    'https://news.example.co.uk/a,1200,text,2025-02-03',
    '"https://www.example.co.uk/b",700,text,2025-03-04T10:00:00Z',
    'https://img.example.net/p.jpg,2100,image,20250506',
    'https://files.example.org/doc.txt,400,text,2025-07',
    '"https://quoted.example.org/a,b",50,text,2025-07',
    'https://bad.example.org/,not-a-number,text,2025-07',
    '',
  ].join('\r\n'),
);
const readers = {
  warc: (b, f) => sb.readWarc(b, f),
  cdx: (b, f) => sb.readCdx(b, f),
  cdxj: (b, f) => sb.readCdxj(b, f),
  csv: (b, f) => sb.readCsv(b, { url: 'url', size: 'bytes', modality: 'modality', date: 'date' }, f),
};
async function* bytesOf(buf, chunk) {
  for (let i = 0; i < buf.length; i += chunk) yield new Uint8Array(buf.subarray(i, i + chunk));
}
const crawlVectors = [];
for (const [file, kind] of [
  ['sample.warc', 'warc'],
  ['sample.cdx', 'cdx'],
  ['sample.cdxj', 'cdxj'],
  ['sample.csv', 'csv'],
]) {
  const buf = readFileSync(fixture(`crawl/${file}`));
  const filtered = {};
  const records = [];
  for await (const rec of readers[kind](bytesOf(buf, 97), filtered)) records.push({ ...rec, size: rec.size.toString() });
  crawlVectors.push({ file, kind, records, filtered: Object.fromEntries(Object.entries(filtered).sort(([a], [b]) => (a < b ? -1 : 1))) });
}
out('crawl.json', crawlVectors);

// ---------------------------------------------------------------- Cards
const cards = ['rajpurkar_squad', 'HuggingFaceFW_fineweb', 'wikimedia_wikipedia', 'allenai_c4', 'openslr_librispeech_asr', 'tatsu-lab_alpaca', 'facebook_voxpopuli', 'HuggingFaceM4_OBELICS', 'HuggingFaceTB_cosmopedia', 'mozilla-foundation_common_voice_17_0', 'nvidia_HelpSteer2', 'databricks_databricks-dolly-15k', 'allenai_dolma', 'openai_gsm8k'];
const cardVectors = [];
for (const c of cards) {
  const readme = readFileSync(fixture(`hf/${c}.README.md`), 'utf8');
  const api = JSON.parse(readFileSync(fixture(`hf/${c}.api.json`), 'utf8'));
  const id = api.id;
  cardVectors.push({ fixture: c, mode: 'offline', expect: sb.datasetFromHfCard({ id, readme, reference: `${c}.README.md` }) });
  cardVectors.push({ fixture: c, mode: 'api', expect: sb.datasetFromHfCard({ id, api, readme, reference: `https://huggingface.co/api/datasets/${id}` }) });
}
{
  const api = JSON.parse(readFileSync(fixture('hf/bigcode_the-stack.api.json'), 'utf8'));
  cardVectors.push({ fixture: 'bigcode_the-stack', mode: 'api-no-readme', expect: sb.datasetFromHfCard({ id: api.id, api, readme: null, reference: `https://huggingface.co/api/datasets/${api.id}` }) });
}
out('cards.json', cardVectors);

// ---------------------------------------------------------------- Summaries: schema, validation, rendering
const example = sb.parseYaml(readFileSync(new URL('examples/summary.yaml', root), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const set = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  return obj;
};
const variant = (changes) => {
  const v = clone(example);
  for (const [p, val] of Object.entries(changes)) set(v, p, val);
  return v;
};
const summaryCases = [
  ['example', example, '2026-11-08'],
  ['empty', { sourcebook: 1 }, '2026-11-08'],
  [
    'legacy-with-gaps',
    variant({
      'general_information.model.placement_dates': [
        { model: 'Nimbus-7B-v1.1', date: '2025-03-01' },
        { model: 'Nimbus-7B-Instruct-v1.1', date: '2025-03-01' },
      ],
      'data_sources.crawled_data.collection_period': { from: null, to: null },
      'data_sources.crawled_data.top_domains': { domains: [], access_information: '' },
      information_gaps: [
        { field: 'crawl_period', justification: 'Crawl logs from before 2024 were not kept.' },
        { field: 'top_domains', justification: 'Crawl logs from before 2024 were not kept, so domain sizes cannot be computed.' },
      ],
    }),
    '2026-11-08',
  ],
  [
    'mixed-placement-with-gaps',
    variant({
      'general_information.model.placement_dates': [
        { model: 'Nimbus-7B-v1.1', date: '2025-03-01' },
        { model: 'Nimbus-7B-Instruct-v1.1', date: '2025-09-15' },
      ],
      'data_sources.crawled_data.collection_period': { from: null, to: null },
      'data_sources.crawled_data.top_domains': { domains: [], access_information: '' },
      information_gaps: [
        { field: 'crawl_period', justification: 'Crawl logs from before 2024 were not kept.' },
        { field: 'top_domains', justification: 'Crawl logs from before 2024 were not kept, so domain sizes cannot be computed.' },
      ],
    }),
    '2026-11-08',
  ],
  [
    'gaps-not-allowed-for-new-model',
    variant({
      'data_sources.crawled_data.top_domains': { domains: [], access_information: '' },
      information_gaps: [
        { field: 'top_domains', justification: 'Logs lost.' },
        { field: 'no_such_field', justification: 'x' },
        { field: 'tdm_additional_comments', justification: '' },
      ],
    }),
    '2026-11-08',
  ],
  [
    'inconsistent-answers',
    variant({
      'data_sources.other_private_datasets': { obtained: false, modalities: { selected: ['text'] }, publicly_known_datasets: [{ name: 'X' }], non_publicly_known_description: 'y' },
      'data_sources.user_data': { from_model_interactions: false, from_other_services: false, services_description: 'chat app', modalities: { selected: ['image'] } },
      'general_information.modalities.image': { present: false, size_range: 'below_1m_images', types_of_content: 'photos' },
      'data_sources.licensed_datasets': { concluded: true, modalities: { selected: ['audio'], other: '3D' } },
    }),
    '2026-11-08',
  ],
  [
    'conditional-requirements',
    variant({
      'general_information.provider.authorised_representative': { applicable: true, name_and_contact_details: '' },
      'general_information.model.model_dependencies': { is_modification: true, models: [{ name: '', summary_link: '' }] },
      'general_information.model.placement_dates': [{ model: 'Nimbus-7B-v1.1', date: '2026-09-01' }, { model: 'Unknown', date: '2026-01-01' }],
      'data_sources.public_datasets.large_datasets': [{ name: 'No link dataset', description: 'A corpus.' }, { name: 'Described', description: 'A corpus.', collection_period: { start: 'not known', end: '2024-05' } }],
      'data_sources.crawled_data.collection_period': { from: '2026-05', to: '2025-01' },
      'data_sources.synthetic_data': { created: true, modalities: { selected: ['text'] } },
      'data_sources.user_data': { from_model_interactions: true, from_other_services: true },
      'general_information.modalities.text': { present: true, size_range: null, size_other_unit: '', types_of_content: '' },
      'general_information.modalities.other': [{ modality: '3D meshes', approximate_size: '' }],
      'general_information.latest_data_collection': { date: '2025-06', continuous_training: true },
      last_update: '2025-12-01',
      'summary_version.previous_versions': [{ version: '0.9' }],
    }),
    '2026-11-08',
  ],
  [
    'hostile-text',
    variant({
      'general_information.provider.name_and_contact_details': '# Heading?\n<script>alert(1)</script> [click](javascript:alert(1)) ![img](https://x.example/a.png)\n- list item\n1. ordered\n| a | b |\n$x^2$ **bold** _it_ `code` ~~strike~~ &amp; @user\n    indented code\n\n> quote\n===',
      'data_sources.public_datasets.large_datasets': [{ name: '**Bold** <b>name</b> [x](y)', link: 'https://example.org/a_b*c' }],
      'data_processing.other_information': '1) not a list\n+ plus\n---',
    }),
    '2026-11-08',
  ],
];
const summaryVectors = [];
for (const [name, data, asOf] of summaryCases) {
  const summary = sb.parseSummary(data);
  const result = sb.validateSummary(summary, { asOf });
  summaryVectors.push({ name, input: data, as_of: asOf, normalized: summary, validation: result, markdown: sb.renderMarkdown(summary), markdown_with_instructions: name === 'empty' ? sb.renderMarkdown(summary, { instructions: true }) : null, json: sb.renderJson(summary).replace(sb.GENERATOR, '(generator)'), model_card: sb.modelCardSnippet(summary, { summaryUrl: 'https://example.org/summary' }) });
}
out('summaries.json', summaryVectors);

const schemaErrorCases = [
  ['not-object', ['a', 'list']],
  ['wrong-version', { sourcebook: 2 }],
  ['unknown-keys', JSON.parse('{"sourcebook": 1, "extra": 1, "general_information": {"provider": {"name": "x"}}, "__proto__": {"polluted": true}}')],
  ['wrong-types', { sourcebook: 1, summary_version: { version: 1.1 }, last_update: '2026-02-30', general_information: { latest_data_collection: { date: '2026-13', continuous_training: 'yes' } } }],
  ['bad-links-and-domains', { sourcebook: 1, data_sources: { public_datasets: { large_datasets: [{ name: 'x', link: 'javascript:alert(1)' }, { name: 'y', link: 'https://exa mple.com' }] }, crawled_data: { top_domains: { domains: ['Example.com', 'example.com', 'example.com', 'not a domain'] } } } }],
  ['hidden-characters', { sourcebook: 1, general_information: { provider: { name_and_contact_details: 'Evil\u202eexe.txt' }, other_characteristics: 'bell\u0007' } }],
  ['bad-choices', { sourcebook: 1, general_information: { modalities: { text: { size_range: 'huge' } }, provider: { authorised_representative: { not_applicable_reason: 'because' } } }, data_sources: { public_datasets: { modalities: { selected: ['text', 'text', 'smell'] } } } }],
  ['too-long', { sourcebook: 1, general_information: { other_characteristics: 'x'.repeat(100_001) } }],
  ['lone-surrogate', { sourcebook: 1, general_information: { other_characteristics: `a${String.fromCharCode(0xd800)}b`, additional_comments: `pair ${String.fromCodePoint(0x1f600)} is fine` } }],
];
out(
  'schema-errors.json',
  schemaErrorCases.map(([name, input]) => {
    try {
      sb.parseSummary(input);
      return { name, input, issues: [] };
    } catch (e) {
      return { name, input, issues: e.issues };
    }
  }),
);

// ---------------------------------------------------------------- Large datasets and pre-fill
const ds = (id, modalities, sizes, category = 'public') => ({ id, name: id.toUpperCase(), link: `https://huggingface.co/datasets/org/${id}`, category, modalities, languages: ['en'], licenses: [], sizes: sizes.map(([modality, value, unit = 'tokens', after = true]) => ({ modality, value: String(value), unit, basis: 'test', after_preprocessing: after })), collection_period: { start: null, end: null }, publicly_known: null, source: { kind: 'test', reference: 'test', revision: null }, notes: [] });
const inventoryCases = [
  ['three-percent-boundary', [ds('a', ['text'], [['text', 3]]), ds('b', ['text'], [['text', 97]]), ds('c', ['text'], [['text', 0]])]],
  ['just-over', [ds('a', ['text'], [['text', 31]]), ds('b', ['text'], [['text', 969]])]],
  ['multi-modality', [ds('a', ['text', 'image'], [['text', 10], ['image', 900, 'images']]), ds('b', ['text'], [['text', 990]]), ds('c', ['image'], [['image', 100, 'images']])]],
  ['missing-size', [ds('a', ['text'], [['text', 10]]), ds('b', ['text'], [])]],
  ['unit-mismatch', [ds('a', ['text'], [['text', 10, 'bytes']]), ds('b', ['text'], [['text', 10, 'tokens']])]],
  ['categories', [ds('pub', ['text'], [['text', 5_000_000_000]]), ds('lic', ['text', 'audio'], [], 'licensed'), { ...ds('priv', ['image'], [], 'private'), publicly_known: true }, ds('priv2', ['text'], [], 'private'), ds('syn', ['text'], [], 'synthetic'), ds('oth', ['video'], [], 'other'), ds('none', ['text'], [], null)]],
  ['before-preprocessing', [ds('a', ['text'], [['text', 50, 'tokens', false]]), ds('b', ['text'], [['text', 50]])]],
];
out(
  'inventory.json',
  inventoryCases.map(([name, datasets]) => {
    const inv = sb.parseInventory({ kind: 'sourcebook-inventory', version: 1, datasets, domain_report: null });
    const pre = sb.prefillSummary(inv);
    return { name, datasets, large: sb.largeDatasets(inv.datasets), prefill: pre.summary, hints: pre.hints };
  }),
);
console.log('Vectors written.');
