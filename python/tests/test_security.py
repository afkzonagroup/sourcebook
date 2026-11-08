# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Hostile input and the network allow-list in the Python package."""

import gzip
import io
import os
import unittest

import sourcebook as sb
from sourcebook import domains, hub, readers
from sourcebook.yaml_safe import YamlLimits

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def example_text():
    with open(os.path.join(ROOT, "examples", "summary.yaml"), encoding="utf-8") as f:
        return f.read()


class LinearTimeTrimming(unittest.TestCase):
    """Trimming with re.sub(r"[ \\t]+\\Z", ...) takes quadratic time on a long run of
    blanks inside a value (50 000 spaces took about ten seconds); str.strip is linear."""

    BUDGET = 2.0
    GAP = " " * 200_000

    def timed(self, fn):
        import time

        start = time.perf_counter()
        fn()
        return time.perf_counter() - start

    def test_yaml_values_keys_and_quoted_strings(self):
        for text in (f"a: x{self.GAP}y\n", f"x{self.GAP}y: 1\n", f"a: 'x{self.GAP}y\n  z'\n"):
            self.assertLess(self.timed(lambda t=text: sb.parse_yaml(t)), self.BUDGET)

    def test_front_matter_lines(self):
        from sourcebook.yaml_safe import split_front_matter

        self.assertLess(self.timed(lambda: split_front_matter(f"---\na: 1\nx{self.GAP}y\n---\n")), self.BUDGET)

    def test_markdown_lines(self):
        from sourcebook.render import escape_text

        self.assertLess(self.timed(lambda: escape_text(f"x{self.GAP}y")), self.BUDGET)


class HostileYaml(unittest.TestCase):
    def test_billion_laughs_is_rejected_at_the_first_anchor(self):
        bomb = 'a: &a ["lol","lol"]\nb: &b [*a,*a]\nc: &c [*b,*b]\n'
        with self.assertRaises(sb.YamlError) as ctx:
            sb.parse_yaml(bomb)
        self.assertEqual(ctx.exception.code, "anchor-alias-tag")

    def test_deep_and_wide_documents_hit_the_limits(self):
        with self.assertRaises(sb.YamlError) as ctx:
            sb.parse_yaml("a: " + "[" * 100_000 + "]" * 100_000)
        self.assertEqual(ctx.exception.code, "too-deep")
        with self.assertRaises(sb.YamlError) as ctx:
            sb.parse_yaml("a: [" + ",".join("1" for _ in range(300_000)) + "]")
        self.assertEqual(ctx.exception.code, "too-many-nodes")
        with self.assertRaises(sb.YamlError):
            sb.parse_yaml('a: "' + "x" * 20 + '"', YamlLimits(max_scalar_length=10))

    def test_python_specific_tags_are_rejected(self):
        for text in ("a: !!python/object/apply:os.system ['id']\n", "a: !!binary aGk=\n", "? a\n: b\n", "<<: {a: 1}\n"):
            with self.assertRaises(sb.YamlError):
                sb.parse_yaml(text)

    def test_end_anchor_does_not_accept_a_trailing_newline(self):
        self.assertFalse(sb.is_repo_id("org/name\n"))
        with self.assertRaises(sb.SchemaError):
            sb.parse_summary({"sourcebook": 1, "last_update": "2026-01-01\n"})
        self.assertEqual(sb.host_of_url("https://a.com:80\n/x")["ok"], False)


class HostileJson(unittest.TestCase):
    def test_deep_json_is_rejected_before_parsing(self):
        with self.assertRaises(sb.JsonInputError):
            sb.parse_json_safe("[" * 100_000 + "]" * 100_000)

    def test_unknown_keys_are_errors(self):
        with self.assertRaises(sb.SchemaError) as ctx:
            sb.parse_summary_text('{"sourcebook": 1, "__proto__": {"x": 1}}', "json")
        self.assertEqual(ctx.exception.issues[0]["code"], "unknown-key")

    def test_cdxj_nan_is_invalid_json(self):
        f = {}
        list(sb.read_cdxj([b'a 20250101000000 {"url": "https://a.com/", "length": NaN}\n'], f))
        self.assertEqual(f, {"invalid_json": 1})


