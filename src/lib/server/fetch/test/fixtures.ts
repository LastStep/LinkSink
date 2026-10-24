import { readFileSync } from 'node:fs';
import { decodeHtml, parseHead } from '../head.ts';
import { mergeMeta, metaFromHead, parseOEmbed, type PageMeta } from '../meta.ts';

export const fixture = (name: string) =>
	readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

/** A recorded page read as the fetcher reads it: decoded, head parsed, merged with its oEmbed. */
export function readFixture(
	name: string,
	url: string,
	{
		contentType = 'text/html; charset=utf-8',
		oembed
	}: { contentType?: string; oembed?: string } = {}
): PageMeta {
	const head = metaFromHead(parseHead(decodeHtml(fixture(name), contentType)), url);
	const o = oembed ? parseOEmbed(fixture(oembed)) : null;
	return mergeMeta(head, o, { finalUrl: url, contentType, isX: new URL(url).hostname === 'x.com' });
}
