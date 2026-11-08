# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""The shared test vectors: the Python package must give the same results as
the TypeScript package, byte for byte where output is text."""

import json
import os
import unittest

import sourcebook as sb
from sourcebook import domains, readers
from sourcebook.schema import is_link
from sourcebook.yaml_safe import YamlLimits

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def vectors(name):
    with open(os.path.join(ROOT, "test-vectors", name), encoding="utf-8") as f:
        return json.load(f)


def fixture(name):
    return os.path.join(ROOT, "test", "fixtures", name)


def chunks(data, size):
    for i in range(0, len(data), size):
        yield data[i : i + size]


class YamlVectors(unittest.TestCase):
    def test_vectors(self):
        cases = vectors("yaml.json")
        self.assertGreater(len(cases), 40)
        for v in cases:
            with self.subTest(v["name"]):
                lim = v.get("limits")
                limits = YamlLimits(lim["maxDepth"], lim["maxNodes"], lim["maxScalarLength"]) if lim else YamlLimits()
                if "error" in v:
                    with self.assertRaises(sb.YamlError) as ctx:
                        sb.parse_yaml(v["input"], limits)
                    self.assertEqual(ctx.exception.code, v["error"])
                    self.assertEqual(ctx.exception.line, v["line"])
                else:
                    self.assertEqual(sb.parse_yaml(v["input"], limits), v["expect"])

    def test_real_cards_match_hub(self):
        names = [f[:-10] for f in os.listdir(fixture("hf")) if f.endswith(".README.md")]
        self.assertGreaterEqual(len(names), 14)
        for n in names:
            with self.subTest(n):
                with open(fixture(f"hf/{n}.api.json"), encoding="utf-8") as f:
                    api = json.load(f)
                with open(fixture(f"hf/{n}.README.md"), encoding="utf-8") as f:
                    fm = sb.split_front_matter(f.read())
                self.assertEqual(sb.parse_yaml(fm.yaml or ""), api["cardData"])


class HostVectors(unittest.TestCase):
    def test_hosts(self):
        v = vectors("hosts.json")
        for c in v["urls"]:
            with self.subTest(c["input"]):
                self.assertEqual(sb.host_of_url(c["input"]), c["expect"])
        for c in v["punycode"]:
            self.assertEqual(domains.punycode_encode(c["input"]), c["expect"])
        for c in v["surt"]:
            self.assertEqual(readers.host_of_surt(c["input"]), c["expect"])
        for c in v["links"]:
            with self.subTest(c["input"]):
                self.assertEqual(is_link(c["input"]), c["expect"])
        for c in v["required_count"]:
            self.assertEqual(sb.required_count(c["n"], c["sme"]), c["expect"])
        for c in v["share"]:
            self.assertEqual(sb.share_percent(int(c["size"]), int(c["total"])), c["expect"])

    def test_public_suffix_list(self):
        psl = sb.bundled_public_suffix_list()
        for c in vectors("psl.json")["cases"]:
            with self.subTest(c["input"]):
                host = sb.normalise_host(c["input"])
                got = None if host is None or c["input"].startswith(".") else sb.registrable_domain(host, psl, True)
                want = None if c["expect"] is None else sb.normalise_host(c["expect"])
                self.assertEqual(got, want)


class RankingVectors(unittest.TestCase):
    def test_ranking(self):
        for v in vectors("ranking.json"):
            with self.subTest(v["name"]):
                o = v["options"]
                r = sb.DomainRanker(
                    sme=o.get("sme", False),
                    ties=o.get("ties", "include"),
                    modality_mode=o.get("modalityMode", "combined"),
                    include_private_suffixes=o.get("includePrivateSuffixes", False),
                    max_domains=1000,
                )
                for rec in v["records"]:
                    r.add({**rec, "size": int(rec["size"])})
                rep = r.report()
                got = {
                    "method": {**rep["method"], "public_suffix_list": "(bundled)"},
                    "records": rep["records"],
                    "collection_period": rep["collection_period"],
                    "totals": rep["totals"],
                    "groups": rep["groups"],
                    "domains": rep["domains"],
                }
                self.assertEqual(got, v["expect"])


class CrawlVectors(unittest.TestCase):
    def test_readers(self):
        for v in vectors("crawl.json"):
            for size in (1, 7, 97, 65536):
                with self.subTest(file=v["file"], chunk=size):
                    with open(fixture("crawl/" + v["file"]), "rb") as f:
                        data = f.read()
                    filtered = {}
                    if v["kind"] == "warc":
                        gen = sb.read_warc(chunks(data, size), filtered)
                    elif v["kind"] == "cdx":
                        gen = sb.read_cdx(chunks(data, size), filtered)
                    elif v["kind"] == "cdxj":
                        gen = sb.read_cdxj(chunks(data, size), filtered)
                    else:
                        gen = sb.read_csv(chunks(data, size), filtered, size="bytes", url="url", modality="modality", date="date")
                    got = [{**r, "size": str(r["size"])} for r in gen]
                    self.assertEqual(got, v["records"])
                    self.assertEqual(dict(sorted(filtered.items())), v["filtered"])

    def test_gzip_warc(self):
        import gzip

        with gzip.open(fixture("crawl/sample.warc.gz"), "rb") as f:
            got = [{**r, "size": str(r["size"])} for r in sb.read_warc(iter(lambda: f.read(4096), b""), {})]
        plain = next(v for v in vectors("crawl.json") if v["file"] == "sample.warc")
        self.assertEqual(got, plain["records"])


class CardVectors(unittest.TestCase):
    def test_cards(self):
        for v in vectors("cards.json"):
            with self.subTest(fixture=v["fixture"], mode=v["mode"]):
                with open(fixture(f"hf/{v['fixture']}.api.json"), encoding="utf-8") as f:
                    api = json.load(f)
                readme = None
                if v["mode"] != "api-no-readme":
                    with open(fixture(f"hf/{v['fixture']}.README.md"), encoding="utf-8") as f:
                        readme = f.read()
                if v["mode"] == "offline":
                    got = sb.dataset_from_hf_card(f"{v['fixture']}.README.md", readme=readme, repo_id=api["id"])
                else:
                    got = sb.dataset_from_hf_card(f"https://huggingface.co/api/datasets/{api['id']}", readme=readme, api=api, repo_id=api["id"])
                self.assertEqual(got, v["expect"])


class SummaryVectors(unittest.TestCase):
    def test_summaries(self):
        for v in vectors("summaries.json"):
            with self.subTest(v["name"]):
                s = sb.parse_summary(v["input"])
                self.assertEqual(s, v["normalized"])
                self.assertEqual(sb.validate_summary(s, as_of=v["as_of"]), v["validation"])
                self.assertEqual(sb.render_markdown(s), v["markdown"])
                if v["markdown_with_instructions"] is not None:
                    self.assertEqual(sb.render_markdown(s, instructions=True), v["markdown_with_instructions"])
                self.assertEqual(sb.render_json(s).replace(sb.render.GENERATOR, "(generator)"), v["json"])
                self.assertEqual(sb.model_card_snippet(s, "https://example.org/summary"), v["model_card"])

    def test_schema_errors(self):
        for v in vectors("schema-errors.json"):
            with self.subTest(v["name"]):
                with self.assertRaises(sb.SchemaError) as ctx:
                    sb.parse_summary(v["input"])
                self.assertEqual(ctx.exception.issues, v["issues"])


class InventoryVectors(unittest.TestCase):
    def test_inventory(self):
        for v in vectors("inventory.json"):
            with self.subTest(v["name"]):
                inv = sb.parse_inventory({"kind": "sourcebook-inventory", "version": 1, "datasets": v["datasets"], "domain_report": None})
                self.assertEqual(sb.large_datasets(inv["datasets"]), v["large"])
                pre = sb.prefill_summary(inv)
                self.assertEqual(pre["summary"], v["prefill"])
                self.assertEqual(pre["hints"], v["hints"])


class SpecFile(unittest.TestCase):
    def test_bundled_spec_matches_repository_copy(self):
        from importlib.resources import files

        with open(os.path.join(ROOT, "spec", "template-v1.json"), encoding="utf-8") as f:
            self.assertEqual(files("sourcebook").joinpath("data/template-v1.json").read_text(encoding="utf-8"), f.read())


if __name__ == "__main__":
    unittest.main()
