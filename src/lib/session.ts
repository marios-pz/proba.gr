/**
 * Session-scoped draft storage, shared by the board's filters and the
 * half-written ad on /post.
 *
 * sessionStorage, never localStorage, on purpose: a stray refresh should
 * not throw real work away, but a filter chosen last week has no business
 * resurfacing, and neither does an abandoned draft.
 *
 * Every access is wrapped, because private mode and blocked site data make
 * these throw rather than return null. A lost draft is never worth an
 * error, so all three degrade to doing nothing.
 */

export const DRAFT = {
	filters: 'proba:filters',
	post: 'proba:post-draft',
} as const;

export function readDraft<T>(key: string): Partial<T> | null {
	try {
		const raw = sessionStorage.getItem(key);
		return raw ? (JSON.parse(raw) as Partial<T>) : null;
	} catch {
		return null;
	}
}

export function writeDraft(key: string, value: unknown): void {
	try {
		sessionStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* private mode, blocked storage, quota */
	}
}

export function clearDraft(key: string): void {
	try {
		sessionStorage.removeItem(key);
	} catch {
		/* as above */
	}
}

/** Restoring a saved array has to survive a hand-edited or stale entry, so
 *  anything that is not actually an array of strings becomes empty. */
export const strings = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
