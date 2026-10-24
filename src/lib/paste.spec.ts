import { describe, expect, it } from 'vitest';
import { linkFromPaste } from './paste.ts';

/** A stand-in element: `matches` is what `closest(text-entry selector)` finds. */
const el = (textEntry: boolean, editable = false) =>
	({ closest: () => (textEntry ? {} : null), isContentEditable: editable }) as unknown as Element;
const data = (plain: string, uriList = '') => ({
	getData: (type: string) =>
		type === 'text/uri-list' ? uriList : type === 'text/plain' ? plain : ''
});

describe('linkFromPaste', () => {
	const page = el(false);
	const search = el(true);
	const box = el(true);
	const boxEl = { contains: (n: unknown) => n === box } as unknown as Element;

	it('takes the first link pasted anywhere on the page', () => {
		expect(linkFromPaste(page, data('see https://example.com/a.'), boxEl)).toBe(
			'https://example.com/a'
		);
		expect(linkFromPaste(page, data('', 'https://example.com/u'), boxEl)).toBe(
			'https://example.com/u'
		);
	});

	it('takes a link pasted into the paste box', () => {
		expect(linkFromPaste(box, data('https://example.com/b'), boxEl)).toBe('https://example.com/b');
	});

	it('leaves pastes into other text fields and editable text alone', () => {
		expect(linkFromPaste(search, data('https://example.com/c'), boxEl)).toBeNull();
		expect(linkFromPaste(el(false, true), data('https://example.com/c'), boxEl)).toBeNull();
	});

	it('ignores pastes with no http(s) link', () => {
		expect(linkFromPaste(page, data('just words'), boxEl)).toBeNull();
		expect(linkFromPaste(page, null, boxEl)).toBeNull();
	});
});
