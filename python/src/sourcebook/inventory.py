# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""The inventory of training data facts and the pre-fill of a summary.

Port of ``src/collect/inventory.ts``; shared vectors in
``test-vectors/inventory.json``.
"""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional

from ._spec import CHECKBOX_MODALITIES, SPEC, STANDARD_MODALITIES
from .domains import GENERATOR, share_percent
from .schema import DOMAIN_RE, MONTH_RE, Reader, SchemaError, empty_summary

CATEGORIES = ("public", "licensed", "private", "synthetic", "other")
_SIZE = re.compile(r"^[0-9]{1,30}\Z")


def new_inventory() -> Dict[str, Any]:
    return {"kind": "sourcebook-inventory", "version": 1, "generator": GENERATOR, "datasets": [], "domain_report": None}


def merge_inventories(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    out = new_inventory()
    by_id: Dict[str, Dict[str, Any]] = {}
    for inv in items:
        for d in inv["datasets"]:
            by_id[d["id"]] = d
        if inv.get("domain_report") is not None:
            out["domain_report"] = inv["domain_report"]
    out["datasets"] = list(by_id.values())
    return out


def _str_list(r: Reader, v: Any, path: str, max_len: int = 1000) -> List[str]:
    return [s for s in (r.short(x, f"{path}[{i}]") for i, x in enumerate(r.list(v, path, max_len))) if s != ""]


def _month_or_null(r: Reader, v: Any, path: str) -> Optional[str]:
    if v is None or v == "":
        return None
    if not isinstance(v, str) or MONTH_RE.match(v) is None:
        r.issue(path, "bad-month")
        return None
    return v


def _int_ok(v: Any, minimum: int) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer() and abs(v) <= 2**53 - 1 and v >= minimum


def _parse_domain_report(r: Reader, value: Any) -> Dict[str, Any]:
    P = "domain_report"
    o = r.obj(value, P, ["kind", "version", "generator", "method", "records", "collection_period", "totals", "groups", "domains"])
    if o.get("kind") != "sourcebook-domain-report" or o.get("version") != 1 or isinstance(o.get("version"), bool):
        r.issue(f"{P}.kind", "bad-version")
    m = r.obj(o.get("method"), f"{P}.method", ["grouping", "public_suffix_list", "private_suffixes", "threshold", "ties", "modality_mode", "size_unit", "size_measure"])
    cp = r.obj(o.get("collection_period"), f"{P}.collection_period", ["from", "to"])
    domains = []
    for i, v in enumerate(r.list(o.get("domains"), f"{P}.domains", 50_000_000)):
        p = f"{P}.domains[{i}]"
        d = r.obj(v, p, ["rank", "domain", "size", "share_percent", "records", "modalities"])
        domain = r.short(d.get("domain"), f"{p}.domain")
        if DOMAIN_RE.match(domain) is None:
            r.issue(f"{p}.domain", "bad-domain")
        rank = int(d["rank"]) if _int_ok(d.get("rank"), 1) else i + 1
        size = r.short(d.get("size"), f"{p}.size")
        records = int(d["records"]) if _int_ok(d.get("records"), 0) else 0
        domains.append(
            {
                "rank": rank,
                "domain": domain,
                "size": size if _SIZE.match(size) else "0",
                "share_percent": r.short(d.get("share_percent"), f"{p}.share_percent"),
                "records": records,
                "modalities": _str_list(r, d.get("modalities"), f"{p}.modalities", 20),
            }
        )
    threshold = r.choice(m.get("threshold"), f"{P}.method.threshold", ["top-10-percent", "sme-top-5-percent-or-1000"]) or "top-10-percent"
    return {
        "kind": "sourcebook-domain-report",
        "version": 1,
        "generator": r.short(o.get("generator"), f"{P}.generator"),
        "method": {
            "grouping": "registrable-domain",
            "public_suffix_list": r.short(m.get("public_suffix_list"), f"{P}.method.public_suffix_list"),
            "private_suffixes": bool(r.bool(m.get("private_suffixes"), f"{P}.method.private_suffixes")),
            "threshold": threshold,
            "ties": r.choice(m.get("ties"), f"{P}.method.ties", ["include", "cut"]) or "include",
            "modality_mode": r.choice(m.get("modality_mode"), f"{P}.method.modality_mode", ["combined", "per-modality"]) or "combined",
            "size_unit": r.short(m.get("size_unit"), f"{P}.method.size_unit"),
            "size_measure": r.short(m.get("size_measure"), f"{P}.method.size_measure"),
        },
        "records": {"read": 0, "counted": 0, "skipped": {"invalid_url": 0, "not_http": 0, "ip_address": 0, "invalid_host": 0, "public_suffix_only": 0, "zero_size": 0}},
        "collection_period": {"from": _month_or_null(r, cp.get("from"), f"{P}.collection_period.from"), "to": _month_or_null(r, cp.get("to"), f"{P}.collection_period.to")},
        "totals": {"domains": len(domains), "size": "0"},
        "groups": [],
        "domains": domains,
    }


def parse_inventory(data: Any) -> Dict[str, Any]:
    """Validates an inventory read from a file. Raises SchemaError."""
    r = Reader()
    top = r.obj(data, "", ["kind", "version", "generator", "datasets", "domain_report"])
    if top.get("kind") != "sourcebook-inventory" or top.get("version") != 1 or isinstance(top.get("version"), bool):
        r.issue("kind", "bad-version")
    datasets = []
    for i, v in enumerate(r.list(top.get("datasets"), "datasets", 100_000)):
        p = f"datasets[{i}]"
        o = r.obj(v, p, ["id", "name", "link", "category", "modalities", "languages", "licenses", "sizes", "collection_period", "publicly_known", "source", "notes"])
        cp = r.obj(o.get("collection_period"), f"{p}.collection_period", ["start", "end"])
        src = r.obj(o.get("source"), f"{p}.source", ["kind", "reference", "revision"])
        sizes = []
        for j, sv in enumerate(r.list(o.get("sizes"), f"{p}.sizes", 100)):
            sp = f"{p}.sizes[{j}]"
            so = r.obj(sv, sp, ["modality", "value", "unit", "basis", "after_preprocessing"])
            value = r.short(so.get("value"), f"{sp}.value")
            if _SIZE.match(value) is None:
                r.issue(f"{sp}.value", "not-string")
            entry = {
                "modality": r.short(so.get("modality"), f"{sp}.modality").lower(),
                "value": value,
                "unit": r.short(so.get("unit"), f"{sp}.unit").lower(),
                "basis": r.short(so.get("basis"), f"{sp}.basis"),
            }
            after = r.bool(so.get("after_preprocessing"), f"{sp}.after_preprocessing")
            entry["after_preprocessing"] = False if after is None else after
            sizes.append(entry)
        link = r.link(o.get("link"), f"{p}.link")
        did = r.short(o.get("id"), f"{p}.id")
        if did == "":
            r.issue(f"{p}.id", "not-string")
        revision = None
        datasets.append(
            {
                "id": did,
                "name": r.text(o.get("name"), f"{p}.name", 1000),
                "link": link,
                "category": r.choice(o.get("category"), f"{p}.category", CATEGORIES),
                "modalities": [m.lower() for m in _str_list(r, o.get("modalities"), f"{p}.modalities", 20)],
                "languages": _str_list(r, o.get("languages"), f"{p}.languages"),
                "licenses": _str_list(r, o.get("licenses"), f"{p}.licenses", 100),
                "sizes": sizes,
                "collection_period": {"start": _month_or_null(r, cp.get("start"), f"{p}.collection_period.start"), "end": _month_or_null(r, cp.get("end"), f"{p}.collection_period.end")},
                "publicly_known": r.bool(o.get("publicly_known"), f"{p}.publicly_known"),
                "source": {
                    "kind": r.short(src.get("kind"), f"{p}.source.kind"),
                    "reference": r.short(src.get("reference"), f"{p}.source.reference"),
                    "revision": revision if (revision := r.short(src.get("revision"), f"{p}.source.revision")) != "" else None,
                },
                "notes": _str_list(r, o.get("notes"), f"{p}.notes", 100),
            }
        )
    report = None if top.get("domain_report") is None else _parse_domain_report(r, top["domain_report"])
    if r.issues:
        raise SchemaError(r.issues)
    return {"kind": "sourcebook-inventory", "version": 1, "generator": GENERATOR, "datasets": datasets, "domain_report": report}


def large_datasets(datasets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Section 2.1: datasets whose size for a modality exceeds 3 % of all publicly available datasets."""
    pub = [d for d in datasets if d["category"] == "public"]
    modalities = sorted({m for d in pub for m in d["modalities"]}, key=lambda s: s.encode("utf-16-be", "surrogatepass"))
    results = []
    for modality in modalities:
        members = [d for d in pub if modality in d["modalities"]]
        sized = []
        missing = []
        for d in members:
            s = next((x for x in d["sizes"] if x["modality"] == modality), None)
            if s is None or _SIZE.match(s["value"]) is None:
                missing.append(d["id"])
            else:
                sized.append((d, int(s["value"]), s["unit"], not s["after_preprocessing"]))
        units = []
        for x in sized:
            if x[2] not in units:
                units.append(x[2])
        total = sum(x[1] for x in sized)
        determined = len(missing) == 0 and len(units) <= 1
        large = []
        if determined:
            chosen = [x for x in sized if x[1] * 100 > total * 3]
            chosen.sort(key=lambda x: (-x[1], x[0]["id"].encode("utf-16-be", "surrogatepass")))
            large = [{"id": x[0]["id"], "name": x[0]["name"], "size": str(x[1]), "share_percent": share_percent(x[1], total)} for x in chosen]
        results.append(
            {
                "modality": modality,
                "unit": units[0] if len(units) == 1 else None,
                "total": str(total),
                "determined": determined,
                "missing": [x[0]["id"] for x in sized] + missing if len(units) > 1 else missing,
                "before_preprocessing": any(x[3] for x in sized),
                "large": large,
            }
        )
    return results


