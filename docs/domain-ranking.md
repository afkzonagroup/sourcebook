# Domain ranking (Section 2.3)

The template asks, for data crawled or scraped by the provider or on its
behalf, for "a list of those most relevant internet domains names (top and
second-level domain, e.g. “example.com”) by listing the top 10 % of all
domain names determined by the size of the content scraped (in a
representative manner across all modalities where applicable). Small and
medium-sized enterprises (SMEs), including start-ups, should disclose top 5%
of all domain names or 1 000 internet domain names, whichever is lower. You
can provide this list for instance as a downloadable file or provide here
information on how to access it."

Section 2.3 covers only data "crawled, scraped [...] or otherwise compiled
from online sources directly by the provider of the model or on their behalf
(i.e. excluding publicly available datasets already compiled by third parties
and made available on platforms such as common crawl that are covered under
Section 2.1)". Run `collect crawl` on the logs of your own crawls only, not on
snapshots of Common Crawl or other public datasets: those belong in
Section 2.1.

`sourcebook collect crawl` computes that list from crawl logs. Every choice
it makes where the template is silent is written into the report
(`method`), so a reader can see how the list was made.

## Steps

1. **Read the logs.** WARC (`.warc`, `.warc.gz`, also WET conversion
   records), CDX (`.cdx`) with a legend line, CDXJ (`.cdxj`, pywb style) or
   CSV/TSV with a URL or host column and a size column. All files of one run
   must have the same format, so that sizes are comparable.
2. **Keep content records only.** WARC: `response` (HTTP 2xx only),
   `resource` and `conversion` records; `request`, `metadata`, `revisit` and
   `warcinfo` are counted as filtered. CDX/CDXJ: status 2xx or unknown;
   revisits are filtered. Every filtered record is counted by reason.
3. **Measure the size.**
   - WARC: the record payload in bytes; for HTTP responses the HTTP headers
     are not counted.
   - CDX/CDXJ: the compressed WARC record length (field `S` or `length`).
     This is a proxy for the content size; use WARC or CSV for exact sizes.
   - CSV: the number in the size column, in the unit you name with `--unit`
     (for example tokens after filtering, which is closest to "content
     scraped and used for the training").
4. **Find the domain name.** The host is taken from the URL (http and https
   only), lower-cased, international names converted to their "xn--" form.
   IP addresses, malformed hosts and names with compatibility characters
   (fullwidth letters or ligatures, which browsers map to other letters) are
   counted and skipped. The host is then
   reduced to its registrable domain with the Public Suffix List, so
   `news.bbc.co.uk` and `www.bbc.co.uk` both count for `bbc.co.uk`, and
   `a.b.example.com` for `example.com`. By default only the ICANN section of
   the list is used, so `alice.github.io` counts for `github.io`;
   `--private-suffixes` uses the private section too (then `alice.github.io`
   is its own domain).
5. **Rank.** Domains with no counted content are left out. The rest are
   sorted by total size, largest first, then alphabetically.
6. **Cut.** With N domains, the template's share is taken by count and
   rounded up: `ceil(N × 10 / 100)`, or for SMEs `min(ceil(N × 5 / 100),
   1000)`. Rounding up never lists fewer domains than the share names.
7. **Ties.** If domains after the cut have the same size as the last one
   inside it, they are listed too (`--ties include`, the default), so that the
   list does not depend on alphabetical order. `--ties cut` stops exactly at
   the count.
8. **Modalities.** "In a representative manner across all modalities": with
   `--modality-mode per-modality` the share is applied within each modality
   (from the MIME type or the CSV modality column) and the lists are merged,
   so a small modality is still represented. The default `combined` adds all
   sizes together.

## Why the Public Suffix List

"Top and second-level domain" works for `example.com` but not for
`example.co.uk` (the last two labels would be `co.uk`, which names no
website). The Public Suffix List (<https://publicsuffix.org/>) is the
community-maintained list of such suffixes that browsers use to decide where a
registrable domain begins. It is bundled, unmodified and gzip-compressed, as
`data/public_suffix_list.dat.gz` under the Mozilla Public License 2.0
(`data/PSL-LICENSE.txt`), version `2026-11-06_09-01-47_UTC`. Its SHA-256 is
checked when it is loaded and its version is written into every report.
Update it by replacing the file and the checksum in `src/domains/psl.ts` and
`python/src/sourcebook/domains.py`.

## Output

- `--out domains.json`: an inventory with the full report (method, record
  counts, filtered and skipped counts, collection period, totals, groups and
  the ranked domains with size, share and modalities). Use it with
  `sourcebook init --from` and `sourcebook validate --inventory`.
- `--list-out domains.txt`: the plain list to publish as a downloadable file.

## Limits

Memory is bounded: lines (64 KiB), WARC and HTTP headers (64 KiB), CSV rows
and fields, and the number of distinct domains (`--max-domains`, default
5 000 000). `--max-records` stops after a number of records.
