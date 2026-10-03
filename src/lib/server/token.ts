import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford-ish: no I, L, O, U
const IDALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Shown to the band exactly once. Only its hash is ever stored. */
export function mintToken(): string {
	return [...randomBytes(20)]
		.map((b) => ALPHA[b & 31])
		.join('')
		.replace(/(.{4})/g, '$1-')
		.replace(/-$/, '');
}

export function hashToken(token: string): Buffer {
	return createHash('sha256').update(token.trim().toUpperCase()).digest();
}

export function publicId(): string {
	return [...randomBytes(6)].map((b) => IDALPHA[b % IDALPHA.length]).join('');
}

export function tokenMatches(token: string, stored: Buffer): boolean {
	const a = hashToken(token);
	return a.length === stored.length && timingSafeEqual(a, stored);
}

/** IPs are never stored raw, only keyed. Rotating IP_SALT invalidates them. */
export function hashIp(ip: string, salt: string): Buffer {
	return createHash('sha256').update(`${salt}:${ip}`).digest();
}
