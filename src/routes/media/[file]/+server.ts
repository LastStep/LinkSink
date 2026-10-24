import { error } from '@sveltejs/kit';
import { serveMedia } from '#lib/server/fetch/images.ts';
import { mediaDir } from '#lib/server/fetch/paths.ts';
import type { RequestHandler } from './$types';

/** A cached preview image or site icon: WebP only, `nosniff`, for the signed-in person. */
export const GET: RequestHandler = ({ locals, params }) => {
	if (!locals.user) error(401, 'Sign in to see this.');
	return serveMedia(mediaDir(), params.file);
};
