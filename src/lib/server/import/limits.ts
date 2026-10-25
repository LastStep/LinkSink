// How much of each raw field an import reads (T-0012, fix round 4). Every field of an import file is cut to its
// limit here before any regex, normalisation or splitting, so the work on each stays small however long the file
// makes it. Each limit sits above what the app keeps, so nothing the app would store is lost by the cut.

/** The most links one import takes; a bigger file is refused before anything is written. */
export const IMPORT_LINKS_MAX = 100_000;

/** The longest name the app keeps (a tag or a project), and how much raw text one may be read from. */
export const NAME_MAX = 64;
export const NAME_RAW_MAX = NAME_MAX * 4;

export const FIELD_MAX = {
	/** An address: browsers and servers rarely accept longer ones. */
	url: 8_192,
	/** A title: the app keeps 500 characters. */
	title: 2_000,
	/** Notes (a `<DD>`): the app keeps 20,000 characters. */
	notes: 20_000,
	/** A whole TAGS value: 100 tags of a raw name each, with their commas. */
	tags: 100 * (NAME_RAW_MAX + 1),
	/** A folder heading. */
	folder: NAME_RAW_MAX,
	/** A date in seconds (or ms, or µs). */
	date: 32,
	/** Pocket's status. */
	status: 32
} as const;

/** The longest any one attribute is read while tokenizing (the largest field above). */
export const ATTRIBUTE_MAX = Math.max(FIELD_MAX.url, FIELD_MAX.tags);

/** `value` cut to at most `max` characters; '' for none. */
export function cut(value: string | null | undefined, max: number): string {
	if (!value) return '';
	return value.length > max ? value.slice(0, max) : value;
}

/** `text` with `chunk` added, never past `max` characters (for text read in pieces). */
export function append(text: string, chunk: string, max: number): string {
	return text.length >= max ? text : text + cut(chunk, max - text.length);
}
