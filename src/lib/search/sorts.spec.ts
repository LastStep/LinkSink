import { describe, expect, it } from 'vitest';
import {
	compareLinks,
	filterQuery,
	NO_FILTERS,
	parseFilters,
	SORT_LABEL,
	SORTS,
	statusRank
} from './filters.ts';

// The sorts the control offers (T-0025): their words, their place in the address, and the two new orders.
const l = (over: Record<string, unknown>) => ({
	id: 'x',
	createdAt: 1,
	updatedAt: 1,
	openedAt: null,
	status: null,
	priority: null,
	title: 't',
	url: 'https://e.example',
	...over
});

describe('the sort control’s sorts', () => {
	it('lists them in the control’s order, each with its words', () => {
		expect(SORTS.map((s) => SORT_LABEL[s])).toEqual([
			'Date saved',
			'Last edited',
			'Last opened',
			'Title',
			'Priority',
			'Status'
		]);
	});

	it.each(SORTS.filter((s) => s !== 'saved'))(
		'keeps %s in the address, and reads it back',
		(sort) => {
			expect(filterQuery({ ...NO_FILTERS, sort })).toBe(`sort=${sort}`);
			expect(parseFilters(new URLSearchParams(`sort=${sort}`)).sort).toBe(sort);
		}
	);

	it('leaves the default sort out of the address, and drops one it does not know', () => {
		expect(filterQuery(NO_FILTERS)).toBe('');
		expect(parseFilters(new URLSearchParams('sort=colour')).sort).toBe('saved');
	});

	it('ranks status as the status list shows it, none last', () => {
		expect(['done', null, 'to_read', 'in_progress', 'bogus'].map(statusRank)).toEqual([
			1, 0, 3, 2, 0
		]);
	});

	it('sorts by status, then newest saved, then id', () => {
		const rows = [
			l({ id: 'a', status: null, createdAt: 9 }),
			l({ id: 'b', status: 'done', createdAt: 1 }),
			l({ id: 'c', status: 'to_read', createdAt: 2 }),
			l({ id: 'd', status: 'to_read', createdAt: 5 }),
			l({ id: 'e', status: 'in_progress', createdAt: 3 })
		];
		expect(rows.sort(compareLinks('status')).map((r) => r.id)).toEqual(['d', 'c', 'e', 'b', 'a']);
	});

	it('sorts by last opened, newest first, never opened last', () => {
		const rows = [
			l({ id: 'a', openedAt: null, createdAt: 9 }),
			l({ id: 'b', openedAt: 100, createdAt: 1 }),
			l({ id: 'c', openedAt: 900, createdAt: 2 }),
			l({ id: 'd', openedAt: null, createdAt: 5 })
		];
		expect(rows.sort(compareLinks('opened')).map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']);
	});
});
