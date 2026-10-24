import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** argon2id, 19 MiB, t=2, p=1 (OWASP's first argon2id setting; plan P-T-0002). */
export const ARGON2_OPTIONS = {
	algorithm: 2 as Algorithm, // Algorithm.Argon2id; a const enum, which isolated modules cannot import
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
};

export const hashPassword = (password: string) => hash(password, ARGON2_OPTIONS);

export const verifyPassword = ({ hash: digest, password }: { hash: string; password: string }) =>
	verify(digest, password);
