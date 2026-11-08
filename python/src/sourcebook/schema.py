# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Summary files: structural checks, defaults and loading (port of src/schema)."""

from __future__ import annotations

import calendar
import json
import re
from typing import Any, Dict, List, Optional, Sequence

from ._spec import CHECKBOX_MODALITIES, FORMAT_VERSION, SCHEMA_MESSAGES, SIZE_RANGES
from .yaml_safe import DEFAULT_YAML_LIMITS, parse_yaml

CONTROL_CHARS = re.compile("[\u0000-\u0008\u000b-\u001f\u007f-\u009f]")
HIDDEN_CHARS = re.compile("[\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]")
LINK_RE = re.compile(
    "^https?://[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s<>\"'`{}|\\\\^\u0000-\u001f\u007f-\u00a0\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]*)?\\Z"
)
DOMAIN_RE = re.compile(r"^(?=.{1,253}\Z)(?:[a-z0-9_-]{1,63}\.)+[a-z0-9-]{1,63}\Z")
DATE_RE = re.compile(r"^([0-9]{4})-([0-9]{2})-([0-9]{2})\Z")
MONTH_RE = re.compile(r"^([0-9]{4})-(0[1-9]|1[0-2])\Z")
_WS = "\t\n \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000"
_JS_SPACE = re.compile("[\t\n\u000b\u000c\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]")

# Python strings hold unpaired surrogates as single code points in this range.
_SURROGATE = re.compile("[\ud800-\udfff]")

MAX_TEXT = 100_000
MAX_SHORT = 1_000
MAX_LINK = 2_048
MAX_LIST = 10_000
MAX_DOMAINS_IN_SUMMARY = 100_000
MAX_JSON_DEPTH = 64


def js_len(s: str) -> int:
    """Length in UTF-16 code units, as JavaScript counts it."""
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


_INDEX_KEY = re.compile(r"^(0|[1-9][0-9]*)\Z")


def js_keys(d: Dict[str, Any]) -> List[str]:
    """Keys in the order JavaScript enumerates them: array-index keys first, ascending."""
    index = sorted((k for k in d if _INDEX_KEY.match(k) and int(k) < 2**32 - 1), key=int)
    return index + [k for k in d if not (_INDEX_KEY.match(k) and int(k) < 2**32 - 1)]


def is_iso_date(value: str) -> bool:
    m = DATE_RE.match(value)
    if m is None:
        return False
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 1900 or y > 2999 or mo < 1 or mo > 12 or d < 1:
        return False
    return d <= calendar.monthrange(y, mo)[1]


def is_iso_month(value: str) -> bool:
    m = MONTH_RE.match(value)
    return m is not None and 1900 <= int(m.group(1)) <= 2999


def is_link(value: str) -> bool:
    if js_len(value) > MAX_LINK or LINK_RE.match(value) is None:
        return False
    port = re.match(r"^https?://[^/?#:]+:([0-9]+)", value)
    return port is None or int(port.group(1)) <= 65535


def add_months(date: str, months: int) -> str:
    m = DATE_RE.match(date)
    if m is None:
        raise ValueError("Not an ISO date.")
    total = int(m.group(1)) * 12 + (int(m.group(2)) - 1) + months
    y, mo = divmod(total, 12)
    mo += 1
    d = min(int(m.group(3)), calendar.monthrange(y, mo)[1])
    return f"{y:04d}-{mo:02d}-{d:02d}"


def trim_space(s: str) -> str:
    return s.strip(_WS)


class SchemaError(ValueError):
    """Raised when an input file does not have the expected structure."""

    def __init__(self, issues: List[Dict[str, str]]) -> None:
        n = len(issues)
        super().__init__(f"The file has {n} structural problem{'' if n == 1 else 's'}.")
        self.issues = issues


def _join(path: str, key: str) -> str:
    return key if path == "" else f"{path}.{key}"


def _at(path: str, i: int) -> str:
    return f"{path}[{i}]"


