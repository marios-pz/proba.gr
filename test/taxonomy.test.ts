import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	INSTRUMENTS,
	GENRES,
	COMMITMENTS,
	SOCIAL_KINDS,
	AD_KINDS,
	REPORT_REASONS,
	INSTRUMENT_CATEGORIES,
	instrumentArt,
	LABEL,
} from '../src/lib/taxonomy.ts';

const TABLES = { INSTRUMENTS, GENRES, COMMITMENTS, SOCIAL_KINDS, AD_KINDS, REPORT_REASONS };
const STATIC = fileURLToPath(new URL('../static', import.meta.url));

test('slugs are kebab-case and unique inside every table', () => {
	for (const [name, table] of Object.entries(TABLES)) {
		const slugs = table.map(([slug]) => slug);
		assert.equal(new Set(slugs).size, slugs.length, `${name} has a duplicate slug`);
		for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: ${slug}`);
	}
});

test('LABEL can name everything the UI renders', () => {
	for (const [name, table] of Object.entries(TABLES))
		for (const [slug, label] of table) assert.equal(LABEL[slug], label, `${name}: ${slug}`);
});

test('every instrument sits in exactly one family', () => {
	// The post form picks by family. A slug in none of them is unpostable;
	// a slug in two shows up twice with two separate tick boxes.
	for (const [slug] of INSTRUMENTS) {
		const families = INSTRUMENT_CATEGORIES.filter(([, , ids]) =>
			(ids as readonly string[]).includes(slug),
		);
		assert.equal(families.length, 1, `${slug} is in ${families.length} families`);
	}
});

test('no family lists an instrument that does not exist', () => {
	const known = new Set(INSTRUMENTS.map(([slug]) => slug));
	for (const [cat, , ids] of INSTRUMENT_CATEGORIES)
		for (const id of ids) assert.ok(known.has(id), `${cat} lists unknown ${id}`);
});

test('every instrument has its artwork on disk', () => {
	for (const [slug] of INSTRUMENTS) {
		const file = `${STATIC}${instrumentArt(slug)}`;
		assert.ok(existsSync(file), `missing artwork for ${slug}: ${file}`);
	}
});
