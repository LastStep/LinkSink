import type { RequestEvent } from '@sveltejs/kit';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import type { Auth } from './auth-config.ts';

export type AuthResult =
	{ ok: true; data: unknown } | { ok: false; status: number; message: string; code?: string };

/**
 * Sends a form's request through Better Auth's own HTTP handler (not `auth.api`), so its rate limit, origin check
 * and hooks apply exactly as they do for a browser or the iOS app calling /api/auth directly. The client address is
 * the one SvelteKit sees for this request; the Set-Cookie headers come back onto SvelteKit's response.
 */
export async function authPost(
	auth: Auth,
	event: RequestEvent,
	path: '/sign-in/email' | '/sign-up/email',
	body: Record<string, unknown>
): Promise<AuthResult> {
	const origin = new URL(auth.options.baseURL as string).origin;
	const headers = new Headers({
		'content-type': 'application/json',
		origin,
		'x-forwarded-for': event.getClientAddress()
	});
	const userAgent = event.request.headers.get('user-agent');
	if (userAgent) headers.set('user-agent', userAgent);
	const cookie = event.request.headers.get('cookie');
	if (cookie) headers.set('cookie', cookie);

	const res = await auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		})
	);

	const setCookie = res.headers.get('set-cookie');
	if (setCookie) {
		for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
			event.cookies.set(name, attributes.value, {
				...toCookieOptions(attributes),
				path: attributes.path || '/'
			});
		}
	}

	const data = await res.json().catch(() => null);
	if (res.ok) return { ok: true, data };
	const message =
		res.status === 429
			? 'Too many tries. Wait a few seconds and try again.'
			: ((data as { message?: string } | null)?.message ?? 'That did not work. Try again.');
	return { ok: false, status: res.status, message, code: (data as { code?: string } | null)?.code };
}