class Limits(unittest.TestCase):
    def test_long_lines_and_headers(self):
        with self.assertRaises(sb.LimitError):
            list(sb.read_cdx([b" CDX a S\n" + b"x" * 70_000 + b" 5\n"], {}))
        with self.assertRaises(sb.LimitError):
            list(sb.read_warc([b"WARC/1.0\r\nX: " + b"a" * 70_000 + b"\r\n"], {}))
        with self.assertRaises(sb.LimitError):
            list(sb.read_warc([b"WARC/1.0\r\nWARC-Type: resource\r\nContent-Length: 1\r\n\r\nx\r\n\r\n"] * 3, {}, limits=readers.ReaderLimits(max_records=1)))

    def test_line_without_break_is_stopped_early(self):
        produced = []

        def endless():
            yield b" CDX a S\n"
            for _ in range(10_000):
                produced.append(1)
                yield b"x" * 4096

        with self.assertRaises(sb.LimitError):
            list(sb.read_cdx(endless(), {}))
        self.assertLess(len(produced), 40)

    def test_many_warc_headers(self):
        headers = b"".join(b"X-%d: %s\r\n" % (i, b"a" * 40) for i in range(2000))
        with self.assertRaises(sb.LimitError) as ctx:
            list(sb.read_warc([b"WARC/1.0\r\n" + headers + b"\r\n"], {}))
        self.assertEqual(ctx.exception.code, "header-too-long")

    def test_truncated_warc(self):
        with self.assertRaises(sb.CrawlLogError) as ctx:
            list(sb.read_warc([b"WARC/1.0\r\nWARC-Type: resource\r\nWARC-Target-URI: https://a.com/\r\nContent-Length: 100\r\n\r\nshort"], {}))
        self.assertEqual(ctx.exception.code, "truncated")

    def test_domain_limit(self):
        r = sb.DomainRanker(max_domains=1)
        r.add({"url": "https://a.com/", "size": 1})
        with self.assertRaises(sb.LimitError):
            r.add({"url": "https://b.com/", "size": 1})
        with self.assertRaises(ValueError):
            r.add({"url": "https://a.com/", "size": -1})

    def test_bundled_list_checksum(self):
        with self.assertRaises(ValueError):
            domains.load_bundled_text(gzip.compress(b"// ===BEGIN ICANN DOMAINS===\ncom\n"))


