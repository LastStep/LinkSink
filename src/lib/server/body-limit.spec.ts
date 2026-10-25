import { describe, expect, it } from 'vitest';
import { BODY_MAX, bodyTooLarge } from './body-limit.ts';

/** A request whose body streams in chunks with no Content-Length, as a chunked upload arrives. */
function streamed(path: string, bytes: number, chunk = 64 * 1024) {
	let sent = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent >= bytes) return controller.close();
			const n = Math.min(chunk, bytes - sent);
			sent += n;
			controller.enqueue(new Uint8Array(n).fill(0x61));
		}
	});
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		duplex: 'half'
	} as RequestInit);
}

describe('bodyTooLarge', () => {
	it('refuses a streamed body over 512 KB with no Content-Length, on any route but the import', async () => {
		for (const path of ['/api/auth/sign-in/email', '/api/links', '/login']) {
			expect((await bodyTooLarge(streamed(path, BODY_MAX + 1), path))?.status).toBe(413);
		}
		expect(await bodyTooLarge(streamed('/api/import', 5 * 1024 * 1024), '/api/import')).toBeNull();
	});

	it('lets a streamed body within the limit through, still readable in full by the route', async () => {
		const request = streamed('/api/links', BODY_MAX);
		expect(await bodyTooLarge(request, '/api/links')).toBeNull();
		expect((await request.arrayBuffer()).byteLength).toBe(BODY_MAX);
	});

	it('refuses a stated length over 512 KB without reading it', async () => {
		const request = new Request('http://localhost/api/links', {
			method: 'POST',
			headers: { 'content-length': String(BODY_MAX + 1) },
			body: 'x'
		});
		expect((await bodyTooLarge(request, '/api/links'))?.status).toBe(413);
	});
});
