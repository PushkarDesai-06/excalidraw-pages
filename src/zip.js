// Excalidraw Pages: minimal zip reader/writer for exporting and importing.
//
// Writes deflated entries with UTF-8 names and reads stored or deflated
// entries, which covers our own exports and archives re-zipped by common
// tools. Compression is done by the browser's built-in CompressionStream, so
// no library is needed. No zip64: archives must stay under 4 GB.

(() => {
  "use strict";

  if (window.__excalidrawPagesZip) return;

  const LOCAL_HEADER = 0x04034b50;
  const CENTRAL_HEADER = 0x02014b50;
  const END_OF_CENTRAL_DIR = 0x06054b50;
  const UTF8_FLAG = 0x0800;
  const STORED = 0;
  const DEFLATED = 8;

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function transform(bytes, stream) {
    const piped = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(piped).arrayBuffer());
  }

  function dosDateTime(date) {
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  // entries: [{ name: string, data: string | Uint8Array }]
  async function createZip(entries) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
      const compressed = await transform(data, new CompressionStream("deflate-raw"));
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, LOCAL_HEADER, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, UTF8_FLAG, true);
      local.setUint16(8, DEFLATED, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, compressed.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      parts.push(local, name, compressed);

      const header = new DataView(new ArrayBuffer(46));
      header.setUint32(0, CENTRAL_HEADER, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 20, true);
      header.setUint16(8, UTF8_FLAG, true);
      header.setUint16(10, DEFLATED, true);
      header.setUint16(12, time, true);
      header.setUint16(14, date, true);
      header.setUint32(16, crc, true);
      header.setUint32(20, compressed.length, true);
      header.setUint32(24, data.length, true);
      header.setUint16(28, name.length, true);
      header.setUint32(42, offset, true);
      central.push(header, name);

      offset += 30 + name.length + compressed.length;
    }

    const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, END_OF_CENTRAL_DIR, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  // Returns [{ name, data: Uint8Array }] for every file entry.
  async function readZip(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    // The end record sits in the last 22 bytes plus an optional comment.
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === END_OF_CENTRAL_DIR) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error("Not a zip file");

    const count = view.getUint16(end + 10, true);
    const decoder = new TextDecoder();
    const files = [];
    let p = view.getUint32(end + 16, true);

    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== CENTRAL_HEADER) throw new Error("Corrupt zip file");
      const method = view.getUint16(p + 10, true);
      const compressedSize = view.getUint32(p + 20, true);
      const nameLength = view.getUint16(p + 28, true);
      const extraLength = view.getUint16(p + 30, true);
      const commentLength = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      p += 46 + nameLength + extraLength + commentLength;

      if (name.endsWith("/")) continue;
      const start =
        localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const raw = bytes.subarray(start, start + compressedSize);
      let data;
      if (method === STORED) data = raw;
      else if (method === DEFLATED) data = await transform(raw, new DecompressionStream("deflate-raw"));
      else throw new Error(`Unsupported compression in "${name}"`);
      files.push({ name, data });
    }
    return files;
  }

  Object.defineProperty(window, "__excalidrawPagesZip", {
    value: Object.freeze({ createZip, readZip }),
  });
})();
