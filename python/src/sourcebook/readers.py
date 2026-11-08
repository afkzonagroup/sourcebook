# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Streaming crawl log readers: WARC, CDX, CDXJ and CSV (port of src/domains/readers.ts).

Each reader takes an iterable of ``bytes`` chunks (for example
``iter(lambda: f.read(1 << 20), b"")``) and yields records for
``DomainRanker.add``. Memory stays bounded by the line, header and field caps.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from .domains import LimitError


@dataclass(frozen=True)
class ReaderLimits:
    max_line_bytes: int = 65_536
    max_header_bytes: int = 65_536
    max_records: int = 1_000_000_000
    max_bytes: int = 2**50


DEFAULT_READER_LIMITS = ReaderLimits()


class CrawlLogError(ValueError):
    def __init__(self, code: str, position: str, message: str) -> None:
        super().__init__(f"{position}: {message}")
        self.code = code
        self.position = position


def _bump(counts: Dict[str, int], reason: str) -> None:
    counts[reason] = counts.get(reason, 0) + 1


def modality_of_mime(mime: str) -> str:
    m = mime.strip().lower().split(";")[0].strip()
    if m.startswith("text/") or m in ("application/xhtml+xml", "application/json", "application/xml", "application/pdf"):
        return "text"
    if m.startswith("image/"):
        return "image"
    if m.startswith("audio/"):
        return "audio"
    if m.startswith("video/"):
        return "video"
    return "other"


def month_of(value: str) -> Optional[str]:
    m = re.match(r"^([0-9]{4})-([0-9]{2})", value) or re.match(r"^([0-9]{4})([0-9]{2})[0-9]{2}", value)
    if m is None:
        return None
    return f"{m.group(1)}-{m.group(2)}" if 1 <= int(m.group(2)) <= 12 else None


_ASCII_WS = " \t\n\r\v\f"


def parse_size(text: str) -> Optional[int]:
    t = text.strip(_ASCII_WS)
    return int(t) if re.match(r"^[0-9]{1,30}\Z", t) else None


def _decode(b: bytes) -> Optional[str]:
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return None


class _ByteReader:
    def __init__(self, source: Iterable[bytes], limits: ReaderLimits) -> None:
        self._it = iter(source)
        self._buf = b""
        self._pos = 0
        self._done = False
        self._limits = limits
        self._received = 0
        self.offset = 0

    def _available(self) -> int:
        return len(self._buf) - self._pos

    def _fill(self) -> bool:
        if self._done:
            return False
        try:
            chunk = next(self._it)
        except StopIteration:
            self._done = True
            return False
        self._received += len(chunk)
        if self._received > self._limits.max_bytes:
            raise LimitError("too-many-bytes", f"The input is larger than {self._limits.max_bytes} bytes.")
        self._buf = self._buf[self._pos :] + bytes(chunk)
        self._pos = 0
        return True

    def read_line(self, max_len: int, code: str) -> Optional[bytes]:
        search_from = self._pos
        while True:
            nl = self._buf.find(b"\n", search_from)
            if nl >= 0:
                if nl - self._pos > max_len:
                    raise LimitError(code, f"A line is longer than {max_len} bytes.")
                end = nl
                if end > self._pos and self._buf[end - 1] == 13:
                    end -= 1
                line = self._buf[self._pos : end]
                self.offset += nl + 1 - self._pos
                self._pos = nl + 1
                return line
            if self._available() > max_len:
                raise LimitError(code, f"A line is longer than {max_len} bytes.")
            search_from = len(self._buf)
            before = self._pos
            if not self._fill():
                if self._available() == 0:
                    return None
                line = self._buf[self._pos :]
                self.offset += self._available()
                self._pos = len(self._buf)
                return line
            search_from -= before

    def peek(self, n: int) -> bytes:
        while self._available() < n and self._fill():
            pass
        return self._buf[self._pos : self._pos + min(n, self._available())]

    def skip(self, n: int) -> bool:
        left = n
        while True:
            take = min(left, self._available())
            self._pos += take
            self.offset += take
            left -= take
            if left == 0:
                return True
            self._buf = b""
            self._pos = 0
            if not self._fill():
                return False

    def skip_blank_bytes(self) -> bool:
        while True:
            while self._available() > 0:
                b = self._buf[self._pos]
                if b not in (10, 13):
                    return True
                self._pos += 1
                self.offset += 1
            if not self._fill():
                return False


