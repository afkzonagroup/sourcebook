// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * File access for the command line tool. All side effects live here:
 * size-capped reads, streaming reads (with gunzip for ".gz"), and writes
 * that never overwrite or follow a symbolic link unless asked to.
 */

import { constants, createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

/** Reads a UTF-8 text file of at most `maxBytes` bytes. */
export async function readTextFile(path: string, maxBytes: number): Promise<string> {
  let fh;
  try {
    fh = await open(path, constants.O_RDONLY);
  } catch {
    throw new InputError(`Cannot open ${path}.`);
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new InputError(`${path} is not a regular file.`);
    if (st.size > maxBytes) throw new InputError(`${path} is larger than ${maxBytes} bytes.`);
    const buf = Buffer.alloc(st.size);
    let read = 0;
    while (read < st.size) {
      const { bytesRead } = await fh.read(buf, read, st.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, read));
    } catch {
      throw new InputError(`${path} is not valid UTF-8 text.`);
    }
  } finally {
    await fh.close();
  }
}

/** Streams a file's bytes, decompressing gzip when the name ends in ".gz". */
export async function* readByteStream(path: string): AsyncGenerator<Uint8Array> {
  let fh;
  try {
    fh = await open(path, constants.O_RDONLY);
    const st = await fh.stat();
    if (!st.isFile()) throw new InputError(`${path} is not a regular file.`);
  } catch (e) {
    await fh?.close();
    if (e instanceof InputError) throw e;
    throw new InputError(`Cannot open ${path}.`);
  }
  const raw = createReadStream('', { fd: fh, highWaterMark: 1 << 20 });
  const stream = path.toLowerCase().endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length);
  } catch (e) {
    if (e instanceof Error && 'code' in e && typeof e.code === 'string' && e.code.startsWith('Z_')) throw new InputError(`${path} is not valid gzip data.`);
    throw e;
  } finally {
    raw.destroy();
  }
}

/** Reads up to `length` bytes starting `fromEnd` bytes before the end of the file, plus the file size. */
export async function readRange(path: string, fromEnd: number, length: number): Promise<{ bytes: Uint8Array; size: number }> {
  let fh;
  try {
    fh = await open(path, constants.O_RDONLY);
  } catch {
    throw new InputError(`Cannot open ${path}.`);
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new InputError(`${path} is not a regular file.`);
    const offset = Math.max(0, st.size - fromEnd);
    const len = Math.min(length, st.size - offset);
    const buf = Buffer.alloc(len);
    let read = 0;
    while (read < len) {
      const { bytesRead } = await fh.read(buf, read, len - read, offset + read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return { bytes: new Uint8Array(buf.buffer, buf.byteOffset, read), size: st.size };
  } finally {
    await fh.close();
  }
}

/**
 * Writes a text file with mode 0644. Without `force`, an existing file is
 * never overwritten (O_EXCL). A symbolic link at the path is never followed
 * (O_NOFOLLOW).
 */
export async function writeTextFile(path: string, text: string, force: boolean): Promise<void> {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (force ? constants.O_TRUNC : constants.O_EXCL);
  let fh;
  try {
    fh = await open(path, flags, 0o644);
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? String(e.code) : '';
    if (code === 'EEXIST') throw new InputError(`${path} exists. Use --force to overwrite it.`);
    if (code === 'ELOOP') throw new InputError(`${path} is a symbolic link; refusing to write through it.`);
    throw new InputError(`Cannot write ${path}.`);
  }
  try {
    await fh.writeFile(text, 'utf8');
  } finally {
    await fh.close();
  }
}
