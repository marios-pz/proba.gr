/**
 * Form actions are the whole write API (see API.md), so every one of them
 * starts by pulling trimmed strings out of a FormData. These are that, in
 * one place, rather than `String(f.get('x') ?? '').trim()` spelled out a
 * dozen times per action.
 */

/** One trimmed field. Missing and empty are the same thing here: a form
 *  that omits a field and a form that submits it blank both mean "unset". */
export const text = (f: FormData, name: string) => String(f.get(name) ?? '').trim();

/** A repeated field, narrowed to values the server actually recognises.
 *  Anything else a client invents is dropped silently rather than rejected:
 *  these are checkbox-style inputs, and there is no useful error to show.
 *  Deduplicated: the post form can offer the same slug in two pickers, and
 *  one instrument twice is one instrument. */
export const picks = (f: FormData, name: string, allowed: ReadonlySet<string>) =>
	[...new Set(f.getAll(name).map(String))].filter((v) => allowed.has(v));

/** The slug half of a taxonomy table, as a lookup set for `picks` and for
 *  validating single-value fields. */
export const slugsOf = (table: readonly (readonly [string, string])[]) =>
	new Set(table.map(([slug]) => slug));
