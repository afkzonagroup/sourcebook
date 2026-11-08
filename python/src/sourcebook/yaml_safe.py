# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""A strict parser for a safe subset of YAML 1.2.

Line-by-line port of ``src/yaml/parse.ts``; the shared vectors in
``test-vectors/yaml.json`` keep both implementations identical. Anchors,
aliases, tags, merge keys, complex keys, directives, several documents,
duplicate keys and the keys ``__proto__``, ``constructor`` and ``prototype``
are rejected. Plain scalars follow the YAML 1.2 core schema, so ``no`` stays
a string.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from ._spec import SPEC

YAML_ERRORS: Dict[str, str] = SPEC["yaml_errors"]


@dataclass(frozen=True)
class YamlLimits:
    max_depth: int = 64
    max_nodes: int = 200_000
    max_scalar_length: int = 1_048_576


DEFAULT_YAML_LIMITS = YamlLimits()


class YamlError(ValueError):
    """A YAML syntax or limit error with the 1-based line number."""

    def __init__(self, code: str, line: int) -> None:
        super().__init__(f"YAML line {line}: {YAML_ERRORS[code]}")
        self.code = code
        self.line = line


FORBIDDEN_KEYS = {"__proto__", "constructor", "prototype"}
CONTROL = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]")
_BLANK = re.compile(r"^[ \t]*(#.*)?\Z")
_INT = re.compile(r"^[-+]?[0-9]+\Z")
_OCT = re.compile(r"^0o[0-7]+\Z")
_HEX = re.compile(r"^0x[0-9a-fA-F]+\Z")
_FLOAT = re.compile(r"^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?\Z")
_SPECIAL_FLOAT = re.compile(r"^[-+]?\.(inf|Inf|INF)\Z|^\.(nan|NaN|NAN)\Z")
_MAX_SAFE = 2**53 - 1


class _Line:
    __slots__ = ("no", "raw", "indent", "text")

    def __init__(self, no: int, raw: str, indent: int, text: str) -> None:
        self.no = no
        self.raw = raw
        self.indent = indent
        self.text = text


def _make_lines(text: str) -> List[_Line]:
    if text.startswith("\ufeff"):
        text = text[1:]
    text = text.replace("\r\n", "\n")
    out: List[_Line] = []
    for i, raw in enumerate(text.split("\n")):
        if "\r" in raw:
            raise YamlError("bad-newline", i + 1)
        if CONTROL.search(raw):
            raise YamlError("control-character", i + 1)
        indent = 0
        while indent < len(raw) and raw[indent] == " ":
            indent += 1
        out.append(_Line(i + 1, raw, indent, raw[indent:]))
    return out


def _is_blank(text: str) -> bool:
    return _BLANK.match(text) is not None


def _is_seq_entry(text: str) -> bool:
    return text == "-" or text.startswith("- ") or text.startswith("-\t")


def _is_doc_marker(line: _Line) -> bool:
    if line.indent != 0:
        return False
    t = line.text
    return t in ("---", "...") or t.startswith(("--- ", "... ", "---\t", "...\t"))


def _char(s: str, i: int) -> str:
    return s[i] if 0 <= i < len(s) else ""


def resolve_plain(text: str, line: int) -> Any:
    """Resolves a plain scalar with the YAML 1.2 core schema."""
    if text in ("", "~", "null", "Null", "NULL"):
        return None
    if text in ("true", "True", "TRUE"):
        return True
    if text in ("false", "False", "FALSE"):
        return False
    if _INT.match(text) or _OCT.match(text) or _HEX.match(text):
        negative = text.startswith("-")
        digits = text[1:] if text[:1] in ("-", "+") else text
        if digits.startswith("0x"):
            value = int(digits[2:], 16)
        elif digits.startswith("0o"):
            value = int(digits[2:], 8)
        else:
            value = int(digits, 10)
        if negative:
            value = -value
        return value if abs(value) <= _MAX_SAFE else float(value)
    if _FLOAT.match(text):
        n = float(text)
        if n in (float("inf"), float("-inf")) or n != n:
            raise YamlError("non-finite-number", line)
        return n
    if _SPECIAL_FLOAT.match(text):
        raise YamlError("non-finite-number", line)
    return text


def _trim_unescaped(seg: str) -> str:
    end = len(seg)
    while end > 0 and seg[end - 1] in (" ", "\t"):
        end -= 1
    if end == len(seg):
        return seg
    backslashes = 0
    k = end - 1
    while k >= 0 and seg[k] == "\\":
        backslashes += 1
        k -= 1
    return seg[: end + 1] if backslashes % 2 == 1 else seg[:end]


