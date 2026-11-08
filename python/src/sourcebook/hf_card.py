# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Hugging Face dataset cards to inventory entries (port of src/collect/hf-card.ts)."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional

from .schema import CONTROL_CHARS, HIDDEN_CHARS
from .yaml_safe import DEFAULT_YAML_LIMITS, YamlLimits, parse_yaml, split_front_matter

REPO_ID_RE = re.compile(r"^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?/)?[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?\Z")


def is_repo_id(repo_id: str) -> bool:
    return REPO_ID_RE.match(repo_id) is not None and ".." not in repo_id and "--" not in repo_id and "\n" not in repo_id


def _strings(v: Any, max_items: int = 500) -> List[str]:
    items = [v] if isinstance(v, str) else v if isinstance(v, list) else []
    out: List[str] = []
    for x in items:
        if isinstance(x, str) and x.strip(_JS_WS) != "" and len(x.encode("utf-16-le")) // 2 <= 200 and not CONTROL_CHARS.search(x) and not HIDDEN_CHARS.search(x) and "\n" not in x:
            t = x.strip(_JS_WS)
            if t not in out:
                out.append(t)
        if len(out) >= max_items:
            break
    return out


_JS_WS = "\t\n\u000b\u000c\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def _non_negative_int(v: Any) -> Optional[int]:
    if not isinstance(v, (int, float)) or isinstance(v, bool) or (isinstance(v, float) and not math.isfinite(v)) or v < 0:
        return None
    return int(math.floor(v))


TASK_MODALITY = {
    "automatic-speech-recognition": "audio",
    "audio-classification": "audio",
    "text-to-speech": "audio",
    "audio-to-audio": "audio",
    "image-classification": "image",
    "object-detection": "image",
    "image-segmentation": "image",
    "text-to-image": "image",
    "image-to-text": "image",
    "video-classification": "video",
    "text-to-video": "video",
    "text-generation": "text",
    "text-classification": "text",
    "question-answering": "text",
    "summarization": "text",
    "translation": "text",
    "fill-mask": "text",
    "token-classification": "text",
}


def _modalities_from_tags(tags: List[str]) -> List[str]:
    out: List[str] = []
    for t in tags:
        m = re.match(r"^modality:(text|image|audio|video)\Z", t)
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out


def _modalities_from_features(info: Any) -> List[str]:
    found: List[str] = []
    budget = [10_000]

    def add(m: str) -> None:
        if m not in found:
            found.append(m)

    def walk(v: Any, depth: int) -> None:
        budget[0] -= 1
        if budget[0] < 0 or depth > 20:
            return
        if isinstance(v, list):
            for x in v:
                walk(x, depth + 1)
            return
        if not isinstance(v, dict):
            return
        dtype = v.get("dtype")
        if dtype in ("string", "large_string"):
            add("text")
        if dtype == "image" or "image" in v:
            add("image")
        if dtype == "audio" or (isinstance(dtype, dict) and "audio" in dtype):
            add("audio")
        if dtype == "video" or (isinstance(dtype, dict) and "video" in dtype):
            add("video")
        if isinstance(dtype, dict) and "image" in dtype:
            add("image")
        for k in v:
            if k != "dtype":
                walk(v[k], depth + 1)

    for c in info if isinstance(info, list) else [info]:
        if isinstance(c, dict):
            walk(c.get("features"), 0)
    return found


def _sizes_from_info(info: Any):
    configs = info if isinstance(info, list) else [info]
    total_bytes: Optional[int] = None
    examples: Optional[int] = None
    complete = True
    complete_ex = True
    for c in configs:
        if not isinstance(c, dict):
            continue
        size = _non_negative_int(c.get("dataset_size"))
        if size is None:
            complete = False
        else:
            total_bytes = (total_bytes or 0) + size
        splits = c.get("splits")
        if isinstance(splits, list):
            for s in splits:
                n = _non_negative_int(s.get("num_examples")) if isinstance(s, dict) else None
                if n is None:
                    complete_ex = False
                else:
                    examples = (examples or 0) + n
        else:
            complete_ex = False
    return (total_bytes if complete else None), (examples if complete_ex else None)


