import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { Agent, buildConnector } from 'undici';
import { isPublicAddress, unbracket } from './addresses.ts';

/**
 * The one way LinkSink fetches a URL it did not choose (a page, its oEmbed, its images). Two checks guard every
 * request and every redirect hop:
 *
 * (a) before connecting, `checkUrl`: http or https only, on an allowed port, and a host that is an IP literal (in any
 *     form the WHATWG URL parser normalises: dotted, decimal, hex, octal, short, bracketed IPv6, IPv4-mapped) must be
 *     public. Node never calls `lookup` for an IP literal, so this check is the only one such a URL meets.
 * (b) at connect time, the agent's connector resolves the hostname itself, refuses it if any resolved address is not
 *     public, and connects to the address it validated (so a second, rebinding answer is never asked for).
 *
 * Redirects are followed by hand, at most 5, each hop checked again by (a) and (b). One deadline (8 s) covers every
 * hop and the body; the body is capped. Every request carries LinkSink's honest User-Agent and nothing else that
 * identifies it: there is no option to set another.
 */

/** The URL, or an address it leads to, is one LinkSink must not fetch. Never retried. */
export class FetchRefused extends Error {
	readonly reason: string;
	constructor(reason: string, message: string) {
		super(message);
		this.name = 'FetchRefused';
		this.reason = reason;
	}
}

/** The fetch was allowed but did not succeed: network error, timeout, too many redirects, too large. */
export class FetchFailed extends Error {
	readonly reason: string;
	constructor(reason: string, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'FetchFailed';
		this.reason = reason;
	}
}

/** Resolves a hostname to every address it has. */
export type Resolver = (hostname: string) => Promise<string[]>;

export const defaultResolver: Resolver = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

export const DEFAULT_PORTS: ReadonlySet<number> = new Set([80, 443]);
export const TIMEOUT_MS = 8_000;
export const MAX_REDIRECTS = 5;
export const PAGE_MAX_BYTES = 1024 * 1024;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** LinkSink's one User-Agent: `LinkSink/1.0 (+https://<host>)`, the host being the app's own public one. */
export function linkSinkUserAgent(host: string): string {
	return `LinkSink/1.0 (+https://${host})`;
}

export interface SafeFetchConfig {
	/** The User-Agent header, from `linkSinkUserAgent`. */
	userAgent: string;
	resolve?: Resolver;
	ports?: ReadonlySet<number>;
	timeoutMs?: number;
	maxRedirects?: number;
	/**
	 * Tests only: where to dial an address that already passed check (b). The address it is given has been
	 * validated; this only lets a test stand a local server in for a public address. Never set in the app.
	 */
	dialFor?: (address: string, port: number) => { host: string; port: number };
}

export interface SafeRequest {
	url: string;
	/** The Accept header. */
	accept: string;
	maxBytes: number;
	/** Past `maxBytes`: keep what was read (a page's head is enough) or fail (an image cut short is useless). */
	overflow: 'truncate' | 'fail';
	/** Stop reading once this says the bytes so far are enough (e.g. `</head>` was seen). */
	enough?: (bytes: Buffer) => boolean;
}

export interface SafeResponse {
	/** The URL of the last hop, after redirects. */
	url: string;
	status: number;
	contentType: string | null;
	body: Buffer;
	truncated: boolean;
	/** Every URL requested, in order, the first being the one asked for. */
	hops: string[];
}

function effectivePort(url: URL): number {
	if (url.port) return Number(url.port);
	return url.protocol === 'https:' ? 443 : 80;
}

/** Check (a): scheme, port and IP-literal host, before any connection is made. Throws FetchRefused. */
export function checkUrl(url: URL, ports: ReadonlySet<number> = DEFAULT_PORTS): void {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new FetchRefused('scheme', `only http and https are fetched, not ${url.protocol}`);
	}
	const port = effectivePort(url);
	if (!ports.has(port)) throw new FetchRefused('port', `port ${port} is not fetched`);
	const host = unbracket(url.hostname);
	if (isIP(host) && !isPublicAddress(host)) {
		throw new FetchRefused('address', `${url.hostname} is not a public address`);
	}
	if (host === 'localhost' || host.endsWith('.localhost') || host === 'localhost.') {
		throw new FetchRefused('address', `${url.hostname} is a local name`);
	}
}

/** Check (b): the address to connect to for `hostname`, every resolved address having been checked. */
export async function pickAddress(hostname: string, resolve: Resolver): Promise<string> {
	const host = unbracket(hostname);
	if (isIP(host)) {
		if (!isPublicAddress(host))
			throw new FetchRefused('address', `${host} is not a public address`);
		return host;
	}
	let addresses: string[];
	try {
		addresses = await resolve(host);
	} catch (error) {
		throw new FetchFailed('dns', `${host} did not resolve`, { cause: error });
	}
	if (addresses.length === 0) throw new FetchFailed('dns', `${host} has no address`);
	const bad = addresses.find((a) => !isPublicAddress(a));
	if (bad !== undefined) {
		throw new FetchRefused('address', `${host} resolves to ${bad}, which is not a public address`);
	}
	return unbracket(addresses[0]);
}

