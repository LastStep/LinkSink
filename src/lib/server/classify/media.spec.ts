import { describe, expect, it } from 'vitest';
import { readFixture } from '../fetch/test/fixtures.ts';
import { classifyMedia, MEDIA } from './media.ts';

const evidence = (m: ReturnType<typeof readFixture>) => ({
	url: m.finalUrl,
	contentType: m.contentType,
	ogType: m.ogType,
	oembedType: m.oembedType
});

describe('classifyMedia: the six rules, first match wins, one recorded fixture each', () => {
	it('(1) the URL path extension wins over everything after it', () => {
		// an article page whose URL ends in .pdf: the extension decides
		const article = readFixture('og-article.html', 'https://example.org/papers/report.pdf');
		expect(article.ogType).toBe('article');
		expect(classifyMedia(evidence(article))).toBe('pdf');
		expect(classifyMedia({ url: 'https://example.org/a/photo.JPG' })).toBe('image');
		expect(classifyMedia({ url: 'https://example.org/clip.mp4' })).toBe('video');
		expect(classifyMedia({ url: 'https://example.org/clip.webm' })).toBe('video');
		expect(classifyMedia({ url: 'https://example.org/episode.mp3' })).toBe('podcast');
	});

	it('(2) host and path: YouTube and Vimeo are Video', () => {
		const yt = readFixture('youtube-watch.html', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
			oembed: 'youtube-oembed.json'
		});
		expect(classifyMedia(evidence(yt))).toBe('video');
		expect(classifyMedia({ url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe('video');
		expect(classifyMedia({ url: 'https://www.youtube.com/shorts/abc123' })).toBe('video');
		const vimeo = readFixture('vimeo-video.html', 'https://vimeo.com/76979871');
		expect(classifyMedia(evidence(vimeo))).toBe('video');
		// the YouTube channel page is not a video
		expect(classifyMedia({ url: 'https://www.youtube.com/@RickAstleyYT' })).toBe('page');
	});

	it('(2) host and path: a GitHub repository is Repo (its og:type is "object")', () => {
		const gh = readFixture('github-repo.html', 'https://github.com/sveltejs/kit');
		expect(gh.ogType).toBe('object');
		expect(classifyMedia(evidence(gh))).toBe('repo');
		expect(classifyMedia({ url: 'https://github.com/sveltejs/kit/tree/main/packages' })).toBe(
			'repo'
		);
		expect(classifyMedia({ url: 'https://github.com/sveltejs' })).toBe('page');
		expect(classifyMedia({ url: 'https://github.com/topics/svelte' })).toBe('page');
	});

	it('(2) host and path: X and Reddit posts are Post (X says og:type article)', () => {
		const x = readFixture('x-status.html', 'https://x.com/jack/status/20', {
			oembed: 'x-oembed.json'
		});
		expect(x.ogType).toBe('article');
		expect(classifyMedia(evidence(x))).toBe('post');
		expect(classifyMedia({ url: 'https://twitter.com/jack/status/20' })).toBe('post');
		const reddit = readFixture(
			'reddit-challenge.html',
			'https://www.reddit.com/r/programming/comments/1b3k8ag/'
		);
		expect(classifyMedia(evidence(reddit))).toBe('post');
		expect(classifyMedia({ url: 'https://www.reddit.com/r/programming/' })).toBe('page');
	});

	it('(2) host and path: Spotify episodes and Apple Podcasts are Podcast; arXiv is PDF', () => {
		expect(classifyMedia({ url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk' })).toBe(
			'podcast'
		);
		expect(classifyMedia({ url: 'https://podcasts.apple.com/us/podcast/x/id123' })).toBe('podcast');
		expect(classifyMedia({ url: 'https://arxiv.org/abs/1706.03762' })).toBe('pdf');
		expect(classifyMedia({ url: 'https://arxiv.org/pdf/1706.03762' })).toBe('pdf');
	});

	it('(3) the response Content-Type', () => {
		expect(
			classifyMedia({ url: 'https://files.example/get?id=1', contentType: 'application/pdf' })
		).toBe('pdf');
		expect(classifyMedia({ url: 'https://files.example/get?id=2', contentType: 'image/png' })).toBe(
			'image'
		);
		expect(classifyMedia({ url: 'https://files.example/get?id=3', contentType: 'video/mp4' })).toBe(
			'video'
		);
		expect(
			classifyMedia({ url: 'https://files.example/get?id=4', contentType: 'audio/mpeg' })
		).toBe('podcast');
		// the content type beats og:type
		expect(
			classifyMedia({
				url: 'https://files.example/x',
				contentType: 'application/pdf',
				ogType: 'article'
			})
		).toBe('pdf');
	});

	it('(4) og:type: a page that declares itself an article is Article', () => {
		const article = readFixture(
			'og-article.html',
			'https://simonwillison.net/2024/Dec/31/llms-in-2024/'
		);
		expect(classifyMedia(evidence(article))).toBe('article');
		expect(classifyMedia({ url: 'https://tv.example/show', ogType: 'video.episode' })).toBe(
			'video'
		);
		expect(classifyMedia({ url: 'https://music.example/song', ogType: 'music.song' })).toBe(
			'podcast'
		);
	});

	it('(5) the oEmbed type', () => {
		const photo = readFixture('oembed-photo.html', 'https://pics.example/p/1', {
			oembed: 'oembed-photo.json'
		});
		expect(classifyMedia(evidence(photo))).toBe('image');
		expect(classifyMedia({ url: 'https://clips.example/c/1', oembedType: 'video' })).toBe('video');
	});

	it('(6) otherwise Page', () => {
		const plain = readFixture('title-only.html', 'https://example.com/');
		expect(classifyMedia(evidence(plain))).toBe('page');
	});

	it('always answers one of the fixed values, even for nonsense', () => {
		for (const url of ['not a url', 'https://x/%E0%A4%A', '']) {
			expect(MEDIA).toContain(classifyMedia({ url }));
		}
	});
});
