import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Structural checks over the source: the fetcher's two rules that a test of behaviour cannot see whole. */
function sources(dir: string): { path: string; text: string }[] {
	const out: { path: string; text: string }[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
		const path = join(entry.parentPath, entry.name);
		const testCode = /\.spec\.ts$/.test(entry.name) || path.split(/[/\\]/).includes('test');
		if (entry.isFile() && /\.(ts|js|svelte)$/.test(entry.name) && !testCode) {
			out.push({ path, text: readFileSync(path, 'utf-8') });
		}
	}
	return out;
}

const app = sources('src');

describe('fetcher boundaries', () => {
	it('LinkSink/1.0 is the only User-Agent a page fetch sends, set in one place', () => {
		// Server code that opens outbound connections: the guarded fetch, and the mailer's call to Resend's API.
		const outbound = app.filter(
			(f) =>
				f.path.includes(join('lib', 'server')) &&
				/\bfetch\(|from 'undici'|node:https?'|\bhttps?\.request\(/.test(f.text)
		);
		expect(outbound.map((f) => f.path).sort()).toEqual(
			[
				join('src', 'lib', 'server', 'fetch', 'safe.ts'),
				join('src', 'lib', 'server', 'mail.ts')
			].sort()
		);
		const safe = outbound.find((f) => f.path.endsWith('safe.ts'))!.text;
		expect(safe).toContain("'user-agent': config.userAgent");
		expect(safe).toContain('return `LinkSink/1.0 (+https://${host})`;');
		// Setting a User-Agent header anywhere else: only auth-form.ts, which hands the browser's own header to
		// Better Auth inside the process (no request leaves the server).
		const setters = app.filter((f) => /['"]user-agent['"]\s*[:,]/i.test(f.text)).map((f) => f.path);
		expect(setters.sort()).toEqual(
			[
				join('src', 'lib', 'server', 'auth-form.ts'),
				join('src', 'lib', 'server', 'fetch', 'safe.ts')
			].sort()
		);
	});

	it('the fetcher and classifiers write synced tables only through syncWrite', () => {
		const mine = app.filter(
			(f) => f.path.includes(join('server', 'fetch')) || f.path.includes(join('server', 'classify'))
		);
		expect(mine.length).toBeGreaterThan(5);
		for (const f of mine) {
			expect(f.text, f.path).not.toMatch(/\b(db|tx)\s*\.\s*(insert|update|delete)\s*\(/);
			expect(f.text, f.path).not.toMatch(/\.prepare\(|\$client/);
		}
	});
});
