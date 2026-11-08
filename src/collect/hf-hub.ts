// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The only network code in Sourcebook: reading public dataset metadata from
 * the Hugging Face Hub, and only when the user asks for it (`--online`).
 *
 * - One allow-listed host: https://huggingface.co (no other host, port,
 *   scheme or user information is ever contacted, also not after a redirect).
 * - Redirects are followed by hand, at most 3, each checked against the
 *   allow-list.
 * - Every request has a timeout and a response size cap that is enforced
 *   while the body streams in.
 * - No cookies, no credentials, no tokens: only public metadata is read.
 * - Dataset ids and revisions are validated before they are put into a URL.
 *
 * Endpoints (documented at https://huggingface.co/docs/hub/api):
 * `GET /api/datasets/{id}` (and `/api/datasets/{id}/revision/{rev}`), and
 * the raw README at `/datasets/{id}/raw/{rev}/README.md`.
 */

import { isRepoId } from './hf-card.js';
import { VERSION } from '../version.js';

export const HUB_ORIGIN = 'https://huggingface.co';
const HUB_HOST = 'huggingface.co';

export interface HubOptions {
  /** Branch, tag or commit; "main" by default. */
  readonly revision?: string;
  /** Per-request timeout in milliseconds (default 15 000, at most 120 000). */
  readonly timeoutMs?: number;
  /** Maximum response size in bytes (default 8 MiB, at most 64 MiB). */
  readonly maxBytes?: number;
  /** Fetch implementation (for tests); the global fetch by default. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

export class HubError extends Error {
  readonly code: 'bad-id' | 'bad-revision' | 'bad-redirect' | 'too-many-redirects' | 'too-large' | 'http' | 'not-found' | 'bad-json' | 'network';
  constructor(code: HubError['code'], message: string) {
    super(message);
    this.name = 'HubError';
    this.code = code;
  }
}

const REVISION_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

/** True for a branch, tag or commit name that is safe to put into a Hub URL. */
export function isRevision(rev: string): boolean {
  return REVISION_RE.test(rev) && !rev.includes('..') && !rev.includes('//') && !rev.endsWith('/');
}

/** Checks that a URL is on the allow-listed host, over https, without credentials or a port. */
export function isAllowedUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.hostname === HUB_HOST && u.port === '' && u.username === '' && u.password === '';
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = res.headers.get('content-length');
  if (declared !== null && /^[0-9]+$/.test(declared) && Number(declared) > maxBytes) throw new HubError('too-large', `The response is larger than ${maxBytes} bytes.`);
  const body = res.body;
  if (body === null) return new Uint8Array(0);
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HubError('too-large', `The response is larger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** GET on the Hub with the allow-list, manual redirects, timeout and size cap. Returns null on 401/403/404. */
async function hubGet(url: string, options: HubOptions, accept: string): Promise<Uint8Array | null> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 15_000, 1), 120_000);
  const maxBytes = Math.min(Math.max(options.maxBytes ?? 8 * 1024 * 1024, 1024), 64 * 1024 * 1024);
  const doFetch = options.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!isAllowedUrl(current)) throw new HubError('bad-redirect', 'Refusing to contact a host other than https://huggingface.co.');
    let res: Response;
    try {
      res = await doFetch(current, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { accept, 'user-agent': `sourcebook/${VERSION}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const reason = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timed out' : 'failed';
      throw new HubError('network', `The request to the Hugging Face Hub ${reason}.`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (location === null) throw new HubError('bad-redirect', 'A redirect without a location.');
      if (hop >= 3) throw new HubError('too-many-redirects', 'Too many redirects.');
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new HubError('bad-redirect', 'A redirect to an invalid location.');
      }
      // The allow-list check at the top of the loop applies to every redirect target.
      current = next;
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new HubError('http', `The Hugging Face Hub answered with status ${res.status}.`);
    }
    return readCapped(res, maxBytes);
  }
}

export interface HubDataset {
  /** Parsed JSON of the dataset API (cardData, tags, gated, private, sha, ...). */
  api: unknown;
  /** README.md text, or null when it is not readable without access (gated datasets). */
  readme: string | null;
  /** URL of the API request, for the inventory. */
  reference: string;
}

/**
 * Reads the public metadata of a dataset from the Hub.
 *
 * @throws HubError for invalid ids, unknown datasets, network errors and limits.
 */
export async function fetchHubDataset(id: string, options: HubOptions = {}): Promise<HubDataset> {
  if (!isRepoId(id)) throw new HubError('bad-id', 'Not a valid Hugging Face dataset id (expected "owner/name").');
  const revision = options.revision ?? 'main';
  if (!isRevision(revision)) throw new HubError('bad-revision', 'Not a valid revision (branch, tag or commit).');
  const encodedId = id.split('/').map(encodeURIComponent).join('/');
  const encodedRev = encodeURIComponent(revision);
  const expand = ['cardData', 'tags', 'gated', 'private', 'disabled', 'sha', 'lastModified'].map((x) => `expand[]=${x}`).join('&');
  const apiUrl = `${HUB_ORIGIN}/api/datasets/${encodedId}${revision === 'main' ? '' : `/revision/${encodedRev}`}?${expand}`;
  const apiBytes = await hubGet(apiUrl, options, 'application/json');
  if (apiBytes === null) throw new HubError('not-found', `The dataset ${id} was not found, or it is private or needs access. Use a local copy of its card instead.`);
  let api: unknown;
  try {
    api = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(apiBytes));
  } catch {
    throw new HubError('bad-json', 'The Hub API returned invalid JSON.');
  }
  const readmeBytes = await hubGet(`${HUB_ORIGIN}/datasets/${encodedId}/raw/${encodedRev}/README.md`, options, 'text/plain');
  let readme: string | null = null;
  if (readmeBytes !== null) {
    try {
      readme = new TextDecoder('utf-8', { fatal: true }).decode(readmeBytes);
    } catch {
      readme = null;
    }
  }
  return { api, readme, reference: apiUrl };
}
