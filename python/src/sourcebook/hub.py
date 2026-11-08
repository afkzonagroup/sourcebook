# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""The only network code of the Python package: public dataset metadata from
the Hugging Face Hub, used only when asked (port of src/collect/hf-hub.ts).

One allow-listed host (https://huggingface.co, default port, no user
information), redirects followed by hand (at most 3, each checked), a timeout
and a response size cap, no proxies from the environment, no cookies and no
credentials. Ids and revisions are validated before they go into a URL.
"""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Optional, Tuple

from . import __version__
from .hf_card import is_repo_id

HUB_ORIGIN = "https://huggingface.co"
_HUB_HOST = "huggingface.co"
_REVISION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}\Z")


class HubError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def is_revision(rev: str) -> bool:
    return _REVISION_RE.match(rev) is not None and ".." not in rev and "//" not in rev and not rev.endswith("/")


def is_allowed_url(url: str) -> bool:
    try:
        u = urllib.parse.urlsplit(url)
        port = u.port
    except ValueError:
        return False
    return u.scheme == "https" and u.hostname == _HUB_HOST and u.netloc == _HUB_HOST and port is None and u.username is None and u.password is None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        """Never follows a redirect; the caller checks and follows it."""
        return None


# (status, headers, read(n) -> bytes)
Response = Tuple[int, Dict[str, str], Callable[[int], bytes]]
Opener = Callable[[str, float], Response]


def _default_open(url: str, timeout: float) -> Response:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json, text/plain", "User-Agent": f"sourcebook/{__version__}"})
    try:
        resp = opener.open(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read
    return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read


def _get(url: str, timeout: float, max_bytes: int, open_fn: Opener) -> Optional[bytes]:
    current = url
    hop = 0
    while True:
        if not is_allowed_url(current):
            raise HubError("bad-redirect", "Refusing to contact a host other than https://huggingface.co.")
        # urllib's timeout applies to each socket operation; the deadline bounds the whole request,
        # as AbortSignal.timeout does in the TypeScript client (a slow trickle cannot hold it open).
        deadline = time.monotonic() + timeout
        try:
            status, headers, read = open_fn(current, timeout)
        except HubError:
            raise
        except TimeoutError:
            raise HubError("network", "The request to the Hugging Face Hub timed out.") from None
        except (OSError, ValueError):
            raise HubError("network", "The request to the Hugging Face Hub failed.") from None
        if 300 <= status < 400:
            location = headers.get("location")
            if location is None:
                raise HubError("bad-redirect", "A redirect without a location.")
            if hop >= 3:
                raise HubError("too-many-redirects", "Too many redirects.")
            nxt = urllib.parse.urljoin(current, location)
            # The allow-list check at the top of the loop applies to every redirect target.
            current = nxt
            hop += 1
            continue
        if status in (401, 403, 404):
            return None
        if status != 200:
            raise HubError("http", f"The Hugging Face Hub answered with status {status}.")
        declared = headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > max_bytes:
            raise HubError("too-large", f"The response is larger than {max_bytes} bytes.")
        chunks = []
        total = 0
        while True:
            if time.monotonic() > deadline:
                raise HubError("network", "The request to the Hugging Face Hub timed out.")
            try:
                chunk = read(65536)
            except TimeoutError:
                raise HubError("network", "The request to the Hugging Face Hub timed out.") from None
            except OSError:
                raise HubError("network", "The request to the Hugging Face Hub failed.") from None
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HubError("too-large", f"The response is larger than {max_bytes} bytes.")
            chunks.append(chunk)
        return b"".join(chunks)


def fetch_hub_dataset(repo_id: str, revision: str = "main", timeout: float = 15.0, max_bytes: int = 8 * 1024 * 1024, open_fn: Optional[Opener] = None) -> Dict[str, Any]:
    """Reads the public metadata of a dataset: {api, readme, reference}."""
    if not is_repo_id(repo_id):
        raise HubError("bad-id", 'Not a valid Hugging Face dataset id (expected "owner/name").')
    if not is_revision(revision):
        raise HubError("bad-revision", "Not a valid revision (branch, tag or commit).")
    timeout = min(max(timeout, 0.001), 120.0)
    max_bytes = min(max(max_bytes, 1024), 64 * 1024 * 1024)
    fn = open_fn or _default_open
    encoded_id = "/".join(urllib.parse.quote(p, safe="") for p in repo_id.split("/"))
    encoded_rev = urllib.parse.quote(revision, safe="")
    expand = "&".join(f"expand[]={x}" for x in ["cardData", "tags", "gated", "private", "disabled", "sha", "lastModified"])
    api_url = f"{HUB_ORIGIN}/api/datasets/{encoded_id}{'' if revision == 'main' else '/revision/' + encoded_rev}?{expand}"
    api_bytes = _get(api_url, timeout, max_bytes, fn)
    if api_bytes is None:
        raise HubError("not-found", f"The dataset {repo_id} was not found, or it is private or needs access. Use a local copy of its card instead.")
    try:
        api = json.loads(api_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise HubError("bad-json", "The Hub API returned invalid JSON.") from None
    readme_bytes = _get(f"{HUB_ORIGIN}/datasets/{encoded_id}/raw/{encoded_rev}/README.md", timeout, max_bytes, fn)
    readme = None
    if readme_bytes is not None:
        try:
            readme = readme_bytes.decode("utf-8")
        except UnicodeDecodeError:
            readme = None
    return {"api": api, "readme": readme, "reference": api_url}
