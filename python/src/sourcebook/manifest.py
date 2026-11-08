# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""JSON and CSV dataset manifests (port of src/collect/manifest.ts).

Parquet footers are read by the TypeScript command line tool only; in Python
use ``pyarrow.parquet.ParquetFile(path).metadata`` and write a JSON manifest.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .inventory import parse_inventory
from .readers import CrawlLogError, ReaderLimits, read_csv_rows
from .schema import Reader, SchemaError

_CSV_COLUMNS = ("name", "link", "category", "modality", "size", "unit", "after_preprocessing", "languages", "licenses", "collection_start", "collection_end", "publicly_known")


def datasets_from_json_manifest(data: Any, reference: str) -> List[Dict[str, Any]]:
    r = Reader()
    top = r.obj(data, "", ["datasets"])
    if r.issues:
        raise SchemaError(r.issues)
    items = r.list(top.get("datasets"), "datasets", 100_000)
    if r.issues:
        raise SchemaError(r.issues)
    datasets = []
    for i, d in enumerate(items):
        if not isinstance(d, dict):
            datasets.append(d)
            continue
        sizes = d.get("sizes")
        if isinstance(sizes, list):
            new_sizes = []
            for s in sizes:
                if not isinstance(s, dict):
                    new_sizes.append(s)
                    continue
                v = s.get("value")
                if isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer() and 0 <= v <= 2**53 - 1:
                    v = str(int(v))
                new_sizes.append({**s, "value": v, "basis": s["basis"] if "basis" in s else "manifest"})
            sizes = new_sizes
        name = d.get("name")
        did = d["id"] if "id" in d else f"manifest:{name}" if isinstance(name, str) else f"manifest:#{i + 1}"
        entry = dict(d)
        entry["id"] = did
        entry["sizes"] = sizes
        entry["source"] = {"kind": "manifest-json", "reference": reference[:1000], "revision": None}
        if "sizes" not in d:
            entry["sizes"] = None
        datasets.append(entry)
    return parse_inventory({"kind": "sourcebook-inventory", "version": 1, "datasets": datasets, "domain_report": None})["datasets"]


def _bool(v: str) -> Any:
    t = v.strip(" \t\n\r\v\f").lower()
    if t in ("true", "yes"):
        return True
    if t in ("false", "no"):
        return False
    return None


def datasets_from_csv_manifest(source: Iterable[bytes], reference: str) -> List[Dict[str, Any]]:
    header = None
    by_name: Dict[str, Dict[str, Any]] = {}
    for row, fields in read_csv_rows(source, ",", ReaderLimits(max_records=1_000_000)):
        if header is None:
            header = [f.strip(" \t\n\r\v\f").lower() for f in fields]
            for h in header:
                if h not in _CSV_COLUMNS:
                    raise CrawlLogError("unknown-column", f"row {row}", f'Unknown column "{h[:64]}".')
            if "name" not in header:
                raise CrawlLogError("missing-column", f"row {row}", 'The header has no "name" column.')
            continue
        if len(fields) == 1 and fields[0] == "":
            continue

        hdr: List[str] = header

        def cell(c: str) -> str:
            i = hdr.index(c) if c in hdr else -1
            return fields[i].strip(" \t\n\r\v\f") if 0 <= i < len(fields) else ""

        name = cell("name")
        if name == "":
            raise CrawlLogError("missing-name", f"row {row}", "A row has no name.")
        d = by_name.get(name)
        if d is None:
            category = cell("category").lower()
            d = {
                "id": f"manifest:{name}",
                "name": name,
                "link": cell("link"),
                "category": None if category == "" else category,
                "modalities": [],
                "languages": [x.strip(" \t\n\r\v\f") for x in cell("languages").split(";") if x.strip(" \t\n\r\v\f") != ""],
                "licenses": [x.strip(" \t\n\r\v\f") for x in cell("licenses").split(";") if x.strip(" \t\n\r\v\f") != ""],
                "sizes": [],
                "collection_period": {"start": cell("collection_start") or None, "end": cell("collection_end") or None},
                "publicly_known": _bool(cell("publicly_known")),
                "source": {"kind": "manifest-csv", "reference": reference[:1000], "revision": None},
                "notes": [],
            }
            by_name[name] = d
        modality = cell("modality").lower()
        if modality != "":
            if modality not in d["modalities"]:
                d["modalities"].append(modality)
            if cell("size") != "":
                after = _bool(cell("after_preprocessing"))
                d["sizes"].append({"modality": modality, "value": cell("size"), "unit": cell("unit").lower() or "bytes", "basis": "manifest", "after_preprocessing": False if after is None else after})
    return parse_inventory({"kind": "sourcebook-inventory", "version": 1, "datasets": list(by_name.values()), "domain_report": None})["datasets"]