class FakeHub:
    """Answers requests from a table and records them."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def __call__(self, url, timeout):
        self.calls.append(url)
        if len(self.calls) > 20:
            raise AssertionError("too many requests: the redirect limit is missing")
        for prefix, answer in self.routes.items():
            if url.startswith(prefix):
                status, headers, body = answer
                return status, headers, io.BytesIO(body).read
        return 404, {}, io.BytesIO(b"").read


class HubAllowList(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT, "test", "fixtures", "hf", "rajpurkar_squad.api.json"), "rb") as f:
            self.api = f.read()

    def test_reads_only_from_huggingface(self):
        fake = FakeHub({"https://huggingface.co/api/datasets/rajpurkar/squad?": (200, {}, self.api), "https://huggingface.co/datasets/rajpurkar/squad/raw/main/README.md": (200, {}, b"---\na: 1\n---\n")})
        out = sb.fetch_hub_dataset("rajpurkar/squad", open_fn=fake)
        self.assertEqual(out["readme"], "---\na: 1\n---\n")
        self.assertTrue(all(u.startswith("https://huggingface.co/") for u in fake.calls))
        d = sb.dataset_from_hf_card(out["reference"], readme=out["readme"], api=out["api"])
        self.assertEqual(d["source"]["kind"], "hf-hub")

    def test_refuses_redirects_to_other_hosts(self):
        for location in ("https://evil.example/x", "http://huggingface.co/x", "https://huggingface.co:444/x", "https://user@huggingface.co/x", "//evil.example/x"):
            fake = FakeHub({"https://huggingface.co/api/": (302, {"location": location}, b"")})
            with self.assertRaises(hub.HubError) as ctx:
                sb.fetch_hub_dataset("a/b", open_fn=fake)
            self.assertEqual(ctx.exception.code, "bad-redirect", location)
            self.assertEqual(len(fake.calls), 1)

    def test_size_cap_redirect_loop_and_errors(self):
        big = FakeHub({"https://huggingface.co/api/": (200, {}, b"x" * 5000)})
        with self.assertRaises(hub.HubError) as ctx:
            sb.fetch_hub_dataset("a/b", open_fn=big, max_bytes=1024)
        self.assertEqual(ctx.exception.code, "too-large")
        loop = FakeHub({"https://huggingface.co/": (302, {"location": "/api/datasets/a/b?again"}, b"")})
        with self.assertRaises(hub.HubError) as ctx:
            sb.fetch_hub_dataset("a/b", open_fn=loop)
        self.assertEqual(ctx.exception.code, "too-many-redirects")
        with self.assertRaises(hub.HubError) as ctx:
            sb.fetch_hub_dataset("a/b", open_fn=FakeHub({}))
        self.assertEqual(ctx.exception.code, "not-found")

        def timeout(url, t):
            raise TimeoutError()

        with self.assertRaises(hub.HubError) as ctx:
            sb.fetch_hub_dataset("a/b", open_fn=timeout)
        self.assertEqual(ctx.exception.code, "network")

    def test_total_time_limit_while_reading(self):
        import time

        def trickle(url, t):
            def read(n):
                time.sleep(0.01)
                return b"x"

            return 200, {}, read

        start = time.monotonic()
        with self.assertRaises(hub.HubError) as ctx:
            sb.fetch_hub_dataset("a/b", open_fn=trickle, timeout=0.05, max_bytes=2048)
        self.assertEqual(ctx.exception.code, "network")
        self.assertLess(time.monotonic() - start, 2.0)

    def test_validates_ids_and_revisions(self):
        fake = FakeHub({})
        with self.assertRaises(hub.HubError):
            sb.fetch_hub_dataset("../admin", open_fn=fake)
        with self.assertRaises(hub.HubError):
            sb.fetch_hub_dataset("a/b", revision="../x", open_fn=fake)
        self.assertEqual(fake.calls, [])
        self.assertFalse(hub.is_allowed_url("https://huggingface.co.evil.example/"))


class Rendering(unittest.TestCase):
    def test_markdown_escapes_hostile_text(self):
        data = sb.parse_yaml(example_text())
        data["general_information"]["provider"]["name_and_contact_details"] = "<script>x</script> [a](javascript:b)"
        md = sb.render_markdown(sb.parse_summary(data))
        self.assertNotIn("<script>", md)
        self.assertIn("\\<script\\>", md)
        self.assertIn("Sourcebook by AFKzona Group", md)

    def test_markdown_never_links_a_non_http_url_set_in_code(self):
        import re

        summary = sb.parse_summary_text(example_text())
        summary["data_sources"]["public_datasets"]["large_datasets"][0]["link"] = "javascript:alert(1)"
        summary["general_information"]["model"]["versioned_model_names"][0]["documentation_links"] = ["https://a.example/x> [y](javascript:alert(2)"]
        out = sb.render_markdown(summary)
        self.assertNotIn("<javascript:", out)
        self.assertIsNone(re.search(r"(?<!\\)\]\(<?javascript", out))
        self.assertIn("javascript:alert(1)", out)
        self.assertIn("https://a.example/x\\> \\[y\\](javascript:alert(2)", out)

    def test_model_card_insert_is_idempotent(self):
        s = sb.parse_summary_text(example_text())
        snippet = sb.model_card_snippet(s, "https://example.org/s")
        once = sb.insert_into_model_card("---\nlicense: mit\n---\n# M\n", snippet)
        self.assertEqual(sb.insert_into_model_card(once, snippet), once)
        with self.assertRaises(ValueError):
            sb.model_card_snippet(s, "javascript:alert(1)")


class Validation(unittest.TestCase):
    def test_invalid_as_of(self):
        s = sb.parse_summary_text(example_text())
        with self.assertRaises(ValueError):
            sb.validate_summary(s, as_of="2026-02-30")


class Manifests(unittest.TestCase):
    def test_json_and_csv(self):
        ds = sb.datasets_from_json_manifest({"datasets": [{"name": "A", "category": "public", "modalities": ["text"], "sizes": [{"modality": "text", "value": 5, "unit": "tokens"}]}]}, "m.json")
        self.assertEqual(ds[0]["sizes"][0]["value"], "5")
        csv = b"name,category,modality,size,unit\nB,licensed,text,7,tokens\n"
        ds = sb.datasets_from_csv_manifest([csv], "m.csv")
        self.assertEqual(ds[0]["category"], "licensed")
        with self.assertRaises(sb.CrawlLogError):
            sb.datasets_from_csv_manifest([b"name,evil\nx,1\n"], "m.csv")

    def test_csv_row_length_limit(self):
        with self.assertRaises(sb.LimitError) as ctx:
            list(sb.read_csv([b'url,size\n"' + b"x" * 70_000 + b'",1\n'], {}, url="url", size="size"))
        self.assertEqual(ctx.exception.code, "line-too-long")


if __name__ == "__main__":
    unittest.main()
