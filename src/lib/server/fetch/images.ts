import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { IMAGE_MAX_BYTES, type SafeFetch } from './safe.ts';

/**
 * The local image cache. A link's preview image and site icon are fetched through the guarded fetch (at most 5 MB),
 * decoded with sharp and stored only as WebP, named by a SHA-256: `data/media/<sha256>.webp` (the preview at 640 px
 * wide, with a 320 px copy beside it as `<sha256>-320.webp`; the icon at 64 x 64). Nothing a site sent is ever
 * served as it came: SVG is rasterised, ICO is unpacked, everything is re-encoded.
 */

export type ImageKind = 'preview' | 'favicon';

/** A file name the media route serves; anything else is refused. */
export const MEDIA_NAME = /^[0-9a-f]{64}(-320)?\.webp$/;

// Decompression bombs: refuse images over 40 megapixels before decoding them.
const LIMIT_INPUT_PIXELS = 40_000_000;
const ACCEPT_IMAGES =
	'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8';

function isImageType(contentType: string | null): boolean {
	return /^\s*image\//i.test(contentType ?? '');
}

function isIco(bytes: Buffer): boolean {
	return bytes.length > 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;
}

function isSvg(bytes: Buffer, contentType: string | null): boolean {
	if (/svg/i.test(contentType ?? '')) return true;
	const start = bytes.subarray(0, 512).toString('utf-8').trimStart().toLowerCase();
	return start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'));
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** The largest image in an ICO file, as something sharp can read: a PNG entry as it is, a 32/24-bit BMP as raw RGBA. */
export function unpackIco(bytes: Buffer): Sharp | null {
	const count = bytes.readUInt16LE(4);
	let best: { size: number; offset: number; length: number } | null = null;
	for (let i = 0; i < Math.min(count, 64); i++) {
		const at = 6 + i * 16;
		if (at + 16 > bytes.length) break;
		const size = bytes[at] || 256;
		const length = bytes.readUInt32LE(at + 8);
		const offset = bytes.readUInt32LE(at + 12);
		if (offset + length > bytes.length) continue;
		if (!best || size > best.size) best = { size, offset, length };
	}
	if (!best) return null;
	const data = bytes.subarray(best.offset, best.offset + best.length);
	if (data.subarray(0, 4).equals(PNG_MAGIC)) {
		return sharp(data, { limitInputPixels: LIMIT_INPUT_PIXELS });
	}
	// A BMP without its file header: BITMAPINFOHEADER, then bottom-up rows, then a 1-bit AND mask.
	if (data.length < 40) return null;
	const headerSize = data.readUInt32LE(0);
	const width = data.readInt32LE(4);
	const height = Math.abs(data.readInt32LE(8)) / 2;
	const bpp = data.readUInt16LE(14);
	const compression = data.readUInt32LE(16);
	if (
		compression !== 0 ||
		(bpp !== 32 && bpp !== 24) ||
		width <= 0 ||
		width > 256 ||
		height <= 0 ||
		height > 256
	)
		return null;
	const stride = Math.ceil((width * bpp) / 32) * 4;
	const maskStride = Math.ceil(width / 32) * 4;
	const pixels = headerSize;
	const mask = pixels + stride * height;
	if (mask + (bpp === 24 ? maskStride * height : 0) > data.length) return null;
	const rgba = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y++) {
		const row = pixels + (height - 1 - y) * stride;
		for (let x = 0; x < width; x++) {
			const src = row + x * (bpp / 8);
			const dst = (y * width + x) * 4;
			rgba[dst] = data[src + 2];
			rgba[dst + 1] = data[src + 1];
			rgba[dst + 2] = data[src];
			if (bpp === 32) rgba[dst + 3] = data[src + 3];
			else {
				const bit = data[mask + (height - 1 - y) * maskStride + (x >> 3)] & (0x80 >> (x & 7));
				rgba[dst + 3] = bit ? 0 : 255;
			}
		}
	}
	return sharp(rgba, { raw: { width, height, channels: 4 } });
}

function open(bytes: Buffer, contentType: string | null): Sharp | null {
	if (isIco(bytes)) return unpackIco(bytes);
	// SVG is rasterised by sharp (librsvg), which does not load external files or URLs from a buffer.
	const svg = isSvg(bytes, contentType);
	return sharp(bytes, {
		limitInputPixels: LIMIT_INPUT_PIXELS,
		animated: false,
		failOn: 'error',
		...(svg ? { density: 144 } : {})
	});
}

function writeOnce(dir: string, name: string, data: Buffer) {
	const path = join(dir, name);
	if (existsSync(path)) return;
	const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temp, data);
	renameSync(temp, path);
}

/** Decodes an image a site sent and stores it as WebP; returns the stored file's name. Throws if it is not an image. */
export async function storeImageBytes(
	dir: string,
	kind: ImageKind,
	bytes: Buffer,
	contentType: string | null
): Promise<string> {
	const image = open(bytes, contentType);
	if (!image) throw new Error('not an image LinkSink can read');
	mkdirSync(dir, { recursive: true });
	const hash = createHash('sha256').update(`${kind}\n`).update(bytes).digest('hex');
	if (kind === 'favicon') {
		const icon = await image
			.resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.webp({ quality: 90 })
			.toBuffer();
		writeOnce(dir, `${hash}.webp`, icon);
		return `${hash}.webp`;
	}
	const oriented = image.rotate();
	const [large, small] = await Promise.all(
		[640, 320].map((width) =>
			oriented.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
		)
	);
	writeOnce(dir, `${hash}-320.webp`, small);
	writeOnce(dir, `${hash}.webp`, large);
	return `${hash}.webp`;
}

/**
 * Fetches an image through the guarded fetch and stores it; null when the site gave nothing usable (not an image,
 * over 5 MB, an error). An image is never worth failing the link for.
 */
export async function fetchImage(
	safeFetch: SafeFetch,
	dir: string,
	kind: ImageKind,
	url: string | null
): Promise<string | null> {
	if (!url) return null;
	try {
		const response = await safeFetch({
			url,
			accept: ACCEPT_IMAGES,
			maxBytes: IMAGE_MAX_BYTES,
			overflow: 'fail'
		});
		if (response.status !== 200) return null;
		const type = response.contentType;
		// Some servers send icons as application/octet-stream; their bytes must still decode as an image.
		if (!isImageType(type) && !(kind === 'favicon' && /octet-stream/i.test(type ?? '')))
			return null;
		return await storeImageBytes(dir, kind, response.body, type);
	} catch {
		return null;
	}
}

/** The media route's answer for `name`: the stored WebP with headers that let a browser treat it only as an image. */
export function serveMedia(dir: string, name: string): Response {
	if (!MEDIA_NAME.test(name)) return new Response('Not found', { status: 404 });
	let data: Buffer;
	try {
		data = readFileSync(join(dir, name));
	} catch {
		return new Response('Not found', { status: 404 });
	}
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': 'image/webp',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'private, max-age=31536000, immutable',
			'content-length': String(data.length)
		}
	});
}
