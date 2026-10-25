import { describe, expect, it } from 'vitest';
import type { LinkJson } from '../store/types.ts';
import {
	compareLinks,
	filterCount,
	filterQuery,
	matchesFilters,
	NO_FILTERS,
	parseFilters,
	type Filters
} from './filters.ts';

const T1 = '01JTAGAAAAAAAAAAAAAAAAAAA1';
const T2 = '01JTAGAAAAAAAAAAAAAAAAAAA2';
const P1 = '01JPROJAAAAAAAAAAAAAAAAAA1';
const S1 = '01JSRCAAAAAAAAAAAAAAAAAAA1';

const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

describe('the filters in the address', () => {
	it('reads every parameter the plan names', () => {
		const params = new URLSearchParams(
			`q=deep%20learning&source=${S1}&media=video,article&tags=${T1},${T2}&tagmode=all&projects=${P1}&status=to_read,none&priority=high&archived=include&sort=edited`
		);
		expect(parseFilters(params)).toEqual({
			q: 'deep learning',
			source: [S1],
			media: ['video', 'article'],
			tags: [T1, T2],
			tagMode: 'all',
			projects: [P1],
			status: ['to_read', 'none'],
			priority: ['high'],
			archived: 'include',
			sort: 'edited'
		});
	});

	it('drops what it does not know, never failing', () => {
		const params = new URLSearchParams(
			'media=video,movie&status=later&priority=urgent&archived=maybe&sort=random&tagmode=some&tags=bad id,,ok_1&source=' +
				'x'.repeat(65)
		);
		expect(parseFilters(params)).toEqual(f({ media: ['video'], tags: ['ok_1'] }));
	});

	it('writes only what differs from no filters, in a fixed order, commas kept', () => {
		expect(filterQuery(NO_FILTERS)).toBe('');
		expect(filterQuery(f({ q: '  run ' }))).toBe('q=run');
		expect(
			filterQuery(
				f({
					sort: 'title',
					archived: 'only',
					priority: ['high', 'none'],
					status: ['done'],
					projects: [P1],
					tags: [T1, T2],
					tagMode: 'all',
					media: ['video', 'repo'],
					source: [S1],
					q: 'a b'
				})
			)
		).toBe(
			`q=a%20b&source=${S1}&media=video,repo&tags=${T1},${T2}&tagmode=all&projects=${P1}&status=done&priority=high,none&archived=only&sort=title`
		);
		// "all" means nothing with one tag, so it stays out of the address
		expect(filterQuery(f({ tags: [T1], tagMode: 'all' }))).toBe(`tags=${T1}`);
	});

	it('round-trips: a reload reads back the same filters', () => {
		const one = f({
			q: '"svelte runes" x',
			tags: [T1, T2],
			tagMode: 'all',
			status: ['in_progress'],
			sort: 'priority'
		});
		expect(parseFilters(new URLSearchParams(filterQuery(one)))).toEqual(one);
	});

	it('counts the filters set, not the search or the sort', () => {
		expect(filterCount(f({ q: 'x', sort: 'title' }))).toBe(0);
		expect(filterCount(f({ tags: [T1, T2], status: ['done'], archived: 'include' }))).toBe(3);
	});
});

function link(over: Partial<LinkJson>): LinkJson {
	return {
		id: '01JLINKAAAAAAAAAAAAAAAAAA1',
		url: 'https://example.com/a',
		urlKey: 'example.com/a',
		title: 'A link',
		description: null,
		notes: null,
		sourceId: null,
		media: 'page',
		status: null,
		priority: null,
		archivedAt: null,
		siteName: null,
		author: null,
		publishedAt: null,
		durationS: null,
		faviconPath: null,
		imagePath: null,
		metaState: 'done',
		metaFetchedAt: null,
		userSet: [],
		savedVia: 'paste',
		createdAt: 1,
		updatedAt: 1,
		openedAt: null,
		tagsText: '',
		projectsText: '',
		version: 1,
		deletedAt: null,
		tagIds: [],
		projectIds: [],
		...over
	};
}

describe('matchesFilters', () => {
	const both = link({ tagIds: [T1, T2], tagsText: 'ai recommendations' });
	const one = link({ tagIds: [T1], tagsText: 'ai' });
	const table: [string, Filters, LinkJson, boolean][] = [
		['no filters', NO_FILTERS, one, true],
		['tags any: one of two', f({ tags: [T1, T2] }), one, true],
		['tags all: one of two', f({ tags: [T1, T2], tagMode: 'all' }), one, false],
		['tags all: both', f({ tags: [T1, T2], tagMode: 'all' }), both, true],
		['status any of two', f({ status: ['to_read', 'done'] }), link({ status: 'done' }), true],
		['status none', f({ status: ['none'] }), link({ status: null }), true],
		['status none, link has one', f({ status: ['none'] }), link({ status: 'done' }), false],
		['priority high', f({ priority: ['high'] }), link({ priority: 3 }), true],
		['priority high, link low', f({ priority: ['high'] }), link({ priority: 1 }), false],
		['priority none', f({ priority: ['none'] }), link({ priority: null }), true],
		['media', f({ media: ['video'] }), link({ media: 'video' }), true],
		['media, other', f({ media: ['video'] }), link({ media: 'article' }), false],
		['source', f({ source: [S1] }), link({ sourceId: S1 }), true],
		['source, none set', f({ source: [S1] }), link({ sourceId: null }), false],
		['projects', f({ projects: [P1] }), link({ projectIds: [P1] }), true],
		['across filters: all must match', f({ tags: [T1], status: ['done'] }), one, false],
		['archived left out', NO_FILTERS, link({ archivedAt: 5 }), false],
		['archived included', f({ archived: 'include' }), link({ archivedAt: 5 }), true],
		['archived only, live link', f({ archived: 'only' }), one, false],
		['search over tags', f({ q: 'recomm' }), both, true],
		['search, no match', f({ q: 'zebra' }), both, false],
		['search and a filter', f({ q: 'ai', tags: [T2] }), one, false]
	];
	it.each(table)('%s', (_, filters, l, want) => {
		expect(matchesFilters(filters, l)).toBe(want);
	});
});

describe('compareLinks', () => {
	const a = link({ id: 'A', createdAt: 3, updatedAt: 1, priority: null, title: 'beta' });
	const b = link({ id: 'B', createdAt: 2, updatedAt: 3, priority: 3, title: 'Alpha' });
	const c = link({
		id: 'C',
		createdAt: 1,
		updatedAt: 2,
		priority: 1,
		title: null,
		url: 'https://zed.example'
	});
	const order = (sort: Parameters<typeof compareLinks>[0]) =>
		[a, b, c].sort(compareLinks(sort)).map((l) => l.id);
	it('orders as the server does', () => {
		expect(order('saved')).toEqual(['A', 'B', 'C']);
		expect(order('edited')).toEqual(['B', 'C', 'A']);
		expect(order('priority')).toEqual(['B', 'C', 'A']);
		expect(order('title')).toEqual(['B', 'A', 'C']);
	});
});
