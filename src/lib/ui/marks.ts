// The marks for status and priority (ADR-0005): one table, drawn by StateMark.svelte in the row, the details and
// the organiser alike. Colour stays limited to Done's check (--positive) and High's bars (--negative).
import type { Priority, Status } from '#lib/fields.ts';

export type StatusShape = 'dashed' | 'empty' | 'half' | 'check';
export type MarkSpec =
	| { kind: 'status'; shape: StatusShape; color: string }
	| { kind: 'priority'; bars: 0 | 1 | 2 | 3; color: string };

/** What a status looks like: unset is a dashed circle, then an empty circle, a half circle, a green check. */
export function statusMark(value: Status | string | null | undefined): MarkSpec {
	switch (value) {
		case 'to_read':
			return { kind: 'status', shape: 'empty', color: 'var(--text)' };
		case 'in_progress':
			return { kind: 'status', shape: 'half', color: 'var(--text)' };
		case 'done':
			return { kind: 'status', shape: 'check', color: 'var(--positive)' };
		default:
			return { kind: 'status', shape: 'dashed', color: 'var(--faint)' };
	}
}

/** What a priority looks like: unset is a faint dash (no bars), then one to three bars, High's in red. */
export function priorityMark(value: Priority | number | null | undefined): MarkSpec {
	if (value === 1 || value === 2) return { kind: 'priority', bars: value, color: 'var(--text)' };
	if (value === 3) return { kind: 'priority', bars: 3, color: 'var(--negative)' };
	return { kind: 'priority', bars: 0, color: 'var(--faint)' };
}
