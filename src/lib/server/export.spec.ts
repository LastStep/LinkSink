// T-0012 fix round 3 (D1): the HTML export of a project holding more links than a spread argument can carry.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportHtml } from './export.ts';
import { addUser, tempDatabase } from './test/db.ts';

let t: ReturnType<typeof tempDatabase>;
beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u');
});
afterEach(() => t.close());

describe('exportHtml', () => {
	it('a project of 150,000 links exports, with its newest change as the folder LAST_MODIFIED', () => {
		const n = 150_000;
		const c = t.db.$client;
		c.exec(
			`INSERT INTO projects (id, user_id, name, color, position, created_at, version) VALUES ('P1', 'u', 'Big', 'green', 0, 1000, 1)`
		);
		const link = c.prepare(
			`INSERT INTO links (id, user_id, url, url_key, title, saved_via, created_at, updated_at, version, meta_state)
			 VALUES (?, 'u', ?, ?, 'x', 'import', 1000, ?, 1, 'ok')`
		);
		const join = c.prepare(
			`INSERT INTO link_projects (link_id, project_id, user_id, created_at, version) VALUES (?, 'P1', 'u', 1, 1)`
		);
		c.transaction(() => {
			for (let i = 0; i < n; i++) {
				const id = String(i).padStart(26, '0');
				link.run(id, `https://big.example.com/${i}`, `big.example.com/${i}`, 2000 + i * 1000);
				join.run(id);
			}
		})();
		const html = exportHtml(t.db, 'u');
		const lastModified = Math.floor((2000 + (n - 1) * 1000) / 1000);
		expect(html).toContain(`<DT><H3 ADD_DATE="1" LAST_MODIFIED="${lastModified}">Big</H3>`);
		expect(html.split('<DT><A ').length - 1).toBe(n);
	}, 120_000);
});
