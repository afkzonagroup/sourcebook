# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Markdown and JSON output and the model card section.

Port of ``src/render/document.ts``, ``markdown.ts``, ``json.ts`` and
``model-card.ts``. The Markdown is byte-identical to the TypeScript output
(shared vectors in ``test-vectors/summaries.json``). The HTML output is
available in the TypeScript command line tool.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from . import __version__
from ._spec import CHECKBOX, CHECKBOX_MODALITIES, MODALITY_TABLE, SECTIONS, SIZE_RANGES, STANDARD_MODALITIES, TEMPLATE, field
from .schema import is_link

ATTRIBUTION = "Sourcebook by AFKzona Group"
ATTRIBUTION_URL = "https://afkzonagroup.lt"
GENERATOR = f"Sourcebook {__version__} by AFKzona Group ({ATTRIBUTION_URL})"
MODEL_CARD_START = "<!-- sourcebook:start -->"
MODEL_CARD_END = "<!-- sourcebook:end -->"
CHECKED = "☒"
UNCHECKED = "☐"

# ---------------------------------------------------------------- document model
# Inline: ("text", v) ("strong", v) ("em", v) ("link", href, v) ("box", checked)
# Block: dicts with key "b".


def _t(v: str):
    return ("text", v)


def _box(checked: bool):
    return ("box", checked)


def _p(*inl):
    return {"b": "p", "inl": list(inl)}


_NOT_FILLED = {"b": "p", "inl": [("em", "Not filled in.")]}
_NOT_APPLICABLE = {"b": "p", "inl": [_t("Not applicable.")]}


def format_date(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}"


def format_short_date(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}/{iso[2:4]}"


def format_month(month: str) -> str:
    return "not known" if month == "not known" else f"{month[5:7]}/{month[0:4]}"


def _yes_no(v: Optional[bool]):
    return _p(_box(v is True), _t(f" {CHECKBOX['yes']} "), _box(v is False), _t(f" {CHECKBOX['no']}"))


def _selection(m: Dict[str, Any]):
    inl = []
    for k in CHECKBOX_MODALITIES:
        inl += [_box(k in m["selected"]), _t(f" {CHECKBOX[k]} ")]
    inl.append(_box(m["other"] != ""))
    inl.append(_t(f" {CHECKBOX['other']}"))
    if m["other"] != "":
        inl.append(_t(f": {m['other']}"))
    return {"b": "p", "inl": inl}


def _narrative(v: str, required: bool) -> List[Dict[str, Any]]:
    if v != "":
        return [{"b": "text", "v": v}]
    return [_NOT_FILLED] if required else []


def _link(href: str):
    return ("link", href, href)


