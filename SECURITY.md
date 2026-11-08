# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
<https://github.com/afkzonagroup/sourcebook/security/advisories/new>. Do not
open a public issue. If you cannot use GitHub, email info@afkzonagroup.lt.

Include the version, what you did, what happened, and a minimal example. We
aim to acknowledge reports within five working days and to agree a
disclosure date with you.

Supported versions: the latest release.

## Threat model

### Assets

- **The published summary**: a legal disclosure. Its content must be exactly
  what the provider wrote, and it must not carry injected markup, links or
  scripts.
- **The provider's machine and CI**: files the CLI reads and writes; the
  GitHub Actions runner, its workspace, `$GITHUB_OUTPUT` and the step
  summary.
- **Crawl logs and manifests**: may reveal which sites a provider crawled
  before it decides to publish.

### Actors

- The **provider's staff** running Sourcebook (trusted, may make mistakes).
- **Authors of third-party data**: dataset cards on the Hugging Face Hub,
  shared manifests, crawl logs from contractors. Their content is untrusted.
- **Contributors to a model repository** who open pull requests that the
  GitHub Action checks (untrusted file names and file contents).
- A **network attacker** or a compromised redirect (relevant only to
  `collect hf --online`).
- A **hostile contributor** to Sourcebook itself.

### Trust boundaries

1. Files (YAML, JSON, CSV, WARC, CDX, CDXJ, Parquet, dataset cards) → the
   parsers.
2. The Hugging Face Hub → the Hub client.
3. Parsed data → generated Markdown, HTML, JSON, YAML, terminal output and
   GitHub workflow commands.
4. Command line arguments and action inputs → the file system.
5. Contributions → the released packages.

### Mitigations

| Threat | Mitigation | Test |
|---|---|---|
| YAML bombs (anchors and aliases), tags that construct objects, merge keys | The YAML reader is a hand-written safe subset: anchors, aliases, tags, merge keys, complex keys and directives are errors | `yaml.test.ts`, `test_security.py` |
| Deep nesting, huge documents | Depth (64), node (200 000) and scalar length (1 MiB) limits in YAML; depth check before `JSON.parse`/`json.loads`; file size caps (8 MiB summaries, 4 MiB cards) | `yaml.test.ts`, `summary.test.ts`, `cli.test.ts` |
| Prototype pollution | Keys `__proto__`, `constructor`, `prototype` rejected by the YAML reader; YAML maps without prototype; only known keys copied from input; unknown keys are errors | `yaml.test.ts`, `summary.test.ts` |
| Crawl logs exhausting memory or CPU | Streaming readers; caps on line length, header size, CSV fields and rows, records, bytes and distinct domains; record blocks are skipped, not buffered | `readers.test.ts`, `domains.test.ts` |
| Malformed WARC, CDX, CDXJ, CSV, Parquet | Strict parsers with explicit errors; Parquet footer length, list sizes, nesting and total work bounded; encrypted footers refused | `readers.test.ts`, `collect.test.ts` |
| Mis-grouped domains (spoofed or odd hosts) | Strict URL host extraction (http/https only), IP addresses and percent-encoded hosts rejected, IDN to A-labels, Public Suffix List grouping; the bundled list is checked against its SHA-256 | `domains.test.ts` |
| SSRF or data leaks via the Hub client | Only `https://huggingface.co` (no other host, port, scheme or user info), checked again on every redirect (at most 3), ids and revisions validated before use, timeouts, response size caps while streaming, no cookies, credentials, tokens or environment proxies | `collect.test.ts`, `test_security.py` |
| Markdown injection in published summaries | All provider text escaped (HTML, links, images, emphasis, tables, maths, headings, list markers, code indentation); links only from validated http(s) URLs | `summary.test.ts` |
| HTML injection | All text and attributes escaped; no scripts; CSP `default-src 'none'` with the stylesheet allowed only by hash; `rel="noopener noreferrer"`; `lang` validated | `summary.test.ts` |
| Hidden text (Trojan Source) in published summaries | Control, invisible and bidirectional characters rejected in every text field; also checked in all repository files | `summary.test.ts`, `source-hygiene.test.ts` |
| Terminal escape injection | Control and bidirectional characters replaced before printing; paths truncated | `cli.test.ts` |
| GitHub workflow command injection | Messages and file names escaped (`%`, CR, LF; `:` and `,` in properties); outputs written only from in-memory numbers, checked before writing; inputs passed through environment variables, never into shell code | `cli.test.ts` |
| Reading files outside the repository from the Action | Summary and inventory paths must resolve inside `GITHUB_WORKSPACE`; symbolic links and non-regular files refused | `cli.test.ts` |
| File overwrite and symlink attacks by the CLI | `O_EXCL` without `--force`; `O_NOFOLLOW`; mode 0644; only paths named by the user | `cli.test.ts` |
| Code execution | No `eval`, `new Function`, dynamic `import()`, child processes, `pickle` or YAML loaders in `src/` and `python/src/` (checked by tests and lint) | `source-hygiene.test.ts` |
| Supply chain | Zero runtime dependencies; exact dev dependency versions; committed lockfile; `files` allow-list; no install scripts; CI actions pinned by SHA with read-only permissions; CI only on pull requests and on demand | `source-hygiene.test.ts` |

### Data flows

See [docs/data-flows.md](docs/data-flows.md).

### Out of scope

- The truth of what a provider writes in its summary.
- Protecting data on a compromised machine or runner.
- Denial of service through inputs within the configured limits (for
  example a crawl log with a billion valid records takes time; lower the
  limits with `--max-records`).
