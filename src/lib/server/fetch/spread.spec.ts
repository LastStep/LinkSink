// T-0012 fix round 3: a fetched page's attributes and JSON-LD can hold any number of values; reading them never
// passes them all as call arguments (which throws past roughly 120,000).
import { describe, expect, it } from 'vitest';
import { parseHead } from './head.ts';
import { metaFromHead, pickIcon } from './meta.ts';

describe('a page with 200,000 icon sizes and 200,000 JSON-LD urls and names', () => {
	it('parses without throwing', () => {
		const n = 200_000;
		const sizes = Array.from({ length: n }, (_, i) => `${(i % 500) + 1}x${(i % 500) + 1}`).join(
			' '
		);
		const urls = Array.from({ length: n }, (_, i) => `https://img.example.com/${i}.png`);
		const authors = Array.from({ length: n }, (_, i) => ({ name: `Author ${i}` }));
		const ld = JSON.stringify({
			'@type': 'Article',
			headline: 'Many values',
			image: urls,
			author: authors
		});
		const html =
			`<!doctype html><html><head><title>Many</title>` +
			`<link rel="icon" sizes="${sizes}" href="/big.png">` +
			`<script type="application/ld+json">${ld}</script></head><body></body></html>`;
		const head = parseHead(html);
		expect(pickIcon(head.icons, 'https://many.example.com/')).toBe(
			'https://many.example.com/big.png'
		);
		const meta = metaFromHead(head, 'https://many.example.com/');
		expect(meta.imageUrl).toBe('https://img.example.com/0.png');
		expect(meta.author).toBe('Author 0');
	});
});
