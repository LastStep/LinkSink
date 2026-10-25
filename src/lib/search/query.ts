// The one search-query parser (plan P-T-0002, step 7), shared by the server (FTS5 over links_fts) and the client (a
// link the store holds, checked against the search on screen; T-0010 runs it over the device copy). What a person
// types: words, all required; the last word matched as a prefix, so results follow each keystroke; "quoted phrases"
// matched as written, word after word. Nothing else is syntax: no FTS5 operator, column filter or star gets through.

/** One part of a query: a word, or a quoted phrase of words. `prefix`: the last word may be the start of a longer one. */
export type Term =
	| { kind: 'word'; text: string; prefix: boolean }
	| { kind: 'phrase'; words: string[]; prefix: boolean };

/** At most this many terms count; the rest are ignored. */
export const MAX_TERMS = 16;

/** The words in a piece of text, as FTS5's unicode61 tokenizer splits them: runs of letters and digits. */
export function words(text: string): string[] {
	return text
		.normalize('NFKC')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

/**
 * Parses what a person typed. A bare word is required; a quoted run is a phrase (an unclosed quote runs to the end);
 * the last term is a prefix unless it is a closed phrase. A quoted single word is a plain word.
 */
export function parseQuery(input: string): Term[] {
	const terms: Term[] = [];
	let closedLast = false;
	for (const m of input.matchAll(/"([^"]*)("?)|([^"]+)/g)) {
		if (m[1] !== undefined) {
			const ws = words(m[1]);
			if (ws.length === 0) continue;
			closedLast = m[2] === '"';
			terms.push(
				ws.length === 1
					? { kind: 'word', text: ws[0], prefix: false }
					: { kind: 'phrase', words: ws, prefix: false }
			);
		} else {
			const ws = words(m[3]);
			if (ws.length === 0) continue;
			closedLast = false;
			for (const w of ws) terms.push({ kind: 'word', text: w, prefix: false });
		}
	}
	if (terms.length && !closedLast) terms[terms.length - 1].prefix = true;
	return terms.slice(0, MAX_TERMS);
}

/** The FTS5 MATCH expression for a parsed query (each string quoted; its tokens are letters and digits only). */
export function toFts(terms: Term[]): string | null {
	if (terms.length === 0) return null;
	return terms
		.map((t) => `"${t.kind === 'word' ? t.text : t.words.join(' ')}"${t.prefix ? '*' : ''}`)
		.join(' ');
}

/**
 * Folds a word as the index does (unicode61, remove_diacritics 2): lower case, accents off. Used on both sides of a
 * client-side match, so the two agree with each other and, for the scripts people save links in, with FTS5.
 */
export function fold(word: string): string {
	return word
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.normalize('NFC');
}

/** One text field's words, folded, ready for `matches`. */
export const foldedWords = (text: string | null | undefined): string[] =>
	text ? words(text).map(fold) : [];

function phraseAt(field: string[], at: number, ws: string[], prefix: boolean): boolean {
	for (let i = 0; i < ws.length; i++) {
		const token = field[at + i];
		if (token === undefined) return false;
		const last = i === ws.length - 1;
		if (last && prefix ? !token.startsWith(ws[i]) : token !== ws[i]) return false;
	}
	return true;
}

/**
 * Whether a link's fields (each already split by `foldedWords`) match a parsed query, as FTS5 would: every term in
 * some field; a phrase inside one field, its words in a row.
 */
export function matches(terms: Term[], fields: string[][]): boolean {
	return terms.every((t) => {
		const ws = (t.kind === 'word' ? [t.text] : t.words).map(fold);
		return fields.some((field) => field.some((_, at) => phraseAt(field, at, ws, t.prefix)));
	});
}