def read_warc(source: Iterable[bytes], filtered: Dict[str, int], types: Tuple[str, ...] = ("response", "resource", "conversion"), only_2xx: bool = True, limits: ReaderLimits = DEFAULT_READER_LIMITS) -> Iterator[Dict[str, Any]]:
    r = _ByteReader(source, limits)
    records = 0
    while True:
        if not r.skip_blank_bytes():
            return
        start = r.offset
        first = r.read_line(limits.max_header_bytes, "header-too-long")
        if first is None:
            return
        version = _decode(first) or ""
        if not re.match(r"^WARC/1\.[01]\Z", version):
            raise CrawlLogError("not-warc", f"byte {start}", "Expected a WARC/1.0 or WARC/1.1 record.")
        headers: Dict[str, str] = {}
        header_bytes = len(first)
        while True:
            line = r.read_line(limits.max_header_bytes, "header-too-long")
            if line is None:
                raise CrawlLogError("truncated", f"byte {start}", "The WARC record header is incomplete.")
            if len(line) == 0:
                break
            header_bytes += len(line)
            if header_bytes > limits.max_header_bytes:
                raise LimitError("header-too-long", f"A WARC header is longer than {limits.max_header_bytes} bytes.")
            text = _decode(line)
            if text is None:
                raise CrawlLogError("bad-header", f"byte {start}", "A WARC header is not valid UTF-8.")
            colon = text.find(":")
            if colon <= 0:
                continue
            headers[text[:colon].strip(" \t").lower()] = text[colon + 1 :].strip(" \t")
        length_text = headers.get("content-length", "")
        if not re.match(r"^[0-9]{1,15}\Z", length_text):
            raise CrawlLogError("bad-length", f"byte {start}", "The WARC record has no valid Content-Length.")
        length = int(length_text)
        records += 1
        if records > limits.max_records:
            raise LimitError("too-many-records", f"More than {limits.max_records} records.")
        rtype = headers.get("warc-type", "").lower()
        uri = re.sub(r"^<([\s\S]*)>\Z", r"\1", headers.get("warc-target-uri", ""))
        record = None
        if rtype not in types:
            _bump(filtered, "warc_" + ("untyped" if rtype == "" else re.sub(r"[^a-z0-9_-]", "_", rtype)[:32]))
        elif uri == "":
            _bump(filtered, "no_target_uri")
        else:
            size = length
            modality = None
            content_type = headers.get("content-type", "").lower()
            keep = True
            if rtype == "response" and content_type.startswith("application/http"):
                head = r.peek(min(length, limits.max_header_bytes))
                end = head.find(b"\r\n\r\n")
                sep = 4
                if end < 0:
                    end = head.find(b"\n\n")
                    sep = 2
                if end >= 0:
                    size = length - end - sep
                    http_head = _decode(head[:end]) or ""
                    status = re.match(r"^HTTP/[0-9.]+ ([0-9]{3})", http_head)
                    if only_2xx and (status is None or not status.group(1).startswith("2")):
                        keep = False
                        _bump(filtered, "http_status_unknown" if status is None else "http_not_2xx")
                    ct = re.search(r"\r?\ncontent-type:[ \t]*([^\r\n]*)", http_head, re.IGNORECASE)
                    if ct is not None:
                        modality = modality_of_mime(ct.group(1))
                else:
                    _bump(filtered, "http_headers_not_found")
                    keep = False
            elif content_type != "":
                modality = modality_of_mime(content_type)
            if keep:
                record = {"url": uri, "size": size}
                if modality is not None:
                    record["modality"] = modality
                month = month_of(headers.get("warc-date", ""))
                if month is not None:
                    record["month"] = month
        if not r.skip(length):
            raise CrawlLogError("truncated", f"byte {start}", "The WARC record block is incomplete.")
        if record is not None:
            yield record


def _read_lines(source: Iterable[bytes], limits: ReaderLimits) -> Iterator[Tuple[int, Optional[str]]]:
    r = _ByteReader(source, limits)
    no = 0
    while True:
        line = r.read_line(limits.max_line_bytes, "line-too-long")
        if line is None:
            return
        no += 1
        if no > limits.max_records:
            raise LimitError("too-many-records", f"More than {limits.max_records} lines.")
        text = _decode(line)
        if no == 1 and text is not None and text.startswith("\ufeff"):
            text = text[1:]
        yield no, text


def host_of_surt(surt: str) -> Optional[str]:
    m = re.match(r"^([^)/\s]+)\)", re.sub(r"^https?://\(?", "", surt))
    if m is None:
        return None
    parts = [p for p in m.group(1).split(":")[0].split(",") if p != ""]
    if not parts:
        return None
    return ".".join(reversed(parts))


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not JSON")


