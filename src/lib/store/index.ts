// The one way the screens read and write links (plan P-T-0002, step 4). Today it talks to the JSON API; T-0010
// swaps in a local-first implementation behind the same interface, without touching the screens.
import { createApiStore } from './api.ts';
import type { LinkStore } from './types.ts';

export * from './types.ts';

/** The app's store. */
export const store: LinkStore = createApiStore(undefined, { watchLibrary: true });
