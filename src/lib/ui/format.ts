// Dates as the ledger shows them: links grouped under the day they were saved, each with its time.

const DAY = 86_400_000;

function startOfDay(ms: number) {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** The heading of a day: Today, Yesterday, a weekday this week, else the date (with the year if not this year). */
export function dayLabel(ms: number, now = Date.now()): string {
	const day = startOfDay(ms);
	const today = startOfDay(now);
	const diff = Math.round((today - day) / DAY);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Yesterday';
	if (diff > 1 && diff < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: 'long' });
	const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
	return new Date(ms).toLocaleDateString(undefined, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		...(sameYear ? {} : { year: 'numeric' })
	});
}

const clock = new Intl.DateTimeFormat(undefined, {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});
export const timeOf = (ms: number) => clock.format(ms);

const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const dateTime = (ms: number) => full.format(ms);

/** Groups items (already newest first) by the day of `at(item)`, keeping order. */
export function byDay<T>(
	items: T[],
	at: (item: T) => number,
	now = Date.now()
): { key: number; label: string; items: T[] }[] {
	const groups: { key: number; label: string; items: T[] }[] = [];
	for (const item of items) {
		const key = startOfDay(at(item));
		const last = groups.at(-1);
		if (last && last.key === key) last.items.push(item);
		else groups.push({ key, label: dayLabel(at(item), now), items: [item] });
	}
	return groups;
}

/** "3 links", "1 link". */
export const plural = (n: number, one: string, many = `${one}s`) =>
	`${n.toLocaleString()} ${n === 1 ? one : many}`;