def build_document(s: Dict[str, Any], instructions: bool = False) -> List[Dict[str, Any]]:
    """The format-neutral document for a summary, in the template layout."""
    out: List[Dict[str, Any]] = []

    def field_block(f: Dict[str, Any], body: List[Dict[str, Any]], label: Optional[str] = None) -> Dict[str, Any]:
        return {"b": "field", "label": label if label is not None else f["label"], "instruction": f["instruction"] if instructions else "", "body": body}

    def heading(num: str) -> None:
        sec = next((x for x in SECTIONS if x["number"] == num), None)
        if sec is None:
            return
        depth = len(num.split("."))
        level = 2 if depth == 1 else 3 if depth == 2 else 4
        out.append({"b": "h", "level": level, "text": f"{num}. {sec['title']}", "id": "section-" + num.replace(".", "-")})
        if num == "2.2":
            intro, *items = sec["intro"]
            out.append(_p(_t(intro)))
            out.append({"b": "list", "ordered": True, "items": [{"inl": [_t(x)], "sub": []} for x in items]})
        else:
            for para in sec["intro"]:
                out.append(_p(_t(para)))

    gaps_by_box: Dict[str, List[Dict[str, str]]] = {}
    for g in s["information_gaps"]:
        try:
            f = field(g["field"])
        except KeyError:
            continue
        gaps_by_box.setdefault(f["box"], []).append({"label": f["label"], "justification": g["justification"]})

    def comment_box(fid: str, text: str) -> None:
        f = field(fid)
        gaps = gaps_by_box.get(f["path"], [])
        if text == "" and not gaps and not instructions:
            return
        body = list(_narrative(text, False))
        if gaps:
            body.append(_p(_t("Information gaps (Explanatory Notice, point 33):")))
            body.append({"b": "list", "ordered": False, "items": [{"inl": [("strong", g["label"]), _t(f" {g['justification']}")], "sub": []} for g in gaps]})
        out.append(field_block(f, body))

    out.append({"b": "h", "level": 1, "text": "Public Summary of Training Content for General-Purpose AI models", "id": "summary"})
    out.append(_p(_t(f"Drawn up using the {TEMPLATE['title']} {TEMPLATE['subtitle']} ({TEMPLATE['document']}).")))
    sv = s["summary_version"]
    vbody: List[Dict[str, Any]] = [_NOT_FILLED if sv["version"] == "" else _p(_t(sv["version"]))]
    if sv["previous_versions"]:
        vbody.append(
            {
                "b": "list",
                "ordered": False,
                "items": [{"inl": [_t(f"Previous version {v['version']}")] + ([] if v["link"] == "" else [_t(": "), _link(v["link"])]), "sub": []} for v in sv["previous_versions"]],
            }
        )
    out.append(field_block(field("summary_version"), vbody))
    out.append(field_block(field("last_update"), [_NOT_FILLED if s["last_update"] is None else _p(_t(format_short_date(s["last_update"])))]))

    gi = s["general_information"]
    heading("1")
    heading("1.1")
    out.append(field_block(field("provider"), _narrative(gi["provider"]["name_and_contact_details"], True)))
    ar = gi["provider"]["authorised_representative"]
    if ar["applicable"] is True:
        ar_body = _narrative(ar["name_and_contact_details"], True)
    elif ar["applicable"] is False:
        if ar["not_applicable_reason"] == "open_source_exemption":
            text = "Not applicable: the model is released under a free and open-source licence as described in Article 54(6) AI Act and does not present systemic risks."
        elif ar["not_applicable_reason"] == "established_in_union":
            text = "Not applicable: the provider is established in the Union."
        else:
            text = "Not applicable."
        ar_body = [_p(_t(text))]
    else:
        ar_body = [_NOT_FILLED]
    out.append(field_block(field("authorised_representative"), ar_body))

    heading("1.2")
    vm = gi["model"]["versioned_model_names"]
    out.append(
        field_block(
            field("versioned_model_names"),
            [_NOT_FILLED] if not vm else [{"b": "list", "ordered": False, "items": [{"inl": [_t(m["name"])], "sub": [[_t("Documentation: "), _link(link)] for link in m["documentation_links"]]} for m in vm]}],
        )
    )
    dep = gi["model"]["model_dependencies"]
    if dep["is_modification"] is True:
        dep_body = (
            [_NOT_FILLED]
            if not dep["models"]
            else [{"b": "list", "ordered": False, "items": [{"inl": [_t(m["name"])], "sub": [] if m["summary_link"] == "" else [[_t("Summary: "), _link(m["summary_link"])]]} for m in dep["models"]]}]
        )
    elif dep["is_modification"] is False:
        dep_body = [_p(_t("Not applicable: the model is not the result of a modification of a general-purpose AI model already placed on the Union market."))]
    else:
        dep_body = [_NOT_FILLED]
    out.append(field_block(field("model_dependencies"), dep_body))
    pdates = gi["model"]["placement_dates"]
    out.append(
        field_block(
            field("placement_dates"),
            [_NOT_FILLED]
            if not pdates
            else [{"b": "list", "ordered": False, "items": [{"inl": [_t(f"{d['model']}: "), ("em", "not filled in") if d["date"] is None else _t(format_date(d["date"]))], "sub": []} for d in pdates]}],
        )
    )

    heading("1.3")
    rows = []
    for m in STANDARD_MODALITIES:
        row = gi["modalities"][m]
        size = [[_box(row["size_range"] == r["id"]), _t(f" {r['label']}")] for r in SIZE_RANGES[m]]
        if m == "text":
            size.append([_t(f"{MODALITY_TABLE['textAlternative']} {gi['modalities']['text']['size_other_unit']}".rstrip(_JS_WS))])
        rows.append({"label": MODALITY_TABLE["rows"][m]["label"], "footnote": m == "audio", "checked": row["present"] is True, "size": size, "types": row["types_of_content"], "examples": MODALITY_TABLE["rows"][m]["examples"]})
    others = gi["modalities"]["other"]
    rows.append(
        {
            "label": MODALITY_TABLE["rows"]["other"]["label"],
            "footnote": False,
            "checked": len(others) > 0,
            "size": [[_t(f"{o['modality']}: {o['approximate_size']}")] for o in others],
            "types": "\n\n".join(f"{o['modality']}: {o['types_of_content']}" if len(others) > 1 else o["types_of_content"] for o in others),
            "examples": MODALITY_TABLE["rows"]["other"]["examples"],
        }
    )
    out.append({"b": "modalities", "rows": rows, "footnote": MODALITY_TABLE["audioFootnote"]})
    ldc = gi["latest_data_collection"]
    out.append(
        field_block(
            field("latest_data_collection"),
            [
                _NOT_FILLED if ldc["date"] is None else _p(_t(format_month(ldc["date"]))),
                _p(_t("Continuously trained on new or dynamic data after this date: "), _box(ldc["continuous_training"] is True), _t(f" {CHECKBOX['yes']} "), _box(ldc["continuous_training"] is False), _t(f" {CHECKBOX['no']}")),
            ],
        )
    )
    out.append(field_block(field("linguistic_characteristics"), _narrative(gi["linguistic_characteristics"], True)))
    out.append(field_block(field("other_characteristics"), _narrative(gi["other_characteristics"], True)))
    comment_box("general_additional_comments", gi["additional_comments"])

    ds = s["data_sources"]
    heading("2")
    heading("2.1")
    pd = ds["public_datasets"]

    def gate(answer: Optional[bool], body) -> List[Dict[str, Any]]:
        if answer is False:
            return [_NOT_APPLICABLE]
        if answer is None:
            return [_NOT_FILLED]
        return body()

    out.append(field_block(field("public_datasets_used"), [_yes_no(pd["used"])]))
    out.append(field_block(field("public_datasets_modalities"), gate(pd["used"], lambda: [_selection(pd["modalities"])])))

    def large_items():
        items = []
        for d in pd["large_datasets"]:
            sub = []
            if d["description"] != "":
                sub.append([_t(f"Description: {d['description']}")])
            cp = d["collection_period"]
            if cp["start"] is not None or cp["end"] is not None:
                sub.append([_t(f"Data collection: {format_month(cp['start'] or 'not known')} to {format_month(cp['end'] or 'not known')}")])
            if d["selection_approach"] != "":
                sub.append([_t(f"Approach to selecting the parts used: {d['selection_approach']}")])
            items.append({"inl": [("strong", d["name"])] + ([] if d["link"] == "" else [_t(": "), _link(d["link"])]), "sub": sub})
        return items

    out.append(field_block(field("large_public_datasets"), gate(pd["used"], lambda: [_p(_t("None."))] if not pd["large_datasets"] else [{"b": "list", "ordered": True, "items": large_items()}])))
    out.append(field_block(field("other_public_datasets"), gate(pd["used"], lambda: [_p(_t("None."))] if pd["other_datasets_description"] == "" else _narrative(pd["other_datasets_description"], False))))
    comment_box("public_datasets_additional_comments", pd["additional_comments"])

    heading("2.2")
    heading("2.2.1")
    lic = ds["licensed_datasets"]
    out.append(field_block(field("licensed_datasets_concluded"), [_yes_no(lic["concluded"])]))
    out.append(field_block(field("licensed_datasets_modalities"), gate(lic["concluded"], lambda: [_selection(lic["modalities"])])))
    heading("2.2.2")
    op = ds["other_private_datasets"]
    out.append(field_block(field("other_private_datasets_obtained"), [_yes_no(op["obtained"])]))
    out.append(field_block(field("other_private_datasets_modalities"), gate(op["obtained"], lambda: [_selection(op["modalities"])])))
    out.append(
        field_block(
            field("publicly_known_private_datasets"),
            gate(
                op["obtained"],
                lambda: [_p(_t("None."))]
                if not op["publicly_known_datasets"]
                else [{"b": "list", "ordered": False, "items": [{"inl": [_t(d["name"])] + ([] if d["link"] == "" else [_t(": "), _link(d["link"])]), "sub": []} for d in op["publicly_known_datasets"]]}],
            ),
        )
    )
    out.append(field_block(field("non_publicly_known_private_datasets"), gate(op["obtained"], lambda: [_p(_t("None."))] if op["non_publicly_known_description"] == "" else _narrative(op["non_publicly_known_description"], False))))
    comment_box("other_private_datasets_additional_comments", op["additional_comments"])

    heading("2.3")
    cd = ds["crawled_data"]
    out.append(field_block(field("crawlers_used"), [_yes_no(cd["crawlers_used"])]))
    out.append(field_block(field("crawler_names"), gate(cd["crawlers_used"], lambda: [_NOT_FILLED] if not cd["crawler_names"] else [{"b": "list", "ordered": False, "items": [{"inl": [_t(n)], "sub": []} for n in cd["crawler_names"]]}])))
    out.append(field_block(field("crawler_purposes"), gate(cd["crawlers_used"], lambda: _narrative(cd["purposes"], True))))
    out.append(field_block(field("crawler_behaviour"), gate(cd["crawlers_used"], lambda: _narrative(cd["crawler_behaviour"], True))))
    cp = cd["collection_period"]
    out.append(
        field_block(
            field("crawl_period"),
            gate(cd["crawlers_used"], lambda: [_p(_t(f"From {'..' if cp['from'] is None else format_month(cp['from'])} to {'..' if cp['to'] is None else format_month(cp['to'])}"))]),
        )
    )
    out.append(field_block(field("crawled_content"), gate(cd["crawlers_used"], lambda: _narrative(cd["content_description"], True))))
    out.append(field_block(field("crawled_modalities"), gate(cd["crawlers_used"], lambda: [_selection(cd["modalities"])])))

    def domains_body():
        body = []
        if cd["top_domains"]["domains"]:
            body.append({"b": "list", "ordered": True, "items": [{"inl": [_t(d)], "sub": []} for d in cd["top_domains"]["domains"]]})
        if cd["top_domains"]["access_information"] != "":
            body.append({"b": "text", "v": cd["top_domains"]["access_information"]})
        return [_NOT_FILLED] if not body else body

    out.append(field_block(field("top_domains"), gate(cd["crawlers_used"], domains_body)))
    comment_box("crawled_additional_comments", cd["additional_comments"])

    heading("2.4")
    ud = ds["user_data"]
    out.append(field_block(field("user_data_model_interactions"), [_yes_no(ud["from_model_interactions"])]))
    out.append(field_block(field("user_data_other_services"), [_yes_no(ud["from_other_services"])]))
    out.append(field_block(field("user_data_services"), gate(ud["from_other_services"], lambda: _narrative(ud["services_description"], True))))
    any_user = True if (ud["from_model_interactions"] is True or ud["from_other_services"] is True) else False if (ud["from_model_interactions"] is False and ud["from_other_services"] is False) else None
    out.append(field_block(field("user_data_modalities"), gate(any_user, lambda: [_selection(ud["modalities"])])))
    comment_box("user_data_additional_comments", ud["additional_comments"])

    heading("2.5")
    sy = ds["synthetic_data"]
    out.append(field_block(field("synthetic_data_created"), [_yes_no(sy["created"])]))
    out.append(field_block(field("synthetic_data_modalities"), gate(sy["created"], lambda: [_selection(sy["modalities"])])))
    out.append(
        field_block(
            field("synthetic_market_models"),
            gate(
                sy["created"],
                lambda: [_p(_t("None."))]
                if not sy["market_models"]
                else [{"b": "list", "ordered": False, "items": [{"inl": [_t(m["name"])], "sub": [] if m["summary_link"] == "" else [[_t("Summary: "), _link(m["summary_link"])]]} for m in sy["market_models"]]}],
            ),
        )
    )
    out.append(field_block(field("synthetic_other_models"), gate(sy["created"], lambda: [_p(_t("None."))] if sy["other_models_information"] == "" else _narrative(sy["other_models_information"], False))))
    comment_box("synthetic_additional_comments", sy["additional_comments"])

    heading("2.6")
    osrc = ds["other_sources"]
    out.append(field_block(field("other_sources_used"), [_yes_no(osrc["used"])]))
    out.append(field_block(field("other_sources_description"), gate(osrc["used"], lambda: _narrative(osrc["description"], True))))
    comment_box("other_sources_additional_comments", osrc["additional_comments"])

    dp = s["data_processing"]
    heading("3")
    heading("3.1")
    out.append(field_block(field("code_of_practice_signatory"), [_yes_no(dp["tdm_reservations"]["code_of_practice_signatory"])]))
    out.append(field_block(field("tdm_measures"), _narrative(dp["tdm_reservations"]["measures"], True)))
    comment_box("tdm_additional_comments", dp["tdm_reservations"]["additional_comments"])
    heading("3.2")
    out.append(field_block(field("illegal_content_measures"), _narrative(dp["illegal_content"]["measures"], True)))
    heading("3.3")
    other_info = field("other_information")
    other_gaps = gaps_by_box.get(other_info["path"], [])
    other_body = list(_narrative(dp["other_information"], False))
    if other_gaps:
        other_body.append(_p(_t("Information gaps (Explanatory Notice, point 33):")))
        other_body.append({"b": "list", "ordered": False, "items": [{"inl": [("strong", g["label"]), _t(f" {g['justification']}")], "sub": []} for g in other_gaps]})
    out.append(field_block(other_info, other_body if other_body else [_p(_t("None."))]))

    out.append({"b": "rule"})
    out.append(_p(_t(f"Template: {TEMPLATE['document']} of 5 December 2025, "), ("link", TEMPLATE["sourceUrl"], TEMPLATE["sourceUrl"]), _t(f". {TEMPLATE['copyright']}")))
    out.append(_p(_t("Prepared with "), ("link", ATTRIBUTION_URL, ATTRIBUTION), _t(".")))
    return out


