# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""The template data shared with the TypeScript package (spec/template-v1.json)."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Any, Dict

SPEC: Dict[str, Any] = json.loads(files("sourcebook").joinpath("data/template-v1.json").read_text(encoding="utf-8"))

TEMPLATE: Dict[str, str] = SPEC["template"]
FIELDS = SPEC["fields"]
SECTIONS = SPEC["sections"]
SIZE_RANGES: Dict[str, Any] = SPEC["size_ranges"]
MODALITY_TABLE: Dict[str, Any] = SPEC["modality_table"]
CHECKBOX: Dict[str, str] = SPEC["checkbox"]
KEY_DATES: Dict[str, str] = SPEC["key_dates"]
MESSAGES: Dict[str, str] = SPEC["messages"]
SCHEMA_MESSAGES: Dict[str, str] = SPEC["schema_messages"]
FORMAT_VERSION: int = SPEC["format_version"]
STANDARD_MODALITIES = ("text", "image", "audio", "video")
CHECKBOX_MODALITIES = ("text", "image", "video", "audio")

_BY_ID = {f["id"]: f for f in FIELDS}


def field(field_id: str) -> Dict[str, Any]:
    """Looks up a template field by id."""
    try:
        return _BY_ID[field_id]
    except KeyError:
        raise KeyError(f"Unknown template field: {field_id}") from None
