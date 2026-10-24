import type { PageServerLoad } from './$types';

// The links themselves come through the store (src/lib/store/), not from here.
export const load: PageServerLoad = ({ url }) => ({ q: url.searchParams.get('q')?.trim() ?? '' });