_JS_WS = "\t\n\u000b\u000c\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

# ---------------------------------------------------------------- Markdown
_SPECIAL = re.compile(r"[\\`*_\[\]<>|~#!&$]")


def _escape_chars(s: str) -> str:
    return _SPECIAL.sub(lambda m: "\\" + m.group(0), s)


def _escape_line_start(s: str) -> str:
    if re.match(r"[-+=]", s):
        return "\\" + s
    m = re.match(r"([0-9]{1,9})([.)])(?=[ \t]|\Z)", s)
    if m:
        return m.group(1) + "\\" + s[len(m.group(1)) :]
    return s


def escape_inline(s: str) -> str:
    return _escape_chars(re.sub(r"[\t\n ]+", " ", s).strip(_JS_WS))


def escape_text(s: str) -> str:
    paras = []
    for para in re.split(r"\n[ \t]*\n", s.replace("\r\n", "\n")):
        lines = [_escape_line_start(_escape_chars(line)) for line in (x.strip(" \t") for x in para.split("\n")) if line != ""]
        joined = "\n".join(lines)
        if joined != "":
            paras.append(joined)
    return "\n\n".join(paras)


def _inline(parts) -> str:
    out = ""
    for part in parts:
        kind = part[0]
        if kind == "text":
            out += _escape_chars(re.sub(r"[\t\n ]+", " ", part[1]))
        elif kind == "strong":
            out += f"**{escape_inline(part[1])}**"
        elif kind == "em":
            out += f"*{escape_inline(part[1])}*"
        elif kind == "link":
            href, v = part[1], part[2]
            # Only validated http(s) URLs become links, also for summaries built in code (not parsed).
            if not is_link(href):
                out += _escape_chars(re.sub(r"[\t\n ]+", " ", v))
            else:
                out += f"<{href}>" if v == href else f"[{escape_inline(v)}](<{href}>)"
        elif kind == "box":
            out += CHECKED if part[1] else UNCHECKED
    return _escape_line_start(out.strip(_JS_WS))


