import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, score, highlight } from '../src/lib/fuzzy.ts';

test('fold makes Greek and accents searchable with a plain keyboard', () => {
	assert.equal(fold('  Ωμέγα '), 'ωμεγα');
	// Final sigma folds to the medial one, or "ΒΟΡΙΑΣ" never matches "βοριασ".
	assert.equal(fold('Βοριάς'), fold('Βοριασ'));
	assert.equal(fold('Café'), 'cafe');
});

test('score ranks exact over prefix over substring over subsequence', () => {
	const exact = score(['drums'], 'drums');
	const prefix = score(['drummer'], 'drum');
	const substring = score(['lead-guitar'], 'guitar');
	const subseq = score(['rhythm-guitar'], 'rgtr');
	assert.ok(exact > prefix, `${exact} > ${prefix}`);
	assert.ok(prefix > substring, `${prefix} > ${substring}`);
	assert.ok(substring > subseq, `${substring} > ${subseq}`);
	assert.equal(score(['drums'], 'xyz'), 0);
});

test('score takes the best of the keys it is given', () => {
	assert.equal(score(['hellas', 'greece', 'gr'], 'greece'), score(['greece'], 'greece'));
});

test('highlight splits around the match and leaves the original case alone', () => {
	assert.deepEqual(highlight('Black metal', 'metal'), ['Black ', 'metal', '']);
	assert.deepEqual(highlight('Doom', 'zz'), ['Doom', '', '']);
	assert.deepEqual(highlight('Doom', ''), ['Doom', '', '']);
});
