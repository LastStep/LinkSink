// The body limit every route but the import keeps (T-0012). adapter-node's BODY_SIZE_LIMIT is raised to 21M so an
// import file of up to 20 MB arrives; every other route is held to adapter-node's default of 512 KB here, whether
// the request names its length (Content-Length) or streams it (chunked).

export const BODY_MAX = 512 * 1024;
const LARGE_BODY_ROUTES = ['/api/import'];

/**
 * Null when the request may go on; a 413 when its body is over the route's limit. A body without a stated length is
 * read from a copy (`clone()`), at most BODY_MAX bytes and one chunk, so the route still reads the original.
 */
export async function bodyTooLarge(request: Request, pathname: string): Promise<Response | null> {
	if (LARGE_BODY_ROUTES.includes(pathname) || !request.body) return null;
	const tooLarge = () => new Response('Payload Too Large', { status: 413 });
	const stated = request.headers.get('content-length');
	if (stated !== null && /^\d+$/.test(stated.trim())) {
		// A stated length is held to by the server's own reader, which refuses a body longer than it says.
		return Number(stated) > BODY_MAX ? tooLarge() : null;
	}
	const reader = request.clone().body!.getReader();
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return null;
		size += value.byteLength;
		if (size > BODY_MAX) {
			// Not awaited: cancelling one branch of a teed stream settles only once the other is cancelled too.
			reader.cancel().catch(() => {});
			return tooLarge();
		}
	}
}