def _block(b: Dict[str, Any], offset: int) -> str:
    kind = b["b"]
    if kind == "h":
        return "#" * min(6, b["level"] + offset) + " " + escape_inline(b["text"])
    if kind == "p":
        return _inline(b["inl"])
    if kind == "text":
        return escape_text(b["v"])
    if kind == "rule":
        return "---"
    if kind == "field":
        parts = [f"**{escape_inline(b['label'])}**"]
        if b["instruction"] != "":
            parts.append(f"*{escape_inline(b['instruction'])}*")
        for x in b["body"]:
            parts.append(_block(x, offset))
        return "\n\n".join(p for p in parts if p != "")
    if kind == "list":
        items = []
        for i, item in enumerate(b["items"]):
            marker = f"{i + 1}. " if b["ordered"] else "- "
            pad = " " * len(marker)
            lines = [marker + _inline(item["inl"])]
            for sub in item["sub"]:
                lines.append(f"{pad}- {_inline(sub)}")
            items.append("\n".join(lines))
        return "\n".join(items)
    if kind == "modalities":
        parts = []
        for row in b["rows"]:
            parts.append(f"{CHECKED if row['checked'] else UNCHECKED} **{escape_inline(row['label'])}**{chr(0xB9) if row['footnote'] else ''}")
            if not row["checked"]:
                continue
            if row["size"]:
                parts.append("Training data size:")
                parts.append("\n".join(f"- {_inline(line)}" for line in row["size"]))
            parts.append("Types of content:")
            parts.append("*Not filled in.*" if row["types"] == "" else escape_text(row["types"]))
        parts.append(f"{chr(0xB9)} {escape_inline(b['footnote'])}")
        return "\n\n".join(parts)
    raise ValueError(f"Unknown block: {kind}")