function headerValue(value: string | string[] | undefined): string | null {
	if (value === undefined) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

function decoded(body: Readable, encoding: string | null): Readable {
	switch ((encoding ?? '').trim().toLowerCase()) {
		case 'gzip':
		case 'x-gzip':
			return body.pipe(createGunzip());
		case 'deflate':
			return body.pipe(createInflate());
		case 'br':
			return body.pipe(createBrotliDecompress());
		default:
			return body;
	}
}

/** Stops a body we no longer want; its abort error is expected and swallowed. */
function discard(stream: Readable) {
	stream.on('error', () => {});
	stream.destroy();
}

function refusalIn(error: unknown): FetchRefused | null {
	for (let e = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
		if (e instanceof FetchRefused) return e;
	}
	return null;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type SafeFetch = ((request: SafeRequest) => Promise<SafeResponse>) & {
	close(): Promise<void>;
};

/** Builds the guarded fetch. The app uses one, made once; tests make their own with a stub resolver. */
export function createSafeFetch(config: SafeFetchConfig): SafeFetch {
	const resolve = config.resolve ?? defaultResolver;
	const ports = config.ports ?? DEFAULT_PORTS;
	const timeoutMs = config.timeoutMs ?? TIMEOUT_MS;
	const maxRedirects = config.maxRedirects ?? MAX_REDIRECTS;
	const base = buildConnector({ timeout: timeoutMs });

	const connect: buildConnector.connector = (options, callback) => {
		const hostname = unbracket(options.hostname);
		pickAddress(hostname, resolve).then(
			(address) => {
				const port = Number(options.port) || (options.protocol === 'https:' ? 443 : 80);
				let target = { host: address, port };
				try {
					if (config.dialFor) target = config.dialFor(address, port);
				} catch (error) {
					callback(error as Error, null);
					return;
				}
				base(
					{
						...options,
						hostname: target.host,
						port: String(target.port),
						servername: isIP(hostname) ? undefined : hostname
					},
					callback
				);
			},
			(error) => callback(error, null)
		);
	};
	const agent = new Agent({ connect, connections: 4 });

	async function readBody(
		body: Readable,
		encoding: string | null,
		request: SafeRequest,
		declaredLength: number | null
	): Promise<{ body: Buffer; truncated: boolean }> {
		if (
			request.overflow === 'fail' &&
			declaredLength !== null &&
			declaredLength > request.maxBytes
		) {
			discard(body);
			throw new FetchFailed('too-large', `the response is ${declaredLength} bytes`);
		}
		const stream = decoded(body, encoding);
		const chunks: Buffer[] = [];
		let total = 0;
		let truncated = false;
		try {
			for await (const chunk of stream as AsyncIterable<Buffer>) {
				total += chunk.length;
				if (total > request.maxBytes) {
					if (request.overflow === 'fail') {
						throw new FetchFailed('too-large', `the response is over ${request.maxBytes} bytes`);
					}
					chunks.push(chunk.subarray(0, chunk.length - (total - request.maxBytes)));
					truncated = true;
					break;
				}
				chunks.push(chunk);
				if (request.enough?.(Buffer.concat(chunks))) break;
			}
		} finally {
			discard(stream);
			discard(body);
		}
		return { body: Buffer.concat(chunks), truncated };
	}

	async function safeFetch(request: SafeRequest): Promise<SafeResponse> {
		const signal = AbortSignal.timeout(timeoutMs);
		const hops: string[] = [];
		let url = URL.parse(request.url);
		if (!url) throw new FetchRefused('url', 'not a URL');
		try {
			for (;;) {
				checkUrl(url, ports);
				hops.push(url.href);
				const response = await agent.request({
					origin: url.origin,
					path: url.pathname + url.search,
					method: 'GET',
					headers: {
						'user-agent': config.userAgent,
						accept: request.accept,
						'accept-encoding': 'gzip, deflate, br'
					},
					signal
				});
				const location = headerValue(response.headers.location);
				if (REDIRECTS.has(response.statusCode) && location) {
					discard(response.body);
					if (hops.length > maxRedirects) {
						throw new FetchFailed('redirects', `more than ${maxRedirects} redirects`);
					}
					const next = URL.parse(location, url);
					if (!next)
						throw new FetchFailed('redirects', 'a redirect to something that is not a URL');
					url = next;
					continue;
				}
				const lengthHeader = headerValue(response.headers['content-length']);
				const { body, truncated } = await readBody(
					response.body,
					headerValue(response.headers['content-encoding']),
					request,
					lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null
				);
				return {
					url: url.href,
					status: response.statusCode,
					contentType: headerValue(response.headers['content-type']),
					body,
					truncated,
					hops
				};
			}
		} catch (error) {
			const refused = refusalIn(error);
			if (refused) throw refused;
			if (error instanceof FetchFailed) throw error;
			if (signal.aborted) {
				throw new FetchFailed('timeout', `no answer within ${timeoutMs} ms`, { cause: error });
			}
			throw new FetchFailed('network', (error as Error)?.message ?? 'network error', {
				cause: error
			});
		}
	}

	return Object.assign(safeFetch, { close: () => agent.close() });
}
