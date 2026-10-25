import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { PRIORITIES, STATUSES } from '#lib/fields.ts';
import { priorityMark, statusMark } from './marks.ts';
import StateMark from './StateMark.svelte';

// T-0018: one StateMark draws every status and priority mark (ADR-0005). The render table: value -> shape and token.
describe('statusMark', () => {
	it.each([
		[null, 'dashed', 'var(--faint)'],
		['to_read', 'empty', 'var(--text)'],
		['in_progress', 'half', 'var(--text)'],
		['done', 'check', 'var(--positive)']
	] as const)('%s is a %s mark in %s', (value, shape, color) => {
		expect(statusMark(value)).toEqual({ kind: 'status', shape, color });
	});
});

describe('priorityMark', () => {
	it.each([
		[null, 0, 'var(--faint)'],
		[1, 1, 'var(--text)'],
		[2, 2, 'var(--text)'],
		[3, 3, 'var(--negative)']
	] as const)('%s is %i bars in %s', (value, bars, color) => {
		expect(priorityMark(value)).toEqual({ kind: 'priority', bars, color });
	});
});

describe('StateMark renders the table', () => {
	const html = (kind: 'status' | 'priority', value: string | number | null) =>
		render(StateMark, { props: { kind, value } }).body;

	it('draws each status as its own shape, Done in --positive', () => {
		const shapes = [null, ...STATUSES].map(
			(v) => /data-mark="([^"]+)"/.exec(html('status', v))?.[1]
		);
		expect(shapes).toEqual(['dashed', 'empty', 'half', 'check']);
		expect(html('status', 'done')).toContain('color: var(--positive)');
		expect(html('status', null)).toContain('stroke-dasharray');
		for (const v of ['to_read', 'in_progress'] as const)
			expect(html('status', v)).not.toContain('--positive');
	});

	it('draws one to three filled bars, High in --negative, and a dash for none', () => {
		for (const p of PRIORITIES) {
			const out = html('priority', p);
			expect(out.match(/<rect/g)).toHaveLength(3);
			expect(out.match(/fill="currentColor"/g)).toHaveLength(p);
		}
		expect(html('priority', 3)).toContain('color: var(--negative)');
		expect(html('priority', 2)).not.toContain('--negative');
		const none = html('priority', null);
		expect(none).not.toContain('<rect');
		expect(none).toContain('data-mark="bars-0"');
		expect(none).toContain('color: var(--faint)');
	});

	it('is hidden from assistive technology (the word beside it carries the meaning)', () => {
		expect(html('status', 'done')).toContain('aria-hidden="true"');
	});
});