def dataset_from_hf_card(reference: str, readme: Optional[str] = None, api: Any = None, repo_id: Optional[str] = None, yaml_limits: YamlLimits = DEFAULT_YAML_LIMITS) -> Dict[str, Any]:
    """Turns a dataset card (and optionally the Hub API response) into an inventory entry."""
    api_obj = api if isinstance(api, dict) else None
    card: Dict[str, Any] = {}
    from_api = False
    if api_obj is not None and isinstance(api_obj.get("cardData"), dict):
        card = api_obj["cardData"]
        from_api = True
    elif isinstance(readme, str):
        fm = split_front_matter(readme)
        if fm.yaml is not None:
            parsed = parse_yaml(fm.yaml, yaml_limits)
            if isinstance(parsed, dict):
                card = parsed
    api_id = api_obj.get("id") if api_obj is not None and isinstance(api_obj.get("id"), str) else None
    rid = api_id if api_id is not None and is_repo_id(api_id) else repo_id if repo_id is not None and is_repo_id(repo_id) else None
    pretty = _strings(card.get("pretty_name"), 1)
    notes: List[str] = []
    name = pretty[0] if pretty else rid if rid is not None else _js_slice_end(reference, 200)

    tags = _strings(api_obj.get("tags"), 5000) if api_obj is not None else []
    modalities = _modalities_from_tags(tags)
    if not modalities:
        from_features = _modalities_from_features(card.get("dataset_info"))
        from_tasks = [TASK_MODALITY[t] for t in _strings(card.get("task_categories")) if t in TASK_MODALITY]
        merged: List[str] = []
        for m in from_features + from_tasks:
            if m not in merged:
                merged.append(m)
        modalities = sorted(merged)
        if modalities:
            notes.append("Modalities were inferred from the card (feature types and task categories); check them.")
        else:
            notes.append("The card does not show the modalities; add them.")

    licenses = _strings(card.get("license"))
    license_name = _strings(card.get("license_name"), 1)
    if license_name:
        licenses.append(license_name[0])
    if not licenses:
        notes.append("The card names no licence; check the conditions of use.")
    elif "other" in licenses or "unknown" in licenses:
        notes.append('The card gives the licence as "other" or "unknown"; check the conditions of use.')

    sizes: List[Dict[str, Any]] = []
    total_bytes, examples = _sizes_from_info(card.get("dataset_info"))
    if len(modalities) == 1:
        m = modalities[0]
        if total_bytes is not None:
            sizes.append({"modality": m, "value": str(total_bytes), "unit": "bytes", "basis": "dataset_info.dataset_size in the dataset card (before any pre-processing of yours)", "after_preprocessing": False})
        if examples is not None:
            sizes.append({"modality": m, "value": str(examples), "unit": "examples", "basis": "dataset_info splits num_examples in the dataset card", "after_preprocessing": False})
    elif total_bytes is not None:
        notes.append("The card gives one size for several modalities; add a size per modality.")
    if not sizes:
        cats = _strings(card.get("size_categories"))
        if cats:
            notes.append(f"The card gives only a size category ({', '.join(cats)}, number of examples).")

    category: Optional[str] = "public"
    gated = api_obj.get("gated") if api_obj is not None else None
    is_private = api_obj is not None and api_obj.get("private") is True
    if is_private:
        category = None
        notes.append("The dataset is private on the Hub; it is not a publicly available dataset (Section 2.1).")
    elif gated in ("auto", "manual") or gated is True:
        shown = "true" if gated is True else str(gated)
        notes.append(f'Access to the dataset is gated on the Hub ({shown}); check whether it is "made available publicly for free" and "readily downloadable" (Section 2.1).')
    if api_obj is not None and api_obj.get("disabled") is True:
        notes.append("The dataset is disabled on the Hub.")
    sources = _strings(card.get("source_datasets"))
    if sources and not (len(sources) == 1 and sources[0] == "original"):
        notes.append(f"Source datasets named in the card: {', '.join(sources)}.")
    creators = _strings(card.get("annotations_creators")) + _strings(card.get("language_creators"))
    if "machine-generated" in creators:
        notes.append("The card says that content was machine-generated. Synthetic data you created, or had created for you, belongs in Section 2.5; a third-party public dataset stays in Section 2.1.")

    sha = api_obj.get("sha") if api_obj is not None else None
    revision = sha if isinstance(sha, str) and re.match(r"^[0-9a-f]{40}\Z", sha) else None
    return {
        "id": f"hf:{rid}" if rid is not None else f"card:{name}",
        "name": name,
        "link": f"https://huggingface.co/datasets/{rid}" if rid is not None else "",
        "category": category,
        "modalities": modalities,
        "languages": _strings(card.get("language")),
        "licenses": licenses,
        "sizes": sizes,
        "collection_period": {"start": None, "end": None},
        "publicly_known": None,
        "source": {"kind": "hf-hub" if from_api else "hf-card", "reference": _js_slice(reference, 1000), "revision": revision},
        "notes": notes,
    }


def _js_slice(s: str, n: int) -> str:
    """The first n UTF-16 code units, as String.prototype.slice(0, n)."""
    b = s.encode("utf-16-le", "surrogatepass")
    return b[: 2 * n].decode("utf-16-le", "surrogatepass")


def _js_slice_end(s: str, n: int) -> str:
    """The last n UTF-16 code units, as String.prototype.slice(-n)."""
    b = s.encode("utf-16-le", "surrogatepass")
    return b[-2 * n :].decode("utf-16-le", "surrogatepass") if len(b) > 2 * n else s