def document_to_markdown(doc: List[Dict[str, Any]], heading_offset: int = 0) -> str:
    return "\n\n".join(x for x in (_block(b, heading_offset) for b in doc) if x != "") + "\n"


def render_markdown(summary: Dict[str, Any], instructions: bool = False, heading_offset: int = 0) -> str:
    """Renders a summary as Markdown in the layout of the template."""
    return document_to_markdown(build_document(summary, instructions), heading_offset)


# ---------------------------------------------------------------- JSON


def summary_to_json(summary: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "format": "sourcebook-summary",
        "format_version": 1,
        "template": {"id": TEMPLATE["id"], "document": TEMPLATE["document"], "document_date": TEMPLATE["documentDate"], "source": TEMPLATE["sourceUrl"]},
        "generator": GENERATOR,
        "summary": summary,
    }


def render_json(summary: Dict[str, Any]) -> str:
    """JSON text identical to the TypeScript output."""
    return json.dumps(summary_to_json(summary), indent=2, ensure_ascii=False) + "\n"


# ---------------------------------------------------------------- model card


def model_card_snippet(summary: Dict[str, Any], summary_url: str, mode: str = "link") -> str:
    """A model card section that links to (or embeds) the full summary."""
    if not is_link(summary_url):
        raise ValueError("The summary URL must be an http or https link.")
    models = [m["name"] for m in summary["general_information"]["model"]["versioned_model_names"] if m["name"] != ""]
    sv = summary["summary_version"]["version"]
    lines = [
        MODEL_CARD_START,
        "## Training content summary (EU AI Act)",
        "",
        f"Public summary of the content used to train this model, drawn up under Article 53(1)(d) of Regulation (EU) 2024/1689 (AI Act) using the AI Office template ({escape_inline(TEMPLATE['document'])}).",
        "",
        f"- Full summary: <{summary_url}>",
        f"- Version of the Summary: {'not filled in' if sv == '' else escape_inline(sv)}",
        f"- Last update: {'not filled in' if summary['last_update'] is None else format_short_date(summary['last_update'])}",
        f"- Models covered: {'not filled in' if not models else ', '.join(escape_inline(m) for m in models)}",
    ]
    if mode == "full":
        lines += ["", "<details>", "<summary>Full summary</summary>", "", render_markdown(summary, heading_offset=2).rstrip(_JS_WS), "", "</details>"]
    lines.append(MODEL_CARD_END)
    return "\n".join(lines) + "\n"


def insert_into_model_card(readme: str, snippet: str) -> str:
    """Replaces an existing Sourcebook section in a README, or appends one."""
    starts = readme.count(MODEL_CARD_START)
    ends = readme.count(MODEL_CARD_END)
    if starts != ends or starts > 1:
        raise ValueError("The README has unbalanced or repeated Sourcebook markers.")
    if starts == 1:
        a = readme.index(MODEL_CARD_START)
        b = readme.index(MODEL_CARD_END)
        if b < a:
            raise ValueError("The README has unbalanced or repeated Sourcebook markers.")
        after = readme[b + len(MODEL_CARD_END) :]
        if after.startswith("\n"):
            after = after[1:]
        return readme[:a] + snippet + after
    base = readme if readme.endswith("\n") or readme == "" else readme + "\n"
    return base + ("" if base == "" else "\n") + snippet
