// Export (T-0012): the signed-in user's links as a Netscape bookmark file any browser or bookmarking tool imports,
// and as a full JSON copy. Both hold every link that is not deleted, archived ones included.
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DB } from './db/open.ts';
import { links } from './db/schema.ts';
import { linksJson } from './links.ts';
import { listProjects, listSources, listTags } from './organise.ts';

export const EXPORT_FORMAT = 'linksink.export/1';

function allLinks(db: DB, userId: string) {
	return db
		.select()
		.from(links)
		.where(and(eq(links.userId, userId), isNull(links.deletedAt)))
		.orderBy(asc(links.createdAt), asc(links.id))
		.all();
}

/** Text made safe inside HTML content and double-quoted attributes. */
export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

const seconds = (ms: number) => String(Math.floor(ms / 1000));

/**
 * The bookmark file, in the shape Chromium and Firefox write (their DOCTYPE, META and nested `<DL><p>` lists): one
 * folder per project, in the projects' order, holding its links (a link in two projects is in both); the links in
 * no project at the top level. Each link carries ADD_DATE and LAST_MODIFIED in seconds, its tags as
 * TAGS="a,b", and its notes as a `<DD>` after it.
 */
export function exportHtml(db: DB, userId: string): string {
	const rows = allLinks(db, userId);
	const json = linksJson(db, userId, rows);
	const tagNames = new Map(listTags(db, userId).map((t) => [t.id, t.name]));
	const projects = listProjects(db, userId);
	const entry = (link: (typeof json)[number], indent: string) => {
		const tags = link.tagIds.map((id) => tagNames.get(id)).filter(Boolean);
		let out =
			`${indent}<DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${seconds(link.createdAt)}"` +
			` LAST_MODIFIED="${seconds(link.updatedAt)}"` +
			(tags.length ? ` TAGS="${escapeHtml(tags.join(','))}"` : '') +
			`>${escapeHtml(link.title ?? link.url)}</A>\n`;
		if (link.notes) out += `${indent}<DD>${escapeHtml(link.notes)}\n`;
		return out;
	};
	let body = '';
	for (const project of projects) {
		const inside = json.filter((l) => l.projectIds.includes(project.id));
		const latest = Math.max(project.createdAt, ...inside.map((l) => l.updatedAt));
		body += `    <DT><H3 ADD_DATE="${seconds(project.createdAt)}" LAST_MODIFIED="${seconds(latest)}">${escapeHtml(project.name)}</H3>\n`;
		body += '    <DL><p>\n';
		for (const link of inside) body += entry(link, '        ');
		body += '    </DL><p>\n';
	}
	for (const link of json) if (link.projectIds.length === 0) body += entry(link, '    ');
	return (
		'<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
		'<!-- This is an automatically generated file.\n' +
		'     It will be read and overwritten.\n' +
		'     DO NOT EDIT! -->\n' +
		'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
		'<TITLE>Bookmarks</TITLE>\n' +
		'<H1>Bookmarks</H1>\n' +
		'<DL><p>\n' +
		body +
		'</DL><p>\n'
	);
}

/**
 * Everything, versioned: every link with all its fields (and its tags' and projects' names beside their ids), the
 * sources, tags and projects. Deleted rows are left out.
 */
export function exportJson(db: DB, userId: string, now = Date.now()) {
	const tags = listTags(db, userId);
	const projects = listProjects(db, userId);
	const tagNames = new Map(tags.map((t) => [t.id, t.name]));
	const projectNames = new Map(projects.map((p) => [p.id, p.name]));
	return {
		format: EXPORT_FORMAT,
		exportedAt: now,
		links: linksJson(db, userId, allLinks(db, userId)).map((link) => ({
			...link,
			tags: link.tagIds.map((id) => tagNames.get(id)!),
			projects: link.projectIds.map((id) => projectNames.get(id)!)
		})),
		sources: listSources(db, userId),
		tags,
		projects
	};
}

/** The file name a download gets: linksink-<what>-YYYY-MM-DD.<ext>. */
export function exportName(what: string, ext: string, now = Date.now()) {
	return `linksink-${what}-${new Date(now).toISOString().slice(0, 10)}.${ext}`;
}
