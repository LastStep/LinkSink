import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SentMail {
	to: string;
	subject: string;
	text: string;
	at: number;
}

/** The console mailer's outbox for the e2e server (scripts/e2e-server.js). */
export function sentMail(): SentMail[] {
	const file = resolve('data/e2e/outbox.jsonl');
	if (!existsSync(file)) return [];
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as SentMail);
}

export function linkIn(mail: SentMail): string {
	const match = mail.text.match(/https?:\/\/\S+/);
	if (!match) throw new Error(`no link in mail: ${mail.text}`);
	return match[0];
}
