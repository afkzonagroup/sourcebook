# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Sourcebook: the public summary of training content for general-purpose AI
models (Article 53(1)(d) of Regulation (EU) 2024/1689), in the AI Office
template.

Python port of the TypeScript package @afkzona/sourcebook, with the same
summary schema and shared test vectors. Sourcebook by AFKzona Group
(https://afkzonagroup.lt). Not legal advice.
"""

__version__ = "0.1.0"

from ._spec import FIELDS, KEY_DATES, SECTIONS, TEMPLATE, field  # noqa: E402
from .domains import DomainRanker, LimitError, bundled_public_suffix_list, check_host, host_of_url, normalise_host, registrable_domain, required_count, share_percent  # noqa: E402
from .hf_card import dataset_from_hf_card, is_repo_id  # noqa: E402
from .hub import HubError, fetch_hub_dataset  # noqa: E402
from .inventory import large_datasets, merge_inventories, new_inventory, parse_inventory, prefill_summary  # noqa: E402
from .manifest import datasets_from_csv_manifest, datasets_from_json_manifest  # noqa: E402
from .readers import CrawlLogError, ReaderLimits, read_cdx, read_cdxj, read_csv, read_warc  # noqa: E402
from .render import insert_into_model_card, model_card_snippet, render_json, render_markdown  # noqa: E402
from .schema import JsonInputError, SchemaError, empty_summary, parse_json_safe, parse_summary, parse_summary_text  # noqa: E402
from .validate import validate_summary  # noqa: E402
from .yaml_safe import YamlError, parse_yaml, split_front_matter  # noqa: E402

__all__ = [
    "FIELDS",
    "KEY_DATES",
    "SECTIONS",
    "TEMPLATE",
    "field",
    "DomainRanker",
    "LimitError",
    "bundled_public_suffix_list",
    "check_host",
    "host_of_url",
    "normalise_host",
    "registrable_domain",
    "required_count",
    "share_percent",
    "dataset_from_hf_card",
    "is_repo_id",
    "HubError",
    "fetch_hub_dataset",
    "large_datasets",
    "merge_inventories",
    "new_inventory",
    "parse_inventory",
    "prefill_summary",
    "datasets_from_csv_manifest",
    "datasets_from_json_manifest",
    "CrawlLogError",
    "ReaderLimits",
    "read_cdx",
    "read_cdxj",
    "read_csv",
    "read_warc",
    "insert_into_model_card",
    "model_card_snippet",
    "render_json",
    "render_markdown",
    "JsonInputError",
    "SchemaError",
    "empty_summary",
    "parse_json_safe",
    "parse_summary",
    "parse_summary_text",
    "validate_summary",
    "YamlError",
    "parse_yaml",
    "split_front_matter",
]
