import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID: 48 bits of millisecond time and 80 random bits, Crockford base32, 26 characters, sortable by time. */
export function ulid(now = Date.now()): string {
	let time = '';
	let t = now;
	for (let i = 0; i < 10; i++) {
		time = ALPHABET[t % 32] + time;
		t = Math.floor(t / 32);
	}
	const bytes = randomBytes(16);
	let rand = '';
	for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i] % 32];
	return time + rand;
}
