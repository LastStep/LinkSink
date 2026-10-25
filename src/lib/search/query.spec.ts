import { describe, expect, it } from 'vitest';
import { foldedWords, matches, parseQuery, toFts, type Term } from './query.ts';

const w = (text: string, prefix = false): Term => ({ kind: 'word', text, prefix });
const p = (words: string[], prefix = false): Term => ({ kind: 'phrase', words, prefix });

describe('parseQuery and toFts', () => {
	// [what was typed, the terms, the FTS5 expression]
	const table: [string, Term[], string | null][] = [
		['', [], null],
		['   ', [], null],
		['svelte', [w('svelte', true)], '"svelte"*'],
		['svelte run', [w('svelte'), w('run', true)], '"svelte" "run"*'],
		['svelte run ', [w('svelte'), w('run', true)], '"svelte" "run"*'],
		['"svelte runes"', [p(['svelte', 'runes'])], '"svelte runes"'],
		['"svelte runes', [p(['svelte', 'runes'], true)], '"svelte runes"*'],
		[
			'ai "deep learning" paper',
			[w('ai'), p(['deep', 'learning']), w('paper', true)],
			'"ai" "deep learning" "paper"*'
		],
		['"ai" rec', [w('ai'), w('rec', true)], '"ai" "rec"*'],
		['rec "ai"', [w('rec'), w('ai')], '"rec" "ai"'],
		['orm.drizzle', [w('orm'), w('drizzle', true)], '"orm" "drizzle"*'],
		[
			'title:x OR NEAR(z) -w *',
			[w('title'), w('x'), w('OR'), w('NEAR'), w('z'), w('w', true)],
			'"title" "x" "OR" "NEAR" "z" "w"*'
		],
		['  -- "" ** ', [], null],
		['café naïve', [w('café'), w('naïve', true)], '"café" "naïve"*'],
		['ｓｖｅｌｔｅ', [w('svelte', true)], '"svelte"*'],
		['"', [], null],
		['x "', [w('x', true)], '"x"*']
	];
	it.each(table)('%j', (input, terms, fts) => {
		expect(parseQuery(input)).toEqual(terms);
		expect(toFts(parseQuery(input))).toBe(fts);
	});

	it('keeps at most 16 terms', () => {
		const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
		const terms = parseQuery(many);
		expect(terms).toHaveLength(16);
		expect(terms.every((t) => !t.prefix)).toBe(true);
	});
});

describe('matches (the client side of the same rule)', () => {
	const fields = [
		foldedWords('Svelte Runes Explained'),
		foldedWords('https://svelte.dev/docs/runes'),
		foldedWords('Café crème')
	];
	const table: [string, boolean][] = [
		['svelte', true],
		['sve', true],
		['run', true],
		['run svelte', false], // only the last word is a prefix
		['runes svelte', true],
		['"svelte runes"', true],
		['"runes svelte"', false],
		['"svelte ru', true],
		['"explained svelte"', false],
		['cafe', true],
		['CRÈME', true],
		['svelte.dev', true],
		['docs runes', true],
		['nothing', false],
		['', true]
	];
	it.each(table)('%j → %s', (q, want) => {
		expect(matches(parseQuery(q), fields)).toBe(want);
	});
	it('does not run a phrase across two fields', () => {
		expect(matches(parseQuery('"explained https"'), fields)).toBe(false);
	});
});
