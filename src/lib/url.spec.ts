import { describe, expect, it } from 'vitest';
import { cleanUrl, displayHost, firstHttpUrl, normalise } from './url.ts';

// [given, expected url_key]
const cases: [string, string][] = [
	// the basics: scheme and host lower-cased, path case kept
	['https://example.com/a', 'example.com/a'],
	['HTTPS://Example.COM/Path', 'example.com/Path'],
	['  https://example.com/a  ', 'example.com/a'],
	// www.
	['https://www.example.com/a', 'example.com/a'],
	['https://WWW.example.com/a', 'example.com/a'],
	['https://www2.example.com/a', 'www2.example.com/a'],
	['https://blog.www.example.com/a', 'blog.www.example.com/a'],
	// trailing slash
	['https://example.com/', 'example.com'],
	['https://example.com', 'example.com'],
	['https://example.com/a/', 'example.com/a'],
	['https://example.com/a//', 'example.com/a'],
	['https://example.com/a/?b=1', 'example.com/a?b=1'],
	// fragment
	['https://example.com/a#section-2', 'example.com/a'],
	['https://example.com/a?b=1#top', 'example.com/a?b=1'],
	['https://example.com/#', 'example.com'],
	// default ports go, others stay
	['https://example.com:443/a', 'example.com/a'],
	['http://example.com:80/a', 'example.com/a'],
	['https://example.com:8443/a', 'example.com:8443/a'],
	['http://example.com:443/a', 'example.com:443/a'],
	// query sorted by name
	['https://example.com/s?b=2&a=1', 'example.com/s?a=1&b=2'],
	['https://example.com/s?a=1&b=2', 'example.com/s?a=1&b=2'],
	['https://example.com/s?z=1&a=2&a=1', 'example.com/s?a=2&a=1&z=1'],
	['https://example.com/s?', 'example.com/s'],
	// trackers
	['https://example.com/a?utm_source=x&utm_medium=y&utm_campaign=z', 'example.com/a'],
	['https://example.com/a?UTM_Source=x', 'example.com/a'],
	['https://example.com/a?utm_content=1&id=7', 'example.com/a?id=7'],
	['https://example.com/a?fbclid=IwAR0abc', 'example.com/a'],
	['https://example.com/a?gclid=1&dclid=2&msclkid=3', 'example.com/a'],
	['https://example.com/a?mc_cid=1&mc_eid=2', 'example.com/a'],
	['https://www.instagram.com/p/Cx1/?igshid=abc', 'instagram.com/p/Cx1'],
	['https://twitter.com/x/status/1?ref_src=twsrc', 'twitter.com/x/status/1'],
	// si: a tracker on YouTube and Spotify only
	['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'youtu.be/dQw4w9WgXcQ'],
	['https://open.spotify.com/episode/42?si=deadbeef', 'open.spotify.com/episode/42'],
	['https://example.com/a?si=1', 'example.com/a?si=1'],
	// YouTube: v, t and list are the video, the moment and the playlist
	['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube.com/watch?v=dQw4w9WgXcQ'],
	[
		'https://www.youtube.com/watch?t=42&v=dQw4w9WgXcQ&utm_source=share',
		'youtube.com/watch?t=42&v=dQw4w9WgXcQ'
	],
	[
		'https://youtube.com/watch?list=PL1&v=abc&si=x&feature=shared',
		'youtube.com/watch?feature=shared&list=PL1&v=abc'
	],
	['https://youtu.be/dQw4w9WgXcQ?t=42', 'youtu.be/dQw4w9WgXcQ?t=42'],
	// http and https of one address are one link (the person, 2026-10-24)
	['http://example.com/a', 'example.com/a'],
	['http://www.example.com/a/?utm_source=x', 'example.com/a'],
	// a trailing dot on the host
	['https://example.com./a', 'example.com/a']
];

describe('normalise', () => {
	it('has at least 30 cases', () => {
		expect(cases.length).toBeGreaterThanOrEqual(30);
	});

	it.each(cases)('%s -> %s', (given, key) => {
		expect(normalise(given)).toBe(key);
	});

	it('gives the same key to the variants a person pastes of one page', () => {
		const variants = [
			'https://example.com/post',
			'https://www.example.com/post/',
			'https://example.com/post?utm_source=newsletter&utm_medium=email',
			'https://www.example.com/post#comments',
			'https://example.com:443/post?fbclid=abc',
			'http://example.com/post',
			'http://www.example.com/post/?utm_campaign=x'
		];
		expect(new Set(variants.map(normalise))).toEqual(new Set(['example.com/post']));
	});

	it('keeps different videos apart', () => {
		expect(normalise('https://youtube.com/watch?v=a')).not.toBe(
			normalise('https://youtube.com/watch?v=b')
		);
	});

	it('refuses what is not an http(s) link', () => {
		for (const bad of [
			'',
			'not a link',
			'javascript:alert(1)',
			'ftp://example.com/a',
			'mailto:a@b.c'
		]) {
			expect(normalise(bad)).toBeNull();
		}
	});
});

describe('cleanUrl', () => {
	it('removes trackers and changes nothing else', () => {
		expect(cleanUrl('https://www.example.com/a/?utm_source=x&b=2&a=1#top')).toBe(
			'https://www.example.com/a/?b=2&a=1#top'
		);
		expect(cleanUrl('https://example.com/a?q=a%20b')).toBe('https://example.com/a?q=a%20b');
		expect(cleanUrl('https://example.com/a?utm_source=x')).toBe('https://example.com/a');
		expect(cleanUrl('nope')).toBeNull();
	});
});

describe('displayHost', () => {
	it('is the host without www.', () => {
		expect(displayHost('https://www.Example.com/a')).toBe('example.com');
		expect(displayHost('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
	});
});

describe('firstHttpUrl', () => {
	it.each([
		['https://example.com/a', 'https://example.com/a'],
		['look at this: https://example.com/a, nice.', 'https://example.com/a'],
		[
			'(see https://en.wikipedia.org/wiki/Rust_(programming_language))',
			'https://en.wikipedia.org/wiki/Rust_(programming_language)'
		],
		['(see https://example.com/a)', 'https://example.com/a'],
		['two: http://a.example/1 and https://b.example/2', 'http://a.example/1'],
		['Title\nhttps://example.com/x?y=1', 'https://example.com/x?y=1']
	])('%s', (text, url) => {
		expect(firstHttpUrl(text)).toBe(url);
	});

	it('is null when the text holds no http(s) link', () => {
		expect(firstHttpUrl('just some words')).toBeNull();
		expect(firstHttpUrl('ftp://example.com/a')).toBeNull();
		expect(firstHttpUrl('')).toBeNull();
	});
});