class Reader:
    """Records structural issues instead of raising (port of the TypeScript Reader)."""

    def __init__(self) -> None:
        self.issues: List[Dict[str, str]] = []

    def issue(self, path: str, code: str) -> None:
        self.issues.append({"path": path, "code": code, "message": SCHEMA_MESSAGES[code]})

    def obj(self, value: Any, path: str, keys: Sequence[str]) -> Dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            self.issue(path, "not-object")
            return {}
        for k in js_keys(value):
            if k not in keys:
                self.issue(_join(path, k), "unknown-key")
        return {k: value[k] for k in keys if k in value}

    def list(self, value: Any, path: str, max_len: int = MAX_LIST) -> List[Any]:
        if value is None:
            return []
        if not isinstance(value, list):
            self.issue(path, "not-list")
            return []
        if len(value) > max_len:
            self.issue(path, "too-many")
            return value[:max_len]
        return value

    def text(self, value: Any, path: str, max_len: int = MAX_TEXT) -> str:
        if value is None:
            return ""
        if not isinstance(value, str):
            self.issue(path, "not-string")
            return ""
        s = value
        if js_len(s) > max_len:
            self.issue(path, "too-long")
            return ""
        if CONTROL_CHARS.search(s.replace("\r\n", "\n")):
            self.issue(path, "control-character")
            return ""
        if HIDDEN_CHARS.search(s):
            self.issue(path, "hidden-character")
            return ""
        if _SURROGATE.search(s):
            self.issue(path, "lone-surrogate")
            return ""
        return trim_space(s.replace("\r\n", "\n"))

    def short(self, value: Any, path: str) -> str:
        s = self.text(value, path, MAX_SHORT)
        if "\n" in s:
            self.issue(path, "control-character")
            return ""
        return s

    def bool(self, value: Any, path: str) -> Optional[bool]:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        self.issue(path, "not-boolean")
        return None

    def link(self, value: Any, path: str) -> str:
        s = self.text(value, path, MAX_LINK)
        if s == "":
            return ""
        if not is_link(s):
            self.issue(path, "bad-link")
            return ""
        return s

    def date(self, value: Any, path: str) -> Optional[str]:
        if value is None or value == "":
            return None
        if not isinstance(value, str) or not is_iso_date(value):
            self.issue(path, "bad-date")
            return None
        return value

    def month(self, value: Any, path: str) -> Optional[str]:
        if value is None or value == "":
            return None
        if not isinstance(value, str) or not is_iso_month(value):
            self.issue(path, "bad-month")
            return None
        return value

    def choice(self, value: Any, path: str, choices: Sequence[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if isinstance(value, str) and value in choices:
            return value
        self.issue(path, "bad-choice")
        return None


def _selection(r: Reader, value: Any, path: str) -> Dict[str, Any]:
    o = r.obj(value, path, ["selected", "other"])
    selected: List[str] = []
    sp = _join(path, "selected")
    for i, v in enumerate(r.list(o.get("selected"), sp, len(CHECKBOX_MODALITIES) + 1)):
        c = r.choice(v, _at(sp, i), CHECKBOX_MODALITIES)
        if c is None:
            continue
        if c in selected:
            r.issue(_at(sp, i), "duplicate")
        else:
            selected.append(c)
    selected.sort(key=CHECKBOX_MODALITIES.index)
    return {"selected": selected, "other": r.short(o.get("other"), _join(path, "other"))}


def _named_links(r: Reader, value: Any, path: str, link_key: str) -> List[Dict[str, str]]:
    out = []
    for i, v in enumerate(r.list(value, path)):
        p = _at(path, i)
        o = r.obj(v, p, ["name", link_key])
        out.append({"name": r.short(o.get("name"), _join(p, "name")), "link": r.link(o.get(link_key), _join(p, link_key))})
    return out


def _standard_row(r: Reader, value: Any, path: str, modality: str) -> Dict[str, Any]:
    o = r.obj(value, path, ["present", "size_range", "types_of_content"])
    return {
        "present": r.bool(o.get("present"), _join(path, "present")),
        "size_range": r.choice(o.get("size_range"), _join(path, "size_range"), [x["id"] for x in SIZE_RANGES[modality]]),
        "types_of_content": r.text(o.get("types_of_content"), _join(path, "types_of_content")),
    }


def _text_row(r: Reader, value: Any, path: str) -> Dict[str, Any]:
    o = r.obj(value, path, ["present", "size_range", "size_other_unit", "types_of_content"])
    return {
        "present": r.bool(o.get("present"), _join(path, "present")),
        "size_range": r.choice(o.get("size_range"), _join(path, "size_range"), [x["id"] for x in SIZE_RANGES["text"]]),
        "size_other_unit": r.short(o.get("size_other_unit"), _join(path, "size_other_unit")),
        "types_of_content": r.text(o.get("types_of_content"), _join(path, "types_of_content")),
    }


def _month_or_unknown(r: Reader, value: Any, path: str) -> Optional[str]:
    if value is None or value == "":
        return None
    if value == "not known":
        return "not known"
    if not isinstance(value, str) or not is_iso_month(value):
        r.issue(path, "bad-month-or-unknown")
        return None
    return value


def parse_summary(data: Any) -> Dict[str, Any]:
    """Converts parsed YAML or JSON into a normalised summary (a dict).

    Raises SchemaError listing every structural problem.
    """
    r = Reader()
    top = r.obj(data, "", ["sourcebook", "summary_version", "last_update", "general_information", "data_sources", "data_processing", "information_gaps"])
    if not isinstance(data, dict):
        raise SchemaError(r.issues or [{"path": "", "code": "not-object", "message": SCHEMA_MESSAGES["not-object"]}])
    sb = top.get("sourcebook")
    if not (isinstance(sb, (int, float)) and not isinstance(sb, bool) and sb == FORMAT_VERSION):
        r.issue("sourcebook", "bad-version")

    sv = r.obj(top.get("summary_version"), "summary_version", ["version", "previous_versions"])
    previous = []
    for i, v in enumerate(r.list(sv.get("previous_versions"), "summary_version.previous_versions")):
        p = _at("summary_version.previous_versions", i)
        o = r.obj(v, p, ["version", "link"])
        previous.append({"version": r.short(o.get("version"), _join(p, "version")), "link": r.link(o.get("link"), _join(p, "link"))})

    G = "general_information"
    gi = r.obj(top.get("general_information"), G, ["provider", "model", "modalities", "latest_data_collection", "linguistic_characteristics", "other_characteristics", "additional_comments"])
    pv = r.obj(gi.get("provider"), f"{G}.provider", ["name_and_contact_details", "authorised_representative"])
    ar_path = f"{G}.provider.authorised_representative"
    ar = r.obj(pv.get("authorised_representative"), ar_path, ["applicable", "name_and_contact_details", "not_applicable_reason"])
    authorised = {
        "applicable": r.bool(ar.get("applicable"), _join(ar_path, "applicable")),
        "name_and_contact_details": r.text(ar.get("name_and_contact_details"), _join(ar_path, "name_and_contact_details")),
        "not_applicable_reason": r.choice(ar.get("not_applicable_reason"), _join(ar_path, "not_applicable_reason"), ["established_in_union", "open_source_exemption"]),
    }
    md = r.obj(gi.get("model"), f"{G}.model", ["versioned_model_names", "model_dependencies", "placement_dates"])
    vm_path = f"{G}.model.versioned_model_names"
    versioned = []
    for i, v in enumerate(r.list(md.get("versioned_model_names"), vm_path)):
        p = _at(vm_path, i)
        o = r.obj(v, p, ["name", "documentation_links"])
        name = r.short(o.get("name"), _join(p, "name"))
        dp = _join(p, "documentation_links")
        links = [r.link(link, _at(dp, j)) for j, link in enumerate(r.list(o.get("documentation_links"), dp, 100))]
        versioned.append({"name": name, "documentation_links": [x for x in links if x != ""]})
    dep_path = f"{G}.model.model_dependencies"
    dep = r.obj(md.get("model_dependencies"), dep_path, ["is_modification", "models"])
    dep_models = [{"name": x["name"], "summary_link": x["link"]} for x in _named_links(r, dep.get("models"), _join(dep_path, "models"), "summary_link")]
    pd_path = f"{G}.model.placement_dates"
    placement = []
    for i, v in enumerate(r.list(md.get("placement_dates"), pd_path)):
        p = _at(pd_path, i)
        o = r.obj(v, p, ["model", "date"])
        placement.append({"model": r.short(o.get("model"), _join(p, "model")), "date": r.date(o.get("date"), _join(p, "date"))})
    m_path = f"{G}.modalities"
    mo = r.obj(gi.get("modalities"), m_path, ["text", "image", "audio", "video", "other"])
    other = []
    op_path = _join(m_path, "other")
    for i, v in enumerate(r.list(mo.get("other"), op_path, 100)):
        p = _at(op_path, i)
        o = r.obj(v, p, ["modality", "approximate_size", "types_of_content"])
        other.append(
            {
                "modality": r.short(o.get("modality"), _join(p, "modality")),
                "approximate_size": r.short(o.get("approximate_size"), _join(p, "approximate_size")),
                "types_of_content": r.text(o.get("types_of_content"), _join(p, "types_of_content")),
            }
        )
    ld_path = f"{G}.latest_data_collection"
    ld = r.obj(gi.get("latest_data_collection"), ld_path, ["date", "continuous_training"])

    D = "data_sources"
    ds = r.obj(top.get("data_sources"), D, ["public_datasets", "licensed_datasets", "other_private_datasets", "crawled_data", "user_data", "synthetic_data", "other_sources"])
    pds_path = f"{D}.public_datasets"
    pds = r.obj(ds.get("public_datasets"), pds_path, ["used", "modalities", "large_datasets", "other_datasets_description", "additional_comments"])
    large = []
    lp = _join(pds_path, "large_datasets")
    for i, v in enumerate(r.list(pds.get("large_datasets"), lp)):
        p = _at(lp, i)
        o = r.obj(v, p, ["name", "link", "description", "collection_period", "selection_approach"])
        cp = r.obj(o.get("collection_period"), _join(p, "collection_period"), ["start", "end"])
        period = {
            "start": _month_or_unknown(r, cp.get("start"), _join(p, "collection_period.start")),
            "end": _month_or_unknown(r, cp.get("end"), _join(p, "collection_period.end")),
        }
        large.append(
            {
                "name": r.short(o.get("name"), _join(p, "name")),
                "link": r.link(o.get("link"), _join(p, "link")),
                "description": r.text(o.get("description"), _join(p, "description")),
                "collection_period": period,
                "selection_approach": r.text(o.get("selection_approach"), _join(p, "selection_approach")),
            }
        )
    lic_path = f"{D}.licensed_datasets"
    lic = r.obj(ds.get("licensed_datasets"), lic_path, ["concluded", "modalities"])
    opr_path = f"{D}.other_private_datasets"
    opr = r.obj(ds.get("other_private_datasets"), opr_path, ["obtained", "modalities", "publicly_known_datasets", "non_publicly_known_description", "additional_comments"])
    known = _named_links(r, opr.get("publicly_known_datasets"), _join(opr_path, "publicly_known_datasets"), "link")
    cr_path = f"{D}.crawled_data"
    cr = r.obj(
        ds.get("crawled_data"),
        cr_path,
        ["crawlers_used", "crawler_names", "purposes", "crawler_behaviour", "collection_period", "content_description", "modalities", "top_domains", "additional_comments"],
    )
    crp = r.obj(cr.get("collection_period"), _join(cr_path, "collection_period"), ["from", "to"])
    crawl_period = {"from": r.month(crp.get("from"), _join(cr_path, "collection_period.from")), "to": r.month(crp.get("to"), _join(cr_path, "collection_period.to"))}
    td = r.obj(cr.get("top_domains"), _join(cr_path, "top_domains"), ["domains", "access_information"])
    domains_path = _join(cr_path, "top_domains.domains")
    seen = set()
    domains: List[str] = []
    for i, v in enumerate(r.list(td.get("domains"), domains_path, MAX_DOMAINS_IN_SUMMARY)):
        s = r.short(v, _at(domains_path, i))
        if s == "":
            continue
        if DOMAIN_RE.match(s) is None:
            r.issue(_at(domains_path, i), "bad-domain")
        elif s in seen:
            r.issue(_at(domains_path, i), "duplicate")
        else:
            seen.add(s)
            domains.append(s)
    ud_path = f"{D}.user_data"
    ud = r.obj(ds.get("user_data"), ud_path, ["from_model_interactions", "from_other_services", "services_description", "modalities", "additional_comments"])
    sy_path = f"{D}.synthetic_data"
    sy = r.obj(ds.get("synthetic_data"), sy_path, ["created", "modalities", "market_models", "other_models_information", "additional_comments"])
    os_path = f"{D}.other_sources"
    osrc = r.obj(ds.get("other_sources"), os_path, ["used", "description", "additional_comments"])

    P = "data_processing"
    dp = r.obj(top.get("data_processing"), P, ["tdm_reservations", "illegal_content", "other_information"])
    tdm = r.obj(dp.get("tdm_reservations"), f"{P}.tdm_reservations", ["code_of_practice_signatory", "measures", "additional_comments"])
    ill = r.obj(dp.get("illegal_content"), f"{P}.illegal_content", ["measures"])

    gaps = []
    for i, v in enumerate(r.list(top.get("information_gaps"), "information_gaps")):
        p = _at("information_gaps", i)
        o = r.obj(v, p, ["field", "justification"])
        gaps.append({"field": r.short(o.get("field"), _join(p, "field")), "justification": r.text(o.get("justification"), _join(p, "justification"))})

    crawler_names_path = _join(cr_path, "crawler_names")

    summary = {
        "sourcebook": 1,
        "summary_version": {"version": r.short(sv.get("version"), "summary_version.version"), "previous_versions": previous},
        "last_update": r.date(top.get("last_update"), "last_update"),
        "general_information": {
            "provider": {"name_and_contact_details": r.text(pv.get("name_and_contact_details"), f"{G}.provider.name_and_contact_details"), "authorised_representative": authorised},
            "model": {
                "versioned_model_names": versioned,
                "model_dependencies": {"is_modification": r.bool(dep.get("is_modification"), _join(dep_path, "is_modification")), "models": dep_models},
                "placement_dates": placement,
            },
            "modalities": {
                "text": _text_row(r, mo.get("text"), _join(m_path, "text")),
                "image": _standard_row(r, mo.get("image"), _join(m_path, "image"), "image"),
                "audio": _standard_row(r, mo.get("audio"), _join(m_path, "audio"), "audio"),
                "video": _standard_row(r, mo.get("video"), _join(m_path, "video"), "video"),
                "other": other,
            },
            "latest_data_collection": {
                "date": r.month(ld.get("date"), _join(ld_path, "date")),
                "continuous_training": r.bool(ld.get("continuous_training"), _join(ld_path, "continuous_training")),
            },
            "linguistic_characteristics": r.text(gi.get("linguistic_characteristics"), f"{G}.linguistic_characteristics"),
            "other_characteristics": r.text(gi.get("other_characteristics"), f"{G}.other_characteristics"),
            "additional_comments": r.text(gi.get("additional_comments"), f"{G}.additional_comments"),
        },
        "data_sources": {
            "public_datasets": {
                "used": r.bool(pds.get("used"), _join(pds_path, "used")),
                "modalities": _selection(r, pds.get("modalities"), _join(pds_path, "modalities")),
                "large_datasets": large,
                "other_datasets_description": r.text(pds.get("other_datasets_description"), _join(pds_path, "other_datasets_description")),
                "additional_comments": r.text(pds.get("additional_comments"), _join(pds_path, "additional_comments")),
            },
            "licensed_datasets": {"concluded": r.bool(lic.get("concluded"), _join(lic_path, "concluded")), "modalities": _selection(r, lic.get("modalities"), _join(lic_path, "modalities"))},
            "other_private_datasets": {
                "obtained": r.bool(opr.get("obtained"), _join(opr_path, "obtained")),
                "modalities": _selection(r, opr.get("modalities"), _join(opr_path, "modalities")),
                "publicly_known_datasets": known,
                "non_publicly_known_description": r.text(opr.get("non_publicly_known_description"), _join(opr_path, "non_publicly_known_description")),
                "additional_comments": r.text(opr.get("additional_comments"), _join(opr_path, "additional_comments")),
            },
            "crawled_data": {
                "crawlers_used": r.bool(cr.get("crawlers_used"), _join(cr_path, "crawlers_used")),
                "crawler_names": [x for x in (r.short(v, _at(crawler_names_path, i)) for i, v in enumerate(r.list(cr.get("crawler_names"), crawler_names_path, 1000))) if x != ""],
                "purposes": r.text(cr.get("purposes"), _join(cr_path, "purposes")),
                "crawler_behaviour": r.text(cr.get("crawler_behaviour"), _join(cr_path, "crawler_behaviour")),
                "collection_period": crawl_period,
                "content_description": r.text(cr.get("content_description"), _join(cr_path, "content_description")),
                "modalities": _selection(r, cr.get("modalities"), _join(cr_path, "modalities")),
                "top_domains": {"domains": domains, "access_information": r.text(td.get("access_information"), _join(cr_path, "top_domains.access_information"))},
                "additional_comments": r.text(cr.get("additional_comments"), _join(cr_path, "additional_comments")),
            },
            "user_data": {
                "from_model_interactions": r.bool(ud.get("from_model_interactions"), _join(ud_path, "from_model_interactions")),
                "from_other_services": r.bool(ud.get("from_other_services"), _join(ud_path, "from_other_services")),
                "services_description": r.text(ud.get("services_description"), _join(ud_path, "services_description")),
                "modalities": _selection(r, ud.get("modalities"), _join(ud_path, "modalities")),
                "additional_comments": r.text(ud.get("additional_comments"), _join(ud_path, "additional_comments")),
            },
            "synthetic_data": {
                "created": r.bool(sy.get("created"), _join(sy_path, "created")),
                "modalities": _selection(r, sy.get("modalities"), _join(sy_path, "modalities")),
                "market_models": [{"name": x["name"], "summary_link": x["link"]} for x in _named_links(r, sy.get("market_models"), _join(sy_path, "market_models"), "summary_link")],
                "other_models_information": r.text(sy.get("other_models_information"), _join(sy_path, "other_models_information")),
                "additional_comments": r.text(sy.get("additional_comments"), _join(sy_path, "additional_comments")),
            },
            "other_sources": {
                "used": r.bool(osrc.get("used"), _join(os_path, "used")),
                "description": r.text(osrc.get("description"), _join(os_path, "description")),
                "additional_comments": r.text(osrc.get("additional_comments"), _join(os_path, "additional_comments")),
            },
        },
        "data_processing": {
            "tdm_reservations": {
                "code_of_practice_signatory": r.bool(tdm.get("code_of_practice_signatory"), f"{P}.tdm_reservations.code_of_practice_signatory"),
                "measures": r.text(tdm.get("measures"), f"{P}.tdm_reservations.measures"),
                "additional_comments": r.text(tdm.get("additional_comments"), f"{P}.tdm_reservations.additional_comments"),
            },
            "illegal_content": {"measures": r.text(ill.get("measures"), f"{P}.illegal_content.measures")},
            "other_information": r.text(dp.get("other_information"), f"{P}.other_information"),
        },
        "information_gaps": gaps,
    }
    if r.issues:
        raise SchemaError(r.issues)
    return summary


def empty_summary() -> Dict[str, Any]:
    """A summary with every field present and unanswered."""
    return parse_summary({"sourcebook": 1})


class JsonInputError(ValueError):
    """JSON that is malformed or nested too deeply."""


def parse_json_safe(text: str, max_depth: int = MAX_JSON_DEPTH) -> Any:
    """Parses JSON after checking its nesting depth."""
    depth = 0
    in_string = False
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if in_string:
            if c == "\\":
                i += 1
            elif c == '"':
                in_string = False
        elif c == '"':
            in_string = True
        elif c in "[{":
            depth += 1
            if depth > max_depth:
                raise JsonInputError(f"The JSON is nested more than {max_depth} levels deep.")
        elif c in "]}":
            depth -= 1
        i += 1
    try:
        return json.loads(text)
    except (ValueError, RecursionError):
        raise JsonInputError("The file is not valid JSON.") from None


def parse_summary_text(text: str, fmt: str = "auto") -> Dict[str, Any]:
    """Parses a summary file's text (YAML, or JSON when it starts with "{")."""
    is_json = fmt == "json" or (fmt == "auto" and text.lstrip().startswith("{"))
    data = parse_json_safe(text) if is_json else parse_yaml(text, DEFAULT_YAML_LIMITS)
    return parse_summary(data)
