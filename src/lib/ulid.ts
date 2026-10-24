const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID's shape: 26 characters of Crockford base32. */
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * A ULID: 48 bits of millisecond time and 80 random bits, Crockford base32, 26 characters, sortable by time. Runs in
 * the browser and on the server (Web Crypto), so a device can make its own ids (plan P-T-0002, data model).
 */
export function ulid(now = Date.now()): string {
	let time = '';
	let t = now;
	for (let i = 0; i < 10; i++) {
		time = ALPHABET[t % 32] + time;
		t = Math.floor(t / 32);
	}
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let rand = '';
	for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i] % 32];
	return time + rand;
}