def _extra(modality: Optional[str], month: Optional[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if modality is not None:
        out["modality"] = modality
    if month is not None:
        out["month"] = month
    return out


def read_cdx(source: Iterable[bytes], filtered: Dict[str, int], limits: ReaderLimits = DEFAULT_READER_LIMITS) -> Iterator[Dict[str, Any]]:
    fields: Optional[List[str]] = None
    for no, text in _read_lines(source, limits):
        if text is None:
            if fields is None:
                raise CrawlLogError("bad-legend", f"line {no}", "The CDX legend is not valid UTF-8.")
            _bump(filtered, "invalid_encoding")
            continue
        if fields is None:
            legend = [p for p in re.split(r"[ \t]+", text.strip(_ASCII_WS))]
            if not legend or legend[0] != "CDX":
                raise CrawlLogError("bad-legend", f"line {no}", 'A CDX file must start with a " CDX" legend line.')
            fields = legend[1:]
            if "S" not in fields:
                raise CrawlLogError("no-size", f"line {no}", "The CDX legend has no S (record size) field.")
            if "a" not in fields and "N" not in fields:
                raise CrawlLogError("no-url", f"line {no}", "The CDX legend has no a (URL) or N (SURT) field.")
            continue
        if text.strip(_ASCII_WS) == "":
            continue
        parts = text.strip(_ASCII_WS).split(" ")

        legend_fields: List[str] = fields

        def get(f: str) -> str:
            i = legend_fields.index(f) if f in legend_fields else -1
            return parts[i] if 0 <= i < len(parts) else ""

        mime = get("m")
        status = get("s")
        if mime.lower() == "warc/revisit":
            _bump(filtered, "revisit")
            continue
        if status not in ("", "-") and not status.startswith("2"):
            _bump(filtered, "http_not_2xx")
            continue
        size = parse_size(get("S"))
        if size is None:
            _bump(filtered, "invalid_size")
            continue
        a = get("a")
        extra = _extra(None if mime in ("", "-") else modality_of_mime(mime), month_of(get("b")))
        if a not in ("", "-"):
            yield {"url": a, "size": size, **extra}
        else:
            host = host_of_surt(get("N"))
            if host is None:
                _bump(filtered, "invalid_surt")
            else:
                yield {"host": host, "size": size, **extra}


def read_cdxj(source: Iterable[bytes], filtered: Dict[str, int], limits: ReaderLimits = DEFAULT_READER_LIMITS) -> Iterator[Dict[str, Any]]:
    for _no, text in _read_lines(source, limits):
        if text is None:
            _bump(filtered, "invalid_encoding")
            continue
        if text.strip(_ASCII_WS) == "" or text.startswith("!"):
            continue
        m = re.match(r"^([^ \t]+) ([^ \t]+) (\{[\s\S]*\})[ \t]*\Z", text)
        if m is None:
            _bump(filtered, "invalid_line")
            continue
        try:
            data = json.loads(m.group(3), parse_constant=_reject_constant)
        except (ValueError, RecursionError):
            _bump(filtered, "invalid_json")
            continue
        if not isinstance(data, dict):
            _bump(filtered, "invalid_json")
            continue

        def s(k: str) -> str:
            v = data.get(k)
            if isinstance(v, str):
                return v
            if isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer() and abs(v) <= 2**53 - 1:
                return str(int(v))
            return ""

        mime = s("mime")
        status = s("status")
        if mime.lower() == "warc/revisit":
            _bump(filtered, "revisit")
            continue
        if status not in ("", "-") and not status.startswith("2"):
            _bump(filtered, "http_not_2xx")
            continue
        size = parse_size(s("length"))
        if size is None:
            _bump(filtered, "invalid_size")
            continue
        url = s("url")
        extra = _extra(None if mime in ("", "-") else modality_of_mime(mime), month_of(m.group(2)))
        if url != "":
            yield {"url": url, "size": size, **extra}
        else:
            host = host_of_surt(m.group(1))
            if host is None:
                _bump(filtered, "invalid_surt")
            else:
                yield {"host": host, "size": size, **extra}


def read_csv_rows(source: Iterable[bytes], delimiter: str = ",", limits: ReaderLimits = DEFAULT_READER_LIMITS) -> Iterator[Tuple[int, List[str]]]:
    """RFC 4180 rows, streamed. Same state machine as the TypeScript reader."""
    import codecs

    dec = codecs.getincrementaldecoder("utf-8")("strict")
    state = {"s": "start", "row": 1, "chars": 0, "first": True}
    fields: List[str] = []
    field: List[str] = []
    out: List[Tuple[int, List[str]]] = []

    def end_field() -> None:
        fields.append("".join(field))
        field.clear()
        if len(fields) > 256:
            raise LimitError("too-many-fields", f"Row {state['row']} has more than 256 fields.")

    def add(ch: str) -> None:
        field.append(ch)
        state["chars"] += 1
        if state["chars"] > limits.max_line_bytes:
            raise LimitError("line-too-long", f"Row {state['row']} is longer than {limits.max_line_bytes} characters.")

    def end_row() -> None:
        out.append((state["row"], list(fields)))
        fields.clear()
        state["chars"] = 0
        state["row"] += 1

    def process(text: str) -> None:
        for ch in text:
            # Characters outside the BMP count as two, as in JavaScript.
            st = state["s"]
            if st in ("start", "unquoted"):
                if ch == '"':
                    if st == "unquoted":
                        raise CrawlLogError("bad-csv", f"row {state['row']}", "A quote inside an unquoted field.")
                    state["s"] = "quoted"
                elif ch == delimiter:
                    end_field()
                    state["s"] = "start"
                elif ch == "\n":
                    if field and field[-1] == "\r":
                        field.pop()
                    end_field()
                    end_row()
                    if state["row"] > limits.max_records:
                        raise LimitError("too-many-records", f"More than {limits.max_records} rows.")
                    state["s"] = "start"
                else:
                    add(ch)
                    if ord(ch) > 0xFFFF:
                        state["chars"] += 1
                    state["s"] = "unquoted"
            elif st == "quoted":
                if ch == '"':
                    state["s"] = "quote-in-quoted"
                else:
                    add(ch)
                    if ord(ch) > 0xFFFF:
                        state["chars"] += 1
            elif st == "quote-in-quoted":
                if ch == '"':
                    add('"')
                    state["s"] = "quoted"
                elif ch == delimiter:
                    end_field()
                    state["s"] = "start"
                elif ch == "\r":
                    state["s"] = "cr-after-quote"
                elif ch == "\n":
                    end_field()
                    end_row()
                    state["s"] = "start"
                else:
                    raise CrawlLogError("bad-csv", f"row {state['row']}", "Unexpected character after a closing quote.")
            else:
                if ch != "\n":
                    raise CrawlLogError("bad-csv", f"row {state['row']}", "Unexpected character after a closing quote.")
                end_field()
                end_row()
                state["s"] = "start"

    total = 0
    for chunk in source:
        total += len(chunk)
        if total > limits.max_bytes:
            raise LimitError("too-many-bytes", f"The input is larger than {limits.max_bytes} bytes.")
        try:
            text = dec.decode(bytes(chunk))
        except UnicodeDecodeError:
            raise CrawlLogError("bad-encoding", f"row {state['row']}", "The CSV file is not valid UTF-8.") from None
        if state["first"] and text != "":
            if text.startswith("\ufeff"):
                text = text[1:]
            state["first"] = False
        process(text)
        yield from out
        out.clear()
    try:
        process(dec.decode(b"", final=True))
    except UnicodeDecodeError:
        raise CrawlLogError("bad-encoding", f"row {state['row']}", "The CSV file is not valid UTF-8.") from None
    if state["s"] == "quoted":
        raise CrawlLogError("bad-csv", f"row {state['row']}", "Unterminated quoted field.")
    if state["s"] != "start" or fields:
        if field and field[-1] == "\r":
            field.pop()
        end_field()
        out.append((state["row"], list(fields)))
    yield from out


def read_csv(
    source: Iterable[bytes],
    filtered: Dict[str, int],
    size: str,
    url: Optional[str] = None,
    host: Optional[str] = None,
    modality: Optional[str] = None,
    date: Optional[str] = None,
    delimiter: str = ",",
    limits: ReaderLimits = DEFAULT_READER_LIMITS,
) -> Iterator[Dict[str, Any]]:
    if (url is None) == (host is None):
        raise ValueError("Give exactly one of the url and host columns.")
    index: Optional[Dict[str, int]] = None
    for row, fields in read_csv_rows(source, delimiter, limits):
        if index is None:

            def find(name: Optional[str]) -> int:
                if name is None:
                    return -1
                for i, f in enumerate(fields):
                    if f.strip(" \t") == name:
                        return i
                raise CrawlLogError("missing-column", f"row {row}", f'The header has no column named "{name[:64]}".')

            index = {"url": find(url), "host": find(host), "size": find(size), "modality": find(modality), "date": find(date)}
            continue
        if len(fields) == 1 and fields[0] == "":
            continue

        def cell(i: int) -> str:
            return fields[i] if 0 <= i < len(fields) else ""

        sz = parse_size(cell(index["size"]))
        if sz is None:
            _bump(filtered, "invalid_size")
            continue
        mod = cell(index["modality"]).strip(_ASCII_WS).lower() if index["modality"] >= 0 else ""
        month = month_of(cell(index["date"]).strip(_ASCII_WS)) if index["date"] >= 0 else None
        extra = _extra(None if mod == "" else mod[:32], month)
        if index["url"] >= 0:
            yield {"url": cell(index["url"]).strip(_ASCII_WS), "size": sz, **extra}
        else:
            yield {"host": cell(index["host"]).strip(_ASCII_WS), "size": sz, **extra}
