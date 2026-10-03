/** exact > prefix > substring > subsequence. Shared by every combobox. */
export const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ς/g, 'σ')
		.toLowerCase()
		.trim();

export function score(keys: string[], q: string): number {
	let best = 0;
	for (const k of keys) {
		let s = 0;
		if (k === q) s = 1000;
		else if (k.startsWith(q)) s = 700 - Math.min(90, k.length - q.length);
		else if (k.includes(q)) s = 450 - Math.min(90, k.indexOf(q) * 6);
		else {
			let i = 0,
				first = -1,
				last = -1;
			for (let j = 0; j < k.length && i < q.length; j++)
				if (k[j] === q[i]) {
					if (first < 0) first = j;
					last = j;
					i++;
				}
			if (i === q.length) s = 200 - Math.min(150, last - first - q.length);
		}
		if (s > best) best = s;
	}
	return best;
}

export function highlight(text: string, q: string): [string, string, string] {
	if (!q) return [text, '', ''];
	const i = fold(text).indexOf(q);
	if (i < 0) return [text, '', ''];
	return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}
