import { appendFileSync } from 'node:fs';

export interface Mail {
	to: string;
	subject: string;
	text: string;
}

export interface Mailer {
	send(mail: Mail): Promise<void>;
}

/** Dev and tests: prints each message, and appends it as one JSON line to `outbox` when given. */
export function consoleMailer(outbox?: string): Mailer {
	return {
		async send(mail) {
			console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
			if (outbox) appendFileSync(outbox, JSON.stringify({ ...mail, at: Date.now() }) + '\n');
		}
	};
}

/** Production: Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendMailer(apiKey: string, from: string): Mailer {
	return {
		async send(mail) {
			const res = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text })
			});
			if (!res.ok) throw new Error(`Resend refused the mail: ${res.status} ${await res.text()}`);
		}
	};
}

export function createMailer(env: {
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
	MAIL_OUTBOX?: string;
}) {
	if (env.RESEND_API_KEY) {
		if (!env.MAIL_FROM) throw new Error('MAIL_FROM must be set when RESEND_API_KEY is');
		return resendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
	}
	return consoleMailer(env.MAIL_OUTBOX);
}
