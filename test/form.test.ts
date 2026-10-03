import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, picks, slugsOf } from '../src/lib/server/form.ts';

const form = (pairs: [string, string][]) => {
	const f = new FormData();
	for (const [k, v] of pairs) f.append(k, v);
	return f;
};

test('text trims, and a missing field reads the same as a blank one', () => {
	const f = form([
		['band_name', '  Rust Verdict  '],
		['blurb', '   '],
	]);
	assert.equal(text(f, 'band_name'), 'Rust Verdict');
	assert.equal(text(f, 'blurb'), '');
	assert.equal(text(f, 'never_sent'), '');
});

test('picks drops anything the server does not recognise', () => {
	const allowed = slugsOf([
		['drums', 'Drums'],
		['bass', 'Bass'],
	]);
	const f = form([
		['i', 'drums'],
		['i', 'kazoo'],
		['i', 'bass'],
		['i', ''],
	]);
	assert.deepEqual(picks(f, 'i', allowed), ['drums', 'bass']);
});

test('picks deduplicates: the same instrument twice is one instrument', () => {
	// The post form can show a slug in more than one place, and the ad's
	// instrument rows are inserted straight from this list.
	const allowed = slugsOf([['drums', 'Drums']]);
	const f = form([
		['i', 'drums'],
		['i', 'drums'],
		['i', 'drums'],
	]);
	assert.deepEqual(picks(f, 'i', allowed), ['drums']);
});

test('picks keeps the order the form sent them in', () => {
	const allowed = slugsOf([
		['a', 'A'],
		['b', 'B'],
		['c', 'C'],
	]);
	const f = form([
		['x', 'c'],
		['x', 'a'],
		['x', 'b'],
	]);
	assert.deepEqual(picks(f, 'x', allowed), ['c', 'a', 'b']);
});

test('slugsOf takes the slug half of a taxonomy table', () => {
	const set = slugsOf([
		['thrash', 'Thrash'],
		['punk', 'Punk'],
	]);
	assert.ok(set.has('thrash'));
	assert.ok(!set.has('Thrash'));
	assert.equal(set.size, 2);
});
