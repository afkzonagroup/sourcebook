# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Host names, the Public Suffix List and the domain ranking of Section 2.3.

Port of ``src/domains/host.ts``, ``psl.ts`` and ``rank.ts``; shared vectors in
``test-vectors/hosts.json``, ``psl.json`` and ``ranking.json``.
"""

from __future__ import annotations

import gzip
import hashlib
import re
import unicodedata
from dataclasses import dataclass, field as dc_field
from importlib.resources import files
from typing import Any, Dict, List, Optional, Set, Tuple

from . import __version__

MAX_URL_LENGTH = 8192
BUNDLED_PSL_SHA256 = "027fe126522e646b2335c3d564750d7223f0994a1a460107ce4f3a40bd682310"
MAX_DOMAINS_LIMIT = 50_000_000
GENERATOR = f"Sourcebook {__version__} by AFKzona Group (https://afkzonagroup.lt)"

_ASCII_LABEL = re.compile(r"^[a-z0-9_-]{1,63}\Z")
# JavaScript's \s (not Python's) plus the URL delimiters, as in host.ts.
_BAD_HOST_CHARS = re.compile(r"[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff/\\?#@:\[\]]")
_DOTS = re.compile("[。．｡]")


def _unicode_label_ok(label: str) -> bool:
    return label != "" and all(c == "-" or unicodedata.category(c)[0] in "LMN" for c in label)


def punycode_encode(label: str) -> str:
    """Punycode (RFC 3492) of one label, without "xn--"."""
    return label.encode("punycode").decode("ascii")


def normalise_host(raw: str) -> Optional[str]:
    """Lower case, no trailing dot, labels ASCII or "xn--"; None for anything else."""
    if len(raw) == 0 or len(raw.encode("utf-16-le")) // 2 > 1024:
        return None
    host = _DOTS.sub(".", unicodedata.normalize("NFC", raw).lower())
    if host.endswith("."):
        host = host[:-1]
    if host == "":
        return None
    out: List[str] = []
    for label in host.split("."):
        if _ASCII_LABEL.match(label):
            out.append(label)
            continue
        if not _unicode_label_ok(label):
            return None
        # Compatibility characters are mapped by browsers (UTS #46); reported as invalid, not guessed.
        if unicodedata.normalize("NFKC", label) != label:
            return None
        encoded = "xn--" + punycode_encode(label)
        if len(encoded) > 63:
            return None
        out.append(encoded)
    result = ".".join(out)
    if len(result) > 253:
        return None
    return result


def looks_like_ipv4(host: str) -> bool:
    last = host.split(".")[-1]
    return re.match(r"^(0x[0-9a-f]*|[0-9]+)\Z", last) is not None


def js_sort_key(s: str) -> bytes:
    """Sort key that orders strings as JavaScript does (by UTF-16 code units)."""
    return s.encode("utf-16-be", "surrogatepass")


def check_host(host: str) -> Dict[str, Any]:
    if "%" in host or _BAD_HOST_CHARS.search(host):
        return {"ok": False, "reason": "invalid_host"}
    normal = normalise_host(host)
    if normal is None:
        return {"ok": False, "reason": "invalid_host"}
    if looks_like_ipv4(normal):
        return {"ok": False, "reason": "ip_address"}
    return {"ok": True, "host": normal}




def host_of_url(url: str) -> Dict[str, Any]:
    """Extracts and normalises the host of an http or https URL."""
    if len(url) == 0 or len(url.encode("utf-16-le")) // 2 > MAX_URL_LENGTH:
        return {"ok": False, "reason": "invalid_url"}
    m = re.match(r"^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)", url)
    if m is None:
        if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", url):
            return {"ok": False, "reason": "not_http"}
        return {"ok": False, "reason": "invalid_url"}
    scheme = m.group(1).lower()
    if scheme not in ("http", "https"):
        return {"ok": False, "reason": "not_http"}
    authority = m.group(2)
    at = authority.rfind("@")
    if at >= 0:
        authority = authority[at + 1 :]
    if authority.startswith("["):
        return {"ok": False, "reason": "ip_address"}
    host = authority
    colon = authority.rfind(":")
    if colon >= 0:
        port = authority[colon + 1 :]
        if not re.match(r"^[0-9]{0,5}\Z", port) or (port != "" and int(port) > 65535):
            return {"ok": False, "reason": "invalid_url"}
        host = authority[:colon]
    return check_host(host)


def _to_ascii(rule: str) -> str:
    out = []
    for label in rule.split("."):
        if re.match(r"^[\x21-\x7e]*\Z", label):
            out.append(label.lower())
        else:
            out.append("xn--" + punycode_encode(unicodedata.normalize("NFC", label).lower()))
    return ".".join(out)


@dataclass
class PublicSuffixList:
    version: str
    icann: Set[str] = dc_field(default_factory=set)
    private: Set[str] = dc_field(default_factory=set)


def parse_public_suffix_list(text: str) -> PublicSuffixList:
    psl = PublicSuffixList("unknown")
    section = "none"
    saw_icann = False
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if line.startswith("//"):
            v = re.match(r"^// VERSION: (\S+)\Z", line)
            if v:
                psl.version = v.group(1)
            if "===BEGIN ICANN DOMAINS===" in line:
                section = "icann"
                saw_icann = True
            elif "===BEGIN PRIVATE DOMAINS===" in line:
                section = "private"
            elif "===END ICANN DOMAINS===" in line or "===END PRIVATE DOMAINS===" in line:
                section = "none"
            continue
        if line == "" or section == "none":
            continue
        rule = line.split()[0]
        target = psl.icann if section == "icann" else psl.private
        target.add("!" + _to_ascii(rule[1:]) if rule.startswith("!") else _to_ascii(rule))
    if not saw_icann:
        raise ValueError("Not a public suffix list: the ICANN section is missing.")
    return psl


def load_bundled_text(gz: bytes, expected_sha256: str = BUNDLED_PSL_SHA256) -> str:
    raw = gzip.decompress(gz)
    if len(raw) > 16 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ValueError("The bundled Public Suffix List does not match its checksum.")
    return raw.decode("utf-8")


_BUNDLED: Optional[PublicSuffixList] = None


def bundled_public_suffix_list() -> PublicSuffixList:
    global _BUNDLED
    if _BUNDLED is None:
        _BUNDLED = parse_public_suffix_list(load_bundled_text(files("sourcebook").joinpath("data/public_suffix_list.dat.gz").read_bytes()))
    return _BUNDLED


def _has(psl: PublicSuffixList, include_private: bool, rule: str) -> bool:
    return rule in psl.icann or (include_private and rule in psl.private)


def public_suffix(host: str, psl: PublicSuffixList, include_private: bool = False) -> str:
    labels = host.split(".")
    for i in range(len(labels)):
        if _has(psl, include_private, "!" + ".".join(labels[i:])):
            return ".".join(labels[i + 1 :])
    for i in range(len(labels)):
        candidate = ".".join(labels[i:])
        if _has(psl, include_private, candidate):
            return candidate
        rest = labels[i + 1 :]
        if rest and _has(psl, include_private, "*." + ".".join(rest)):
            return candidate
    return labels[-1]


def registrable_domain(host: str, psl: PublicSuffixList, include_private: bool = False) -> Optional[str]:
    suffix = public_suffix(host, psl, include_private)
    if host == suffix:
        return None
    labels = host.split(".")
    n = len(suffix.split("."))
    if len(labels) <= n:
        return None
    return ".".join(labels[len(labels) - n - 1 :])


def required_count(n: int, sme: bool) -> int:
    """Domains the template asks for out of n (rounded up; SMEs 5 % or 1 000)."""
    if n <= 0:
        return 0
    if sme:
        return min((n * 5 + 99) // 100, 1000)
    return (n * 10 + 99) // 100


def share_percent(size: int, total: int) -> str:
    if total <= 0:
        return "0.0000"
    q = (size * 1_000_000) // total
    return f"{q // 10_000}.{q % 10_000:04d}"


def select_top(entries: List[Tuple[str, int]], sme: bool, ties: str) -> Tuple[List[str], int, int]:
    ordered = sorted(entries, key=lambda e: (-e[1], e[0]))
    required = required_count(len(ordered), sme)
    if required == 0:
        return [], 0, 0
    cutoff = ordered[required - 1][1]
    end = required
    if ties == "include":
        while end < len(ordered) and ordered[end][1] == cutoff:
            end += 1
    return [d for d, _ in ordered[:end]], required, cutoff


class LimitError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


_MONTH = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])\Z")


class DomainRanker:
    """Collects crawl records and ranks their registrable domains."""

    def __init__(
        self,
        sme: bool = False,
        ties: str = "include",
        modality_mode: str = "combined",
        include_private_suffixes: bool = False,
        size_unit: str = "bytes",
        size_measure: str = "bytes",
        max_domains: int = 5_000_000,
        public_suffix_list: Optional[PublicSuffixList] = None,
    ) -> None:
        if ties not in ("include", "cut") or modality_mode not in ("combined", "per-modality"):
            raise ValueError("Unknown ranking option.")
        if not isinstance(max_domains, int) or max_domains < 1 or max_domains > MAX_DOMAINS_LIMIT:
            raise ValueError(f"max_domains must be an integer from 1 to {MAX_DOMAINS_LIMIT}.")
        self.sme = sme
        self.ties = ties
        self.modality_mode = modality_mode
        self.include_private = include_private_suffixes
        self.size_unit = size_unit
        self.size_measure = size_measure
        self.max_domains = max_domains
        self.psl = public_suffix_list or bundled_public_suffix_list()
        self.stats: Dict[str, Dict[str, Any]] = {}
        self.cache: Dict[str, Tuple[str, str]] = {}
        self.skipped = {"invalid_url": 0, "not_http": 0, "ip_address": 0, "invalid_host": 0, "public_suffix_only": 0, "zero_size": 0}
        self.read = 0
        self.counted = 0
        self.min_month: Optional[str] = None
        self.max_month: Optional[str] = None

    def _cache_key(self, record: Dict[str, Any]) -> Optional[str]:
        if record.get("host") is not None:
            return "h:" + record["host"]
        url = record.get("url") or ""
        if len(url) == 0 or len(url.encode("utf-16-le")) // 2 > MAX_URL_LENGTH:
            return None
        m = re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*", url)
        return None if m is None else "u:" + m.group(0)

    def _domain_of(self, record: Dict[str, Any]) -> Tuple[str, str]:
        key = self._cache_key(record)
        if key is not None and key in self.cache:
            return self.cache[key]
        result = check_host(record["host"]) if record.get("host") is not None else host_of_url(record.get("url") or "")
        if not result["ok"]:
            value = ("skip", result["reason"])
        else:
            domain = registrable_domain(result["host"], self.psl, self.include_private)
            value = ("skip", "public_suffix_only") if domain is None else ("domain", domain)
        if key is not None:
            if len(self.cache) >= 100_000:
                self.cache.clear()
            self.cache[key] = value
        return value

    def add(self, record: Dict[str, Any]) -> None:
        """Adds one record: {url or host, size (int), modality?, month?}."""
        self.read += 1
        size = int(record["size"])
        if size < 0:
            raise ValueError("Record size cannot be negative.")
        kind, value = self._domain_of(record)
        if kind == "skip":
            self.skipped[value] += 1
            return
        if size == 0:
            self.skipped["zero_size"] += 1
            return
        self.counted += 1
        month = record.get("month")
        if month is not None and _MONTH.match(month):
            if self.min_month is None or month < self.min_month:
                self.min_month = month
            if self.max_month is None or month > self.max_month:
                self.max_month = month
        s = self.stats.get(value)
        if s is None:
            if len(self.stats) >= self.max_domains:
                raise LimitError("too-many-domains", f"More than {self.max_domains} distinct domains; raise the limit with --max-domains.")
            s = {"size": 0, "records": 0, "by_modality": {}}
            self.stats[value] = s
        s["size"] += size
        s["records"] += 1
        modality = record.get("modality")
        if modality is None:
            modality = "unspecified"
        s["by_modality"][modality] = s["by_modality"].get(modality, 0) + size

    def report(self) -> Dict[str, Any]:
        groups = []
        chosen: List[str] = []
        chosen_set: Set[str] = set()
        total = sum(s["size"] for s in self.stats.values())
        group_inputs: List[Tuple[str, List[Tuple[str, int]]]] = []
        if self.modality_mode == "combined":
            group_inputs.append(("all", [(d, s["size"]) for d, s in self.stats.items()]))
        else:
            modalities = sorted({m for s in self.stats.values() for m in s["by_modality"]}, key=js_sort_key)
            for m in modalities:
                entries = [(d, s["by_modality"][m]) for d, s in self.stats.items() if s["by_modality"].get(m, 0) > 0]
                group_inputs.append((m, entries))
        for modality, entries in group_inputs:
            selected, required, cutoff = select_top(entries, self.sme, self.ties)
            for d in selected:
                if d not in chosen_set:
                    chosen_set.add(d)
                    chosen.append(d)
            groups.append(
                {
                    "modality": modality,
                    "domains": len(entries),
                    "size": str(sum(v for _, v in entries)),
                    "required": required,
                    "cutoff_size": str(cutoff),
                    "selected": len(selected),
                }
            )
        ordered = sorted(((d, self.stats[d]["size"]) for d in chosen), key=lambda e: (-e[1], e[0]))
        domains = [
            {
                "rank": i + 1,
                "domain": d,
                "size": str(size),
                "share_percent": share_percent(size, total),
                "records": self.stats[d]["records"],
                "modalities": sorted(self.stats[d]["by_modality"].keys(), key=js_sort_key),
            }
            for i, (d, size) in enumerate(ordered)
        ]
        return {
            "kind": "sourcebook-domain-report",
            "version": 1,
            "generator": GENERATOR,
            "method": {
                "grouping": "registrable-domain",
                "public_suffix_list": self.psl.version,
                "private_suffixes": self.include_private,
                "threshold": "sme-top-5-percent-or-1000" if self.sme else "top-10-percent",
                "ties": self.ties,
                "modality_mode": self.modality_mode,
                "size_unit": self.size_unit,
                "size_measure": self.size_measure,
            },
            "records": {"read": self.read, "counted": self.counted, "skipped": dict(self.skipped)},
            "collection_period": {"from": self.min_month, "to": self.max_month},
            "totals": {"domains": len(self.stats), "size": str(total)},
            "groups": groups,
            "domains": domains,
        }