_RANGE_IDS = {
    "text": ["below_1b_tokens", "1b_to_10t_tokens", "above_10t_tokens"],
    "image": ["below_1m_images", "1m_to_1b_images", "above_1b_images"],
    "audio": ["below_10k_hours", "10k_to_1m_hours", "above_1m_hours"],
    "video": ["below_10k_hours", "10k_to_1m_hours", "above_1m_hours"],
}


def size_range_for(modality: str, total: int, unit: str) -> Optional[str]:
    b = SPEC["size_range_bounds"][modality]
    if unit != b["unit"]:
        return None
    ids = _RANGE_IDS[modality]
    if total < int(b["low"]):
        return ids[0]
    if total <= int(b["high"]):
        return ids[1]
    return ids[2]


def _checkbox_modalities(mods: List[str]) -> Dict[str, Any]:
    seen = []
    for m in mods:
        if m not in seen:
            seen.append(m)
    selected = [m for m in CHECKBOX_MODALITIES if m in seen]
    other = sorted((m for m in seen if m not in CHECKBOX_MODALITIES), key=lambda s: s.encode("utf-16-be", "surrogatepass"))
    return {"selected": selected, "other": ", ".join(other)}


def prefill_summary(inventory: Dict[str, Any], base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Fills empty structured fields from an inventory; returns {summary, hints}."""
    s = copy.deepcopy(base if base is not None else empty_summary())
    hints: Dict[str, List[str]] = {}

    def hint(path: str, text: str) -> None:
        hints.setdefault(path, []).append(text)

    ds = inventory["datasets"]

    def by_cat(c: str) -> List[Dict[str, Any]]:
        return [d for d in ds if d["category"] == c]

    all_mods: List[str] = []
    for d in ds:
        for m in d["modalities"]:
            if m not in all_mods:
                all_mods.append(m)
    report = inventory.get("domain_report")
    if report is not None:
        for d in report["domains"]:
            for m in d["modalities"]:
                if m != "unspecified" and m not in all_mods:
                    all_mods.append(m)

    gi = s["general_information"]
    for m in STANDARD_MODALITIES:
        row = gi["modalities"][m]
        if m in all_mods and row["present"] is None:
            row["present"] = True
        elif m in all_mods and row["present"] is False:
            hint(f"general_information.modalities.{m}.present", f"The inventory has {m} data, but this modality is not selected.")
        if row["present"] is True and row["size_range"] is None:
            sizes = [x for x in (next((y for y in d["sizes"] if y["modality"] == m), None) for d in ds) if x is not None]
            with_modality = [d for d in ds if m in d["modalities"]]
            units = []
            for x in sizes:
                if x["unit"] not in units:
                    units.append(x["unit"])
            if len(sizes) == len(with_modality) and len(units) == 1 and len(with_modality) > 0 and report is None:
                total = sum(int(x["value"]) for x in sizes)
                rng = size_range_for(m, total, units[0])
                if rng is not None:
                    row["size_range"] = rng
            if row["size_range"] is None:
                hint(f"general_information.modalities.{m}.size_range", "The inventory has no complete size in the template unit for this modality; estimate the range.")
    other_mods = sorted((m for m in all_mods if m not in STANDARD_MODALITIES and m != "unspecified"), key=lambda x: x.encode("utf-16-be", "surrogatepass"))
    if other_mods:
        hint("general_information.modalities.other", f"Other modalities found in the inventory: {', '.join(other_mods)}.")
    languages = sorted({lang for d in ds for lang in d["languages"]}, key=lambda x: x.encode("utf-16-be", "surrogatepass"))
    if languages:
        hint("general_information.linguistic_characteristics", f"Languages listed in dataset metadata: {', '.join(languages)}.")
    months = [x for d in ds for x in (d["collection_period"]["end"], d["collection_period"]["start"]) if x is not None]
    if report is not None and report["collection_period"]["to"] is not None:
        months.append(report["collection_period"]["to"])
    if months:
        hint("general_information.latest_data_collection.date", f"Latest month found in the inventory: {sorted(months)[-1]}.")

    pub = by_cat("public")
    pd = s["data_sources"]["public_datasets"]
    if pub and pd["used"] is False:
        hint("data_sources.public_datasets.used", f"The inventory has {len(pub)} publicly available datasets, but the answer here is No.")
    if pub and pd["used"] is not False:
        if pd["used"] is None:
            pd["used"] = True
        if not pd["modalities"]["selected"] and pd["modalities"]["other"] == "":
            pd["modalities"] = _checkbox_modalities([m for d in pub for m in d["modalities"]])
        results = large_datasets(ds)
        large_ids = {x["id"] for r in results for x in r["large"]}
        if not pd["large_datasets"]:
            for d in pub:
                if d["id"] in large_ids:
                    pd["large_datasets"].append(
                        {
                            "name": d["name"],
                            "link": d["link"],
                            "description": "",
                            "collection_period": {"start": d["collection_period"]["start"], "end": d["collection_period"]["end"]},
                            "selection_approach": "",
                        }
                    )
        for r in results:
            if not r["determined"]:
                hint("data_sources.public_datasets.large_datasets", f"Large datasets for {r['modality']} could not be determined: sizes are missing or in different units for {', '.join(r['missing'])}.")
            if r["before_preprocessing"]:
                hint("data_sources.public_datasets.large_datasets", f"Some {r['modality']} sizes were not measured after pre-processing; the template asks for sizes after pre-processing.")
        others = [d for d in pub if d["id"] not in large_ids]
        if others:
            hint("data_sources.public_datasets.other_datasets_description", f"Publicly available datasets not listed as large: {', '.join(d['name'] for d in others)}.")

    lic = by_cat("licensed")
    ld = s["data_sources"]["licensed_datasets"]
    if lic and ld["concluded"] is False:
        hint("data_sources.licensed_datasets.concluded", f"The inventory has {len(lic)} licensed datasets, but the answer here is No.")
    if lic and ld["concluded"] is not False:
        if ld["concluded"] is None:
            ld["concluded"] = True
        if not ld["modalities"]["selected"] and ld["modalities"]["other"] == "":
            ld["modalities"] = _checkbox_modalities([m for d in lic for m in d["modalities"]])

    priv = by_cat("private")
    op = s["data_sources"]["other_private_datasets"]
    if priv and op["obtained"] is False:
        hint("data_sources.other_private_datasets.obtained", f"The inventory has {len(priv)} private datasets from third parties, but the answer here is No.")
    if priv and op["obtained"] is not False:
        if op["obtained"] is None:
            op["obtained"] = True
        if not op["modalities"]["selected"] and op["modalities"]["other"] == "":
            op["modalities"] = _checkbox_modalities([m for d in priv for m in d["modalities"]])
        if not op["publicly_known_datasets"]:
            for d in priv:
                if d["publicly_known"] is True:
                    op["publicly_known_datasets"].append({"name": d["name"], "link": d["link"]})
        unknown = [d for d in priv if d["publicly_known"] is not True]
        if unknown:
            hint("data_sources.other_private_datasets.non_publicly_known_description", f"Private datasets not marked as publicly known: {len(unknown)}.")

    cd = s["data_sources"]["crawled_data"]
    if report is not None and cd["crawlers_used"] is False:
        hint("data_sources.crawled_data.crawlers_used", "The inventory has a domain report from crawl logs, but the answer here is No.")
    if report is not None and cd["crawlers_used"] is not False:
        if cd["crawlers_used"] is None:
            cd["crawlers_used"] = True
        if cd["collection_period"]["from"] is None and report["collection_period"]["from"] is not None:
            cd["collection_period"]["from"] = report["collection_period"]["from"]
        if cd["collection_period"]["to"] is None and report["collection_period"]["to"] is not None:
            cd["collection_period"]["to"] = report["collection_period"]["to"]
        if not cd["modalities"]["selected"] and cd["modalities"]["other"] == "":
            cd["modalities"] = _checkbox_modalities([m for d in report["domains"] for m in d["modalities"] if m != "unspecified"])
        if not cd["top_domains"]["domains"]:
            cd["top_domains"]["domains"] = [d["domain"] for d in report["domains"]]
        m = report["method"]
        hint(
            "data_sources.crawled_data.top_domains",
            f"Domain list from the crawl logs: {len(report['domains'])} domains ({m['threshold']}, ties {m['ties']}, sizes in {m['size_unit']}, Public Suffix List {m['public_suffix_list']}).",
        )

    syn = by_cat("synthetic")
    sd = s["data_sources"]["synthetic_data"]
    if syn and sd["created"] is False:
        hint("data_sources.synthetic_data.created", f"The inventory has {len(syn)} synthetic datasets, but the answer here is No.")
    if syn and sd["created"] is not False:
        if sd["created"] is None:
            sd["created"] = True
        if not sd["modalities"]["selected"] and sd["modalities"]["other"] == "":
            sd["modalities"] = _checkbox_modalities([m for d in syn for m in d["modalities"]])
        hint("data_sources.synthetic_data.market_models", f"Synthetic datasets in the inventory: {', '.join(d['name'] for d in syn)}. Name the models used to generate them.")

    oth = by_cat("other")
    if oth and s["data_sources"]["other_sources"]["used"] is False:
        hint("data_sources.other_sources.used", f"The inventory has {len(oth)} datasets of other sources, but the answer here is No.")
    if oth and s["data_sources"]["other_sources"]["used"] is not False:
        if s["data_sources"]["other_sources"]["used"] is None:
            s["data_sources"]["other_sources"]["used"] = True
        hint("data_sources.other_sources.description", f"Other datasets in the inventory: {', '.join(d['name'] for d in oth)}.")
    unc = [d for d in ds if d["category"] is None]
    if unc:
        hint("data_sources", f"Datasets without a category (assign each to one Section of the template): {', '.join(d['name'] for d in unc)}.")
    for d in ds:
        for n in d["notes"]:
            hint("data_sources", f"{d['name']}: {n}")
    return {"summary": s, "hints": hints}
