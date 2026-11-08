# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Checks a summary against the template (port of src/validate/validate.ts)."""

from __future__ import annotations

import datetime
import re
from typing import Any, Dict, List, Optional

from ._spec import FIELDS, KEY_DATES, MESSAGES, STANDARD_MODALITIES, field
from .inventory import large_datasets
from .schema import add_months, is_iso_date

MODALITY_NAMES = {"text": "Text", "image": "Image", "audio": "Audio", "video": "Video"}


def format_message(code: str, values: Dict[str, str]) -> str:
    return re.sub(r"\{(label|section|name|detail)\}", lambda m: values.get(m.group(1), ""), MESSAGES[code])


def _filled(s: str) -> bool:
    return s.strip(" \t\n\r\u000b\u000c\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff") != ""


def _selection_filled(m: Dict[str, Any]) -> bool:
    return len(m["selected"]) > 0 or _filled(m["other"])


def _section_key(s: str) -> str:
    return ".".join(p.rjust(3, "0") for p in s.split("."))


def validate_summary(summary: Dict[str, Any], as_of: Optional[str] = None, inventory: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Validates a summary; returns {ok, errors, warnings, legacy_model, issues}."""
    if as_of is not None and not is_iso_date(as_of):
        raise ValueError("as_of must be a date as YYYY-MM-DD.")
    as_of = as_of or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    issues: List[Dict[str, str]] = []
    gi = summary["general_information"]
    ds = summary["data_sources"]
    dp = summary["data_processing"]
    # Notice point 33: gaps only for models placed before 2 August 2025; every listed model must qualify.
    dates = gi["model"]["placement_dates"]
    legacy = len(dates) > 0 and all(p["date"] is not None and p["date"] < KEY_DATES["obligationsApply"] for p in dates)
    gap_fields = {g["field"] for g in summary["information_gaps"]}

    def add(severity: str, code: str, section: str, path: str, values: Optional[Dict[str, str]] = None) -> None:
        v = {"section": section, **(values or {})}
        issues.append({"severity": severity, "code": code, "section": section, "path": path, "message": format_message(code, v)})

    def need(fid: str, present: bool, path: Optional[str] = None) -> None:
        if present:
            return
        f = field(fid)
        if fid in gap_fields and legacy:
            add("info", "gap-stated", f["section"], path or f["path"], {"label": f["label"]})
            return
        add("error", "missing", f["section"], path or f["path"], {"label": f["label"]})

    def where_applicable(fid: str, present: bool) -> None:
        if present:
            return
        f = field(fid)
        if fid in gap_fields and legacy:
            add("info", "gap-stated", f["section"], f["path"], {"label": f["label"]})
            return
        add("warning", "missing-where-applicable", f["section"], f["path"], {"label": f["label"]})

    def not_after_no(fid: str, present: bool) -> None:
        if not present:
            return
        f = field(fid)
        add("warning", "inconsistent", f["section"], f["path"], {"label": f["label"]})

    sv = summary["summary_version"]
    need("summary_version", _filled(sv["version"]), "summary_version.version")
    for i, p in enumerate(sv["previous_versions"]):
        if not _filled(p["link"]):
            add("error", "previous-version-link", "0", f"summary_version.previous_versions[{i}].link", {"name": f"#{i + 1}" if p["version"] == "" else p["version"]})
    if summary["last_update"] is None:
        need("last_update", False)
    elif summary["last_update"] > as_of:
        add("warning", "last-update-future", "0", "last_update", {"name": summary["last_update"], "detail": as_of})

    # 1.1
    need("provider", _filled(gi["provider"]["name_and_contact_details"]))
    ar = gi["provider"]["authorised_representative"]
    ar_path = field("authorised_representative")["path"]
    if ar["applicable"] is None:
        need("authorised_representative", False, f"{ar_path}.applicable")
    elif ar["applicable"]:
        need("authorised_representative", _filled(ar["name_and_contact_details"]), f"{ar_path}.name_and_contact_details")
    else:
        if ar["not_applicable_reason"] is None:
            add("error", "authorised-representative-reason", "1.1", f"{ar_path}.not_applicable_reason")
        not_after_no("authorised_representative", _filled(ar["name_and_contact_details"]))

    # 1.2
    models = gi["model"]["versioned_model_names"]
    vm_path = field("versioned_model_names")["path"]
    need("versioned_model_names", any(_filled(m["name"]) for m in models))
    names: List[str] = []
    for i, m in enumerate(models):
        if not _filled(m["name"]):
            add("error", "model-name-missing", "1.2", f"{vm_path}[{i}].name")
        elif m["name"] in names:
            add("error", "model-name-duplicate", "1.2", f"{vm_path}[{i}].name", {"name": m["name"]})
        else:
            names.append(m["name"])
    dep = gi["model"]["model_dependencies"]
    dep_path = field("model_dependencies")["path"]
    if dep["is_modification"] is None:
        need("model_dependencies", False, f"{dep_path}.is_modification")
    elif dep["is_modification"]:
        need("model_dependencies", len(dep["models"]) > 0, f"{dep_path}.models")
        for i, m in enumerate(dep["models"]):
            if not _filled(m["name"]):
                add("error", "dependency-name-missing", "1.2", f"{dep_path}.models[{i}].name")
    else:
        not_after_no("model_dependencies", len(dep["models"]) > 0)
    dated: Dict[str, Optional[str]] = {}
    for p in gi["model"]["placement_dates"]:
        dated[p["model"]] = p["date"]
    pd_path = field("placement_dates")["path"]
    need("placement_dates", any(p["date"] is not None for p in gi["model"]["placement_dates"]))
    for n in names:
        if dated.get(n) is None:
            if not ("placement_dates" in gap_fields and legacy):
                add("error", "placement-date-missing", "1.2", pd_path, {"name": n})
    for i, p in enumerate(gi["model"]["placement_dates"]):
        if _filled(p["model"]) and p["model"] not in names:
            add("error", "placement-date-unknown-model", "1.2", f"{pd_path}[{i}].model", {"name": p["model"]})

    # 1.3
    mods = gi["modalities"]
    present: List[str] = []
    for m in STANDARD_MODALITIES:
        row = mods[m]
        path = f"general_information.modalities.{m}"
        if row["present"] is True:
            present.append(m)
            alt_ok = m == "text" and _filled(mods["text"]["size_other_unit"])
            if row["size_range"] is None and not alt_ok:
                if not ("modalities" in gap_fields and legacy):
                    add("error", "missing-size", "1.3", f"{path}.size_range", {"name": MODALITY_NAMES[m], "detail": " or give the size in another unit" if m == "text" else ""})
            if not _filled(row["types_of_content"]) and not ("modalities" in gap_fields and legacy):
                add("error", "missing-types", "1.3", f"{path}.types_of_content", {"name": MODALITY_NAMES[m]})
        elif row["size_range"] is not None or _filled(row["types_of_content"]) or (m == "text" and _filled(mods["text"]["size_other_unit"])):
            add("warning", "inconsistent", "1.3", f"{path}.present", {"label": MODALITY_NAMES[m]})
    for i, o in enumerate(mods["other"]):
        if not _filled(o["modality"]) or not _filled(o["approximate_size"]) or not _filled(o["types_of_content"]):
            add("error", "other-modality-incomplete", "1.3", f"general_information.modalities.other[{i}]", {"name": f"#{i + 1}" if o["modality"] == "" else o["modality"]})
    if len(present) == 0 and len(mods["other"]) == 0:
        if "modalities" in gap_fields and legacy:
            add("info", "gap-stated", "1.3", field("modalities")["path"], {"label": field("modalities")["label"]})
        else:
            add("error", "no-modality", "1.3", field("modalities")["path"])
    ldc = gi["latest_data_collection"]
    ldc_path = field("latest_data_collection")["path"]
    need("latest_data_collection", ldc["date"] is not None, f"{ldc_path}.date")
    need("latest_data_collection", ldc["continuous_training"] is not None, f"{ldc_path}.continuous_training")
    where_applicable("linguistic_characteristics", _filled(gi["linguistic_characteristics"]))
    where_applicable("other_characteristics", _filled(gi["other_characteristics"]))
    if ldc["continuous_training"] is True and summary["last_update"] is not None and add_months(summary["last_update"], 6) < as_of:
        add("warning", "update-due", "0", "last_update", {"name": summary["last_update"]})

    overview = set(present) | ({"other"} if len(mods["other"]) > 0 else set())

    def check_modalities(section_no: str, path: str, m: Dict[str, Any]) -> None:
        for x in m["selected"]:
            if x not in overview:
                add("warning", "modality-not-in-overview", section_no, path, {"name": MODALITY_NAMES.get(x, x)})
        if _filled(m["other"]) and "other" not in overview:
            add("warning", "modality-not-in-overview", section_no, path, {"name": "Other"})

    # 2.1
    pd = ds["public_datasets"]
    large_path = field("large_public_datasets")["path"]
    need("public_datasets_used", pd["used"] is not None)
    if pd["used"] is True:
        need("public_datasets_modalities", _selection_filled(pd["modalities"]))
        check_modalities("2.1", field("public_datasets_modalities")["path"], pd["modalities"])
        if len(pd["large_datasets"]) == 0 and not _filled(pd["other_datasets_description"]):
            if "large_public_datasets" in gap_fields and legacy:
                add("info", "gap-stated", "2.1", large_path, {"label": field("large_public_datasets")["label"]})
            else:
                add("error", "public-datasets-empty", "2.1", large_path)
        for i, d in enumerate(pd["large_datasets"]):
            p = f"{large_path}[{i}]"
            if not _filled(d["name"]):
                add("error", "large-dataset-name-missing", "2.1", f"{p}.name")
            elif not _filled(d["link"]) and not (_filled(d["description"]) and d["collection_period"]["start"] is not None and d["collection_period"]["end"] is not None):
                add("error", "large-dataset-incomplete", "2.1", p, {"name": d["name"]})
    elif pd["used"] is False:
        not_after_no("public_datasets_modalities", _selection_filled(pd["modalities"]))
        not_after_no("large_public_datasets", len(pd["large_datasets"]) > 0)
        not_after_no("other_public_datasets", _filled(pd["other_datasets_description"]))

    # 2.2.1
    lic = ds["licensed_datasets"]
    need("licensed_datasets_concluded", lic["concluded"] is not None)
    if lic["concluded"] is True:
        need("licensed_datasets_modalities", _selection_filled(lic["modalities"]))
        check_modalities("2.2.1", field("licensed_datasets_modalities")["path"], lic["modalities"])
    elif lic["concluded"] is False:
        not_after_no("licensed_datasets_modalities", _selection_filled(lic["modalities"]))

    # 2.2.2
    op = ds["other_private_datasets"]
    known_path = field("publicly_known_private_datasets")["path"]
    need("other_private_datasets_obtained", op["obtained"] is not None)
    if op["obtained"] is True:
        need("other_private_datasets_modalities", _selection_filled(op["modalities"]))
        check_modalities("2.2.2", field("other_private_datasets_modalities")["path"], op["modalities"])
        if len(op["publicly_known_datasets"]) == 0 and not _filled(op["non_publicly_known_description"]):
            if "non_publicly_known_private_datasets" in gap_fields and legacy:
                f = field("non_publicly_known_private_datasets")
                add("info", "gap-stated", "2.2.2", f["path"], {"label": f["label"]})
            else:
                add("error", "private-datasets-empty", "2.2.2", known_path)
        for i, d in enumerate(op["publicly_known_datasets"]):
            if not _filled(d["name"]):
                add("error", "named-entry-missing", "2.2.2", f"{known_path}[{i}].name", {"label": field("publicly_known_private_datasets")["label"]})
    elif op["obtained"] is False:
        not_after_no("other_private_datasets_modalities", _selection_filled(op["modalities"]))
        not_after_no("publicly_known_private_datasets", len(op["publicly_known_datasets"]) > 0)
        not_after_no("non_publicly_known_private_datasets", _filled(op["non_publicly_known_description"]))

    # 2.3
    cd = ds["crawled_data"]
    period_path = field("crawl_period")["path"]
    top_path = field("top_domains")["path"]
    need("crawlers_used", cd["crawlers_used"] is not None)
    if cd["crawlers_used"] is True:
        need("crawler_names", len(cd["crawler_names"]) > 0)
        need("crawler_purposes", _filled(cd["purposes"]))
        need("crawler_behaviour", _filled(cd["crawler_behaviour"]))
        need("crawl_period", cd["collection_period"]["from"] is not None, f"{period_path}.from")
        need("crawl_period", cd["collection_period"]["to"] is not None, f"{period_path}.to")
        cp = cd["collection_period"]
        if cp["from"] is not None and cp["to"] is not None and cp["from"] > cp["to"]:
            add("error", "period-order", "2.3", period_path, {"name": cp["from"], "detail": cp["to"]})
        need("crawled_content", _filled(cd["content_description"]))
        need("crawled_modalities", _selection_filled(cd["modalities"]))
        check_modalities("2.3", field("crawled_modalities")["path"], cd["modalities"])
        if len(cd["top_domains"]["domains"]) == 0 and not _filled(cd["top_domains"]["access_information"]):
            if "top_domains" in gap_fields and legacy:
                add("info", "gap-stated", "2.3", top_path, {"label": field("top_domains")["label"]})
            else:
                add("error", "top-domains-empty", "2.3", top_path)
    elif cd["crawlers_used"] is False:
        not_after_no("crawler_names", len(cd["crawler_names"]) > 0)
        not_after_no("crawler_purposes", _filled(cd["purposes"]))
        not_after_no("crawler_behaviour", _filled(cd["crawler_behaviour"]))
        not_after_no("crawl_period", cd["collection_period"]["from"] is not None or cd["collection_period"]["to"] is not None)
        not_after_no("crawled_content", _filled(cd["content_description"]))
        not_after_no("crawled_modalities", _selection_filled(cd["modalities"]))
        not_after_no("top_domains", len(cd["top_domains"]["domains"]) > 0 or _filled(cd["top_domains"]["access_information"]))

    # 2.4
    ud = ds["user_data"]
    need("user_data_model_interactions", ud["from_model_interactions"] is not None)
    need("user_data_other_services", ud["from_other_services"] is not None)
    if ud["from_other_services"] is True:
        need("user_data_services", _filled(ud["services_description"]))
    elif ud["from_other_services"] is False:
        not_after_no("user_data_services", _filled(ud["services_description"]))
    if ud["from_model_interactions"] is True or ud["from_other_services"] is True:
        need("user_data_modalities", _selection_filled(ud["modalities"]))
        check_modalities("2.4", field("user_data_modalities")["path"], ud["modalities"])
    elif ud["from_model_interactions"] is False and ud["from_other_services"] is False:
        not_after_no("user_data_modalities", _selection_filled(ud["modalities"]))

    # 2.5
    sy = ds["synthetic_data"]
    market_path = field("synthetic_market_models")["path"]
    need("synthetic_data_created", sy["created"] is not None)
    if sy["created"] is True:
        need("synthetic_data_modalities", _selection_filled(sy["modalities"]))
        check_modalities("2.5", field("synthetic_data_modalities")["path"], sy["modalities"])
        if len(sy["market_models"]) == 0 and not _filled(sy["other_models_information"]):
            if ("synthetic_market_models" in gap_fields or "synthetic_other_models" in gap_fields) and legacy:
                fid = "synthetic_market_models" if "synthetic_market_models" in gap_fields else "synthetic_other_models"
                add("info", "gap-stated", "2.5", field(fid)["path"], {"label": field(fid)["label"]})
            else:
                add("error", "synthetic-models-empty", "2.5", market_path)
        for i, m in enumerate(sy["market_models"]):
            if not _filled(m["name"]):
                add("error", "named-entry-missing", "2.5", f"{market_path}[{i}].name", {"label": field("synthetic_market_models")["label"]})
    elif sy["created"] is False:
        not_after_no("synthetic_data_modalities", _selection_filled(sy["modalities"]))
        not_after_no("synthetic_market_models", len(sy["market_models"]) > 0)
        not_after_no("synthetic_other_models", _filled(sy["other_models_information"]))

    # 2.6
    osrc = ds["other_sources"]
    need("other_sources_used", osrc["used"] is not None)
    if osrc["used"] is True:
        need("other_sources_description", _filled(osrc["description"]))
    elif osrc["used"] is False:
        not_after_no("other_sources_description", _filled(osrc["description"]))

    # 3.1, 3.2
    need("code_of_practice_signatory", dp["tdm_reservations"]["code_of_practice_signatory"] is not None)
    need("tdm_measures", _filled(dp["tdm_reservations"]["measures"]))
    need("illegal_content_measures", _filled(dp["illegal_content"]["measures"]))

    # Information gaps.
    known = {f["id"]: f for f in FIELDS}
    for i, g in enumerate(summary["information_gaps"]):
        f = known.get(g["field"])
        path = f"information_gaps[{i}]"
        if f is None:
            add("error", "gap-unknown-field", "0", f"{path}.field", {"name": "(empty)" if g["field"] == "" else g["field"]})
            continue
        if not _filled(g["justification"]):
            add("error", "gap-no-justification", f["section"], f"{path}.justification", {"label": f["label"]})
        if f["requirement"] == "optional":
            add("warning", "gap-optional-field", f["section"], f"{path}.field", {"label": f["label"]})
        elif not legacy:
            add("warning", "gap-not-allowed", f["section"], f"{path}.field", {"label": f["label"]})
    if legacy:
        add("info", "legacy-model", "1.2", pd_path)

    if inventory is not None:
        if pd["used"] is not False:
            listed_names = {d["name"].lower() for d in pd["large_datasets"]}
            listed_links = {d["link"] for d in pd["large_datasets"] if d["link"] != ""}
            for r in large_datasets(inventory["datasets"]):
                if not r["determined"]:
                    add("warning", "large-datasets-undetermined", "2.1", large_path, {"name": r["modality"]})
                    continue
                for item in r["large"]:
                    d = next((x for x in inventory["datasets"] if x["id"] == item["id"]), None)
                    if d is None:
                        continue
                    if d["name"].lower() not in listed_names and not (d["link"] != "" and d["link"] in listed_links):
                        add("error", "large-dataset-not-listed", "2.1", large_path, {"name": d["name"], "detail": r["modality"]})
        report = inventory.get("domain_report")
        if report is not None and cd["crawlers_used"] is not False and len(cd["top_domains"]["domains"]) > 0:
            listed = set(cd["top_domains"]["domains"])
            for d in report["domains"]:
                if d["domain"] not in listed:
                    add("error", "domain-not-listed", "2.3", top_path, {"name": d["domain"], "detail": str(d["rank"])})

    order = {"error": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: (order[i["severity"]], _section_key(i["section"])))
    errors = sum(1 for i in issues if i["severity"] == "error")
    warnings = sum(1 for i in issues if i["severity"] == "warning")
    return {"ok": errors == 0, "errors": errors, "warnings": warnings, "legacy_model": legacy, "issues": issues}