_SIMPLE_ESCAPES = {
    "0": "\u0000",
    "a": "\u0007",
    "b": "\b",
    "t": "\t",
    "\t": "\t",
    "n": "\n",
    "v": "\u000b",
    "f": "\f",
    "r": "\r",
    "e": "\u001b",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    "N": "\u0085",
    "_": "\u00a0",
    "L": "\u2028",
    "P": "\u2029",
}
_HEXDIGITS = re.compile(r"^[0-9a-fA-F]+\Z")


class _Parser:
    def __init__(self, text: str, limits: YamlLimits) -> None:
        self.lines = _make_lines(text)
        self.i = 0
        self.nodes = 0
        self.limits = limits

    # -- helpers -------------------------------------------------------
    def _count(self, line: int, depth: int) -> None:
        self.nodes += 1
        if self.nodes > self.limits.max_nodes:
            raise YamlError("too-many-nodes", line)
        if depth > self.limits.max_depth:
            raise YamlError("too-deep", line)

    def _check_scalar(self, value: str, line: int) -> str:
        if len(value.encode("utf-16-le")) // 2 > self.limits.max_scalar_length:
            raise YamlError("scalar-too-long", line)
        return value

    def _skip_blank(self) -> None:
        while self.i < len(self.lines) and _is_blank(self.lines[self.i].text):
            self.i += 1

    def _current(self) -> Optional[_Line]:
        return self.lines[self.i] if self.i < len(self.lines) else None

    def _line_at(self, i: int) -> Optional[_Line]:
        return self.lines[i] if 0 <= i < len(self.lines) else None

    # -- document ------------------------------------------------------
    def parse_document(self) -> Any:
        self._skip_blank()
        first = self._current()
        if first is not None and first.indent == 0 and first.text.startswith("%"):
            raise YamlError("directive", first.no)
        if first is not None and _is_doc_marker(first) and first.text.startswith("---"):
            if not _is_blank(first.text[3:]):
                raise YamlError("unexpected-content", first.no)
            self.i += 1
            self._skip_blank()
            first = self._current()
        value: Any = None
        if first is not None and not (_is_doc_marker(first) and first.text.startswith("...")):
            value = self._parse_block_node(-1, False, 0)
        self._skip_blank()
        rest = self._current()
        if rest is not None:
            if _is_doc_marker(rest) and rest.text.startswith("...") and _is_blank(rest.text[3:]):
                self.i += 1
                self._skip_blank()
                after = self._current()
                if after is not None:
                    raise YamlError("multiple-documents" if _is_doc_marker(after) else "unexpected-content", after.no)
            elif _is_doc_marker(rest):
                raise YamlError("multiple-documents", rest.no)
            else:
                raise YamlError("bad-indentation" if rest.indent > 0 else "unexpected-content", rest.no)
        return value

    # -- block structure -----------------------------------------------
    def _parse_block_node(self, parent_indent: int, allow_seq_at_parent: bool, depth: int) -> Any:
        self._skip_blank()
        line = self._current()
        if line is None or _is_doc_marker(line):
            return None
        if line.text.startswith("\t"):
            raise YamlError("tab-indentation", line.no)
        seq_here = _is_seq_entry(line.text)
        if line.indent <= parent_indent and not (allow_seq_at_parent and seq_here and line.indent == parent_indent):
            return None
        if seq_here:
            return self._parse_block_seq(line.indent, depth)
        if self._map_entry_head(line) is not None:
            return self._parse_block_map(line.indent, depth)
        return self._parse_inline_value(line, 0, parent_indent, depth)

    def _map_entry_head(self, line: _Line) -> Optional[Tuple[str, int]]:
        text = line.text
        c = _char(text, 0)
        if c in ('"', "'"):
            end = self._scan_quoted_on_line(text, 0)
            if end < 0:
                return None
            j = end
            while _char(text, j) == " ":
                j += 1
            if _char(text, j) != ":" or not (j + 1 == len(text) or _char(text, j + 1) in (" ", "\t")):
                return None
            inner = text[1 : end - 1]
            key = self._unescape_double(inner, line.no) if c == '"' else inner.replace("''", "'")
            key_end = j
        else:
            if c == "" or c in "[]{},#&*!|>%@`" or (c == "?" and (len(text) == 1 or _char(text, 1) == " ")):
                if c == "?":
                    raise YamlError("complex-key", line.no)
                return None
            if c == "-" and _is_seq_entry(text):
                return None
            j = 0
            key_end = -1
            while j < len(text):
                ch = text[j]
                if ch == "#" and j > 0 and text[j - 1] in (" ", "\t"):
                    break
                if ch == ":" and (j + 1 == len(text) or text[j + 1] in (" ", "\t")):
                    key_end = j
                    break
                j += 1
            if key_end < 0:
                return None
            key = text[:key_end].rstrip(" \t")
            if key == "":
                raise YamlError("empty-key", line.no)
        v = key_end + 1
        while _char(text, v) in (" ", "\t"):
            v += 1
        return key, v

    @staticmethod
    def _scan_quoted_on_line(text: str, start: int) -> int:
        q = text[start]
        j = start + 1
        while j < len(text):
            ch = text[j]
            if q == "'" and ch == "'":
                if _char(text, j + 1) == "'":
                    j += 2
                    continue
                return j + 1
            if q == '"' and ch == "\\":
                j += 2
                continue
            if q == '"' and ch == '"':
                return j + 1
            j += 1
        return -1

    def _parse_block_map(self, indent: int, depth: int) -> Dict[str, Any]:
        first = self._current()
        self._count(first.no if first else 0, depth + 1)
        result: Dict[str, Any] = {}
        while True:
            self._skip_blank()
            line = self._current()
            if line is None or _is_doc_marker(line) or line.indent < indent:
                break
            if line.indent > indent:
                raise YamlError("bad-indentation", line.no)
            if line.text.startswith("\t"):
                raise YamlError("tab-indentation", line.no)
            if _is_seq_entry(line.text):
                raise YamlError("bad-indentation", line.no)
            head = self._map_entry_head(line)
            if head is None:
                raise YamlError("expected-key", line.no)
            key, value_col = head
            self._check_key(key, line.no)
            if key in result:
                raise YamlError("duplicate-key", line.no)
            rest = line.text[value_col:]
            if _is_blank(rest):
                self.i += 1
                value = self._parse_block_node(indent, True, depth + 1)
                if value is None:
                    self._count(line.no, depth + 1)
            else:
                value = self._parse_inline_value(line, value_col, indent, depth + 1)
            result[key] = value
        return result

    def _check_key(self, key: str, line_no: int) -> None:
        self._check_scalar(key, line_no)
        if key == "<<":
            raise YamlError("merge-key", line_no)
        if key in FORBIDDEN_KEYS:
            raise YamlError("forbidden-key", line_no)

    def _parse_block_seq(self, indent: int, depth: int) -> List[Any]:
        first = self._current()
        self._count(first.no if first else 0, depth + 1)
        seq: List[Any] = []
        while True:
            self._skip_blank()
            line = self._current()
            if line is None or _is_doc_marker(line) or line.indent < indent:
                break
            if line.indent > indent:
                raise YamlError("bad-indentation", line.no)
            if not _is_seq_entry(line.text):
                break
            if line.text.startswith("-\t"):
                raise YamlError("tab-indentation", line.no)
            k = 1
            while _char(line.text, k) == " ":
                k += 1
            rest = line.text[k:]
            if rest.startswith("\t"):
                raise YamlError("tab-indentation", line.no)
            if _is_blank(rest):
                self.i += 1
                item = self._parse_block_node(indent, False, depth + 1)
                if item is None:
                    self._count(line.no, depth + 1)
            else:
                line.indent = indent + k
                line.text = rest
                item = self._parse_block_node(indent, False, depth + 1)
            seq.append(item)
        return seq

    def _parse_inline_value(self, line: _Line, col: int, parent_indent: int, depth: int) -> Any:
        text = line.text
        c = _char(text, col)
        nxt = _char(text, col + 1)
        if c in ("&", "*", "!"):
            raise YamlError("anchor-alias-tag", line.no)
        if c == "?" and nxt in ("", " "):
            raise YamlError("complex-key", line.no)
        if c != "" and c in "%@`,]}":
            raise YamlError("reserved-indicator", line.no)
        if c in ("|", ">"):
            return self._parse_block_scalar(line, col, parent_indent, depth)
        if c in ('"', "'"):
            self._count(line.no, depth)
            value, end = self._read_quoted(self.i, self._abs_col(line, col), parent_indent)
            self._finish_line(end)
            return self._check_scalar(value, line.no)
        if c in ("[", "{"):
            pos = [self.i, self._abs_col(line, col)]
            value = self._read_flow(pos, parent_indent, depth)
            self._finish_line((pos[0], pos[1]))
            return value
        self._count(line.no, depth)
        return self._read_plain_block(line, col, parent_indent)

    @staticmethod
    def _abs_col(line: _Line, col: int) -> int:
        return len(line.raw) - len(line.text) + col

    def _finish_line(self, end: Tuple[int, int]) -> None:
        line = self._line_at(end[0])
        if line is None:
            return
        rest = line.raw[end[1] :]
        if not re.match(r"^([ \t]+(#.*)?)?\Z", rest):
            raise YamlError("unexpected-content", line.no)
        self.i = end[0] + 1

    def _read_plain_block(self, line: _Line, col: int, parent_indent: int) -> Any:
        first_no = line.no
        value, comment = self._plain_line_part(line.text[col:], line.no)
        parts = [value]
        ended = comment
        self.i += 1
        pending_empty = 0
        multi = False
        while not ended and self.i < len(self.lines):
            nl = self.lines[self.i]
            if re.match(r"^[ \t]*\Z", nl.text):
                pending_empty += 1
                self.i += 1
                continue
            if _is_doc_marker(nl) or nl.indent <= parent_indent or nl.text.startswith("#"):
                break
            part, comment = self._plain_line_part(nl.text, nl.no)
            parts.append("\n" * pending_empty if pending_empty > 0 else " ")
            parts.append(part)
            multi = True
            pending_empty = 0
            ended = comment
            self.i += 1
        joined = self._check_scalar("".join(parts), first_no)
        return joined if multi else resolve_plain(joined, first_no)

    @staticmethod
    def _plain_line_part(text: str, line_no: int) -> Tuple[str, bool]:
        j = 0
        comment = False
        while j < len(text):
            ch = text[j]
            if ch == "#" and (j == 0 or text[j - 1] in (" ", "\t")):
                comment = True
                break
            if ch == ":" and (j + 1 == len(text) or text[j + 1] in (" ", "\t")):
                raise YamlError("mapping-in-scalar", line_no)
            j += 1
        return text[:j].strip(" \t"), comment

    def _read_quoted(self, line_index: int, col: int, parent_indent: int) -> Tuple[str, Tuple[int, int]]:
        start_line = self._line_at(line_index)
        if start_line is None:
            raise YamlError("unterminated-string", 0)
        q = start_line.raw[col]
        li = line_index
        j = col + 1
        out = ""
        seg = ""
        while True:
            line = self._line_at(li)
            if line is None:
                raise YamlError("unterminated-string", start_line.no)
            raw = line.raw
            if j >= len(raw):
                escaped_break = False
                if q == '"' and seg.endswith("\\") and not self._ends_with_escaped_backslash(seg):
                    seg = seg[:-1]
                    escaped_break = True
                if q == '"':
                    out += self._unescape_double(seg if escaped_break else _trim_unescaped(seg), line.no)
                else:
                    out += seg.rstrip(" \t")
                seg = ""
                empties = 0
                li += 1
                while True:
                    nl = self._line_at(li)
                    if nl is None:
                        raise YamlError("unterminated-string", start_line.no)
                    if re.match(r"^[ \t]*\Z", nl.raw):
                        empties += 1
                        li += 1
                        continue
                    if _is_doc_marker(nl) or nl.indent <= parent_indent:
                        raise YamlError("unterminated-string", start_line.no)
                    break
                if not escaped_break:
                    out += "\n" * empties if empties > 0 else " "
                else:
                    out += "\n" * empties
                nl = self._line_at(li)
                j = 0 if nl is None else len(nl.raw) - len(nl.raw.lstrip(" \t"))
                continue
            ch = raw[j]
            if q == "'":
                if ch == "'":
                    if _char(raw, j + 1) == "'":
                        seg += "'"
                        j += 2
                        continue
                    out += seg
                    return out, (li, j + 1)
                seg += ch
                j += 1
            else:
                if ch == "\\":
                    if j + 1 >= len(raw):
                        seg += "\\"
                        j += 1
                        continue
                    seg += ch + raw[j + 1]
                    j += 2
                    continue
                if ch == '"':
                    out += self._unescape_double(seg, line.no)
                    return out, (li, j + 1)
                seg += ch
                j += 1

    @staticmethod
    def _ends_with_escaped_backslash(seg: str) -> bool:
        n = 0
        k = len(seg) - 1
        while k >= 0 and seg[k] == "\\":
            n += 1
            k -= 1
        return n % 2 == 0

    @staticmethod
    def _unescape_double(s: str, line_no: int) -> str:
        out = []
        j = 0
        while j < len(s):
            ch = s[j]
            if ch != "\\":
                out.append(ch)
                j += 1
                continue
            j += 1
            e = _char(s, j)
            if e in _SIMPLE_ESCAPES:
                out.append(_SIMPLE_ESCAPES[e])
                j += 1
                continue
            length = 2 if e == "x" else 4 if e == "u" else 8 if e == "U" else 0
            if length == 0:
                raise YamlError("bad-escape", line_no)
            hx = s[j + 1 : j + 1 + length]
            if len(hx) != length or not _HEXDIGITS.match(hx):
                raise YamlError("bad-escape", line_no)
            cp = int(hx, 16)
            if cp > 0x10FFFF or 0xD800 <= cp <= 0xDFFF:
                raise YamlError("bad-escape", line_no)
            out.append(chr(cp))
            j += 1 + length
        return "".join(out)

    def _parse_block_scalar(self, line: _Line, col: int, parent_indent: int, depth: int) -> str:
        self._count(line.no, depth)
        header = line.text[col:]
        m = re.match(r"^([|>])([+-]?)([1-9]?)([+-]?)([ \t]+#.*|[ \t]*)\Z", header)
        if m is None or (m.group(2) != "" and m.group(4) != ""):
            raise YamlError("bad-block-scalar", line.no)
        folded = m.group(1) == ">"
        chomp = m.group(2) or m.group(4)
        indicator = m.group(3)
        base = 0 if parent_indent < 0 else parent_indent
        self.i += 1
        content_indent = -1 if indicator == "" else base + int(indicator)
        contents: List[str] = []
        while self.i < len(self.lines):
            nl = self.lines[self.i]
            if re.match(r"^[ ]*\Z", nl.raw):
                contents.append(nl.raw[content_indent:] if content_indent >= 0 and len(nl.raw) > content_indent else "")
                self.i += 1
                continue
            if content_indent < 0:
                if nl.indent <= parent_indent:
                    break
                content_indent = nl.indent
            if nl.indent < content_indent or _is_doc_marker(nl):
                break
            contents.append(nl.raw[content_indent:])
            self.i += 1
        trailing = 0
        while contents and contents[-1] == "":
            contents.pop()
            trailing += 1
        out = ""
        prev = "none"
        pending = 0
        for c in contents:
            if c == "":
                pending += 1
                continue
            more = c.startswith(" ") or c.startswith("\t")
            if prev == "none":
                out += "\n" * pending
            elif folded and prev == "normal" and not more:
                out += " " if pending == 0 else "\n" * pending
            else:
                out += "\n" * (pending + 1)
            out += c
            prev = "more" if more else "normal"
            pending = 0
        if prev == "none":
            out = "\n" * trailing if chomp == "+" else ""
        elif chomp == "+":
            out += "\n" * (trailing + 1)
        elif chomp == "":
            out += "\n"
        return self._check_scalar(out, line.no)

    # -- flow collections ------------------------------------------------
    def _read_flow(self, pos: List[int], parent_indent: int, depth: int) -> Any:
        start = self._line_at(pos[0])
        start_no = start.no if start else 0

        def peek() -> str:
            ln = self._line_at(pos[0])
            if ln is None:
                raise YamlError("unterminated-flow", start_no)
            return ln.raw[pos[1]] if pos[1] < len(ln.raw) else "\n"

        def skip_ws() -> None:
            while True:
                ln = self._line_at(pos[0])
                if ln is None:
                    raise YamlError("unterminated-flow", start_no)
                ch = peek()
                if ch in (" ", "\t"):
                    pos[1] += 1
                elif ch == "#" and (pos[1] == 0 or ln.raw[pos[1] - 1] in (" ", "\t")):
                    pos[1] = len(ln.raw)
                elif ch == "\n":
                    pos[0] += 1
                    pos[1] = 0
                    nl = self._line_at(pos[0])
                    if nl is None:
                        raise YamlError("unterminated-flow", start_no)
                    if not re.match(r"^[ \t]*\Z", nl.raw) and not re.match(r"^[ \t]*#", nl.raw) and (_is_doc_marker(nl) or nl.indent <= parent_indent):
                        raise YamlError("unterminated-flow", start_no)
                else:
                    return

        def line_no() -> int:
            ln = self._line_at(pos[0])
            return ln.no if ln else start_no

        def read_scalar(is_key: bool) -> Any:
            ch = peek()
            if ch in ('"', "'"):
                value, end = self._read_quoted(pos[0], pos[1], parent_indent)
                pos[0], pos[1] = end
                return self._check_scalar(value, line_no())
            if ch in ("&", "*", "!"):
                raise YamlError("anchor-alias-tag", line_no())
            if ch in "%@`|>":
                raise YamlError("reserved-indicator", line_no())
            if ch == "?":
                raise YamlError("complex-key", line_no())
            parts: List[str] = []
            no = line_no()
            cur = ""
            while True:
                c = peek()
                if c == "\n":
                    parts.append(cur.strip(" \t"))
                    cur = ""
                    skip_ws()
                    continue
                if c in ",[]{}":
                    break
                if c == "#":
                    ln = self._line_at(pos[0])
                    if ln is not None and pos[1] > 0 and ln.raw[pos[1] - 1] in (" ", "\t"):
                        parts.append(cur.strip(" \t"))
                        cur = ""
                        skip_ws()
                        continue
                if c == ":":
                    ln = self._line_at(pos[0])
                    after = "" if ln is None else (ln.raw[pos[1] + 1] if pos[1] + 1 < len(ln.raw) else "\n")
                    if after in (" ", "\t", "\n", ",", "]", "}", "[", "{"):
                        if is_key:
                            break
                        raise YamlError("bad-flow", line_no())
                cur += c
                pos[1] += 1
            parts.append(cur.strip(" \t"))
            text = self._check_scalar(" ".join(p for p in parts if p != ""), no)
            if text == "":
                raise YamlError("empty-flow-entry", no)
            return text if is_key else resolve_plain(text, no)

        def read_value(d: int) -> Any:
            ch = peek()
            if ch in ("[", "{"):
                return read_collection(d)
            self._count(line_no(), d)
            return read_scalar(False)

        def read_collection(d: int) -> Any:
            self._count(line_no(), d)
            opening = peek()
            close = "]" if opening == "[" else "}"
            pos[1] += 1
            seq: List[Any] = []
            mapping: Dict[str, Any] = {}
            while True:
                skip_ws()
                if peek() == close:
                    pos[1] += 1
                    return seq if opening == "[" else mapping
                if peek() == ",":
                    raise YamlError("empty-flow-entry", line_no())
                if opening == "[":
                    v = read_value(d + 1)
                    skip_ws()
                    if peek() == ":":
                        raise YamlError("bad-flow", line_no())
                    seq.append(v)
                else:
                    key_no = line_no()
                    kc = peek()
                    if kc in ("[", "{"):
                        raise YamlError("complex-key", key_no)
                    key_val = read_scalar(True)
                    if not isinstance(key_val, str):
                        raise YamlError("empty-key", key_no)
                    key = key_val
                    self._check_key(key, key_no)
                    if key in mapping:
                        raise YamlError("duplicate-key", key_no)
                    skip_ws()
                    v = None
                    if peek() == ":":
                        pos[1] += 1
                        skip_ws()
                        nc = peek()
                        if nc in (",", close):
                            self._count(line_no(), d + 1)
                            v = None
                        else:
                            v = read_value(d + 1)
                    else:
                        self._count(line_no(), d + 1)
                    mapping[key] = v
                skip_ws()
                sep = peek()
                if sep == ",":
                    pos[1] += 1
                    continue
                if sep != close:
                    raise YamlError("bad-flow", line_no())

        return read_collection(depth)


def parse_yaml(text: str, limits: YamlLimits = DEFAULT_YAML_LIMITS) -> Any:
    """Parses one YAML document of the safe subset into plain data.

    >>> parse_yaml('language:\\n- en\\n- "no"\\n')
    {'language': ['en', 'no']}
    """
    return _Parser(text, limits).parse_document()


@dataclass(frozen=True)
class FrontMatter:
    yaml: Optional[str]
    first_line: int
    body: str


def split_front_matter(markdown: str) -> FrontMatter:
    """Splits a Markdown file into YAML front matter and body."""
    text = (markdown[1:] if markdown.startswith("\ufeff") else markdown).replace("\r\n", "\n")
    lines = text.split("\n")
    if (lines[0] if lines else "").rstrip(" \t") != "---":
        return FrontMatter(None, 1, text)
    for i in range(1, len(lines)):
        stripped = lines[i].rstrip(" \t")
        if stripped in ("---", "..."):
            return FrontMatter("\n".join(lines[1:i]), 2, "\n".join(lines[i + 1 :]))
    raise YamlError("unterminated-front-matter", 1)
