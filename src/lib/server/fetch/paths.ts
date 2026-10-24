import { dirname, join, resolve } from 'node:path';
import { DATABASE_PATH } from '$app/env/private';

/** The image cache: `media/` beside the database file (data/media with the default data/linksink.db). */
export function mediaDir(): string {
	return join(dirname(resolve(DATABASE_PATH)), 'media');
}
