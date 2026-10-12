import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// 既存のRGBAドット素材を読み、Canvasなしで書き出しに利用する。
export function readPng(path) {
  const bytes = readFileSync(path), data = [];
  let width, height, channels;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error('8-bit RGB/RGBA non-interlaced PNG required');
    }
    if (type === 'IDAT') data.push(body);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(data)), stride = width * channels, decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? decoded[y * stride + x - channels] : 0;
      const up = y ? decoded[(y - 1) * stride + x] : 0;
      const corner = y && x >= channels ? decoded[(y - 1) * stride + x - channels] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      decoded[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba.set(decoded.subarray(i * channels, i * channels + 3), i * 4);
    rgba[i * 4 + 3] = channels === 4 ? decoded[i * channels + 3] : 255;
  }
  return { width, height, rgba };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const data = Buffer.concat([Buffer.from(type), body]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length); tail.writeUInt32BE(crc32(data));
  return Buffer.concat([head, data, tail]);
}
export function png(path, width, height, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
