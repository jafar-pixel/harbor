/**
 * Title, artist and cover art from a music file's own tags: ID3v2 (MP3, and AIFF/WAV with an ID3
 * chunk is not read) and FLAC Vorbis comments and pictures. Reads only the start of the file.
 */

export type FileTags = { title?: string; artist?: string; cover?: Blob };

const HEAD_BYTES = 4 * 1024 * 1024;

export async function readTags(file: Blob): Promise<FileTags> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  if (ascii(head, 0, 3) === "ID3") return id3(head);
  if (ascii(head, 0, 4) === "fLaC") return flac(head);
  return {};
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = "";
  for (let i = at; i < at + n && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

const syncsafe = (b: Uint8Array, at: number) =>
  ((b[at] & 0x7f) << 21) |
  ((b[at + 1] & 0x7f) << 14) |
  ((b[at + 2] & 0x7f) << 7) |
  (b[at + 3] & 0x7f);
const be32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

function decodeText(enc: number, bytes: Uint8Array): string {
  const label = enc === 1 ? "utf-16" : enc === 2 ? "utf-16be" : enc === 3 ? "utf-8" : "latin1";
  return new TextDecoder(label).decode(bytes).replace(/\0+$/, "").split("\0")[0].trim();
}

/** End of a NUL-terminated string in `enc` (two NULs for UTF-16). */
function textEnd(b: Uint8Array, from: number, enc: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i;
}

function id3(b: Uint8Array): FileTags {
  const version = b[3];
  const size = syncsafe(b, 6) + 10;
  const out: FileTags = {};
  let at = 10;
  if (b[5] & 0x40) at += version === 4 ? syncsafe(b, 10) : be32(b, 10) + 4;
  while (at + 10 < Math.min(size, b.length)) {
    const id = ascii(b, at, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len = version === 4 ? syncsafe(b, at + 4) : be32(b, at + 4);
    const body = b.subarray(at + 10, at + 10 + len);
    if (id === "TIT2" && body.length) out.title = decodeText(body[0], body.subarray(1));
    else if (id === "TPE1" && body.length) out.artist = decodeText(body[0], body.subarray(1));
    else if (id === "APIC" && body.length && !out.cover) {
      const enc = body[0];
      const mimeEnd = body.indexOf(0, 1);
      const mime = ascii(body, 1, mimeEnd - 1) || "image/jpeg";
      const descEnd = textEnd(body, mimeEnd + 2, enc);
      const start = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
      if (start < body.length)
        out.cover = new Blob([body.slice(start)], {
          type: mime.includes("/") ? mime : `image/${mime}`,
        });
    }
    at += 10 + len;
  }
  return out;
}

function flac(b: Uint8Array): FileTags {
  const out: FileTags = {};
  let at = 4;
  for (let guard = 0; guard < 64 && at + 4 <= b.length; guard++) {
    const last = (b[at] & 0x80) !== 0;
    const type = b[at] & 0x7f;
    const len = (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3];
    const body = b.subarray(at + 4, at + 4 + len);
    const le32 = (i: number) =>
      (body[i] | (body[i + 1] << 8) | (body[i + 2] << 16) | (body[i + 3] << 24)) >>> 0;
    if (type === 4) {
      // Vorbis comments: vendor string, then count and KEY=value pairs, little-endian lengths.
      let p = 4 + le32(0);
      const count = le32(p);
      p += 4;
      const utf8 = new TextDecoder("utf-8");
      for (let i = 0; i < count && p + 4 <= body.length; i++) {
        const n = le32(p);
        const entry = utf8.decode(body.subarray(p + 4, p + 4 + n));
        p += 4 + n;
        const eq = entry.indexOf("=");
        const key = entry.slice(0, eq).toUpperCase();
        if (key === "TITLE") out.title = entry.slice(eq + 1).trim();
        if (key === "ARTIST" && !out.artist) out.artist = entry.slice(eq + 1).trim();
      }
    } else if (type === 6 && !out.cover && body.length > 32) {
      let p = 4;
      const mimeLen = be32(body, p);
      const mime = ascii(body, p + 4, mimeLen);
      p += 4 + mimeLen;
      p += 4 + be32(body, p); // description
      p += 16; // width, height, depth, colours
      const dataLen = be32(body, p);
      out.cover = new Blob([body.slice(p + 4, p + 4 + dataLen)], { type: mime || "image/jpeg" });
    }
    if (last) break;
    at += 4 + len;
  }
  return out;
}
