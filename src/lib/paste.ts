import { firstHttpUrl } from './url.ts';

/** The element (or one of its ancestors) takes typed text: a text field, a text area, a select or editable content. */
function isTextEntry(target: EventTarget | null): boolean {
	const el = target as (Element & { isContentEditable?: boolean }) | null;
	if (!el || typeof el.closest !== 'function') return false;
	if (el.isContentEditable) return true;
	return (
		el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
	);
}

/**
 * What a paste saves: the first http(s) address in the pasted text, unless the paste lands in a text field other
 * than the paste box (pasting into a search or title field must stay a plain paste). Null means "leave it alone".
 */
export function linkFromPaste(
	target: EventTarget | null,
	data: Pick<DataTransfer, 'getData'> | null,
	pasteBox: Element | null
): string | null {
	if (!data) return null;
	const inBox = pasteBox !== null && target !== null && pasteBox.contains(target as Node);
	if (!inBox && isTextEntry(target)) return null;
	return firstHttpUrl(data.getData('text/uri-list')) ?? firstHttpUrl(data.getData('text/plain'));
}

/**
 * Listens for pastes anywhere on the page and hands each pasted link to `save`; the paste itself is then not
 * inserted anywhere. Returns the function that stops listening.
 */
export function listenForPastes(
	save: (url: string) => void,
	pasteBox: () => Element | null,
	target: Window = window
): () => void {
	const onPaste = (event: ClipboardEvent) => {
		const url = linkFromPaste(event.target, event.clipboardData, pasteBox());
		if (!url) return;
		event.preventDefault();
		save(url);
	};
	target.addEventListener('paste', onPaste);
	return () => target.removeEventListener('paste', onPaste);
}
