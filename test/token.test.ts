import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintToken, hashToken, tokenMatches, publicId, hashIp } from '../src/lib/server/token.ts';

test('a minted token is 20 bytes of Crockford-ish text in groups of four', () => {
	const t = mintToken();
	assert.match(t, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
	// I, L, O and U are left out so nobody reads a token back wrong.
	assert.ok(!/[ILOU]/.test(t));
});

test('tokens do not repeat', () => {
	const seen = new Set(Array.from({ length: 500 }, () => mintToken()));
	assert.equal(seen.size, 500);
});

test('a token is matched however the band retypes it', () => {
	const t = mintToken();
	const stored = hashToken(t);
	assert.ok(tokenMatches(`  ${t.toLowerCase()}  `, stored));
	assert.ok(!tokenMatches(mintToken(), stored));
});

test('tokenMatches survives a stored value of the wrong length', () => {
	assert.equal(tokenMatches(mintToken(), Buffer.alloc(8)), false);
});

test('hashToken stores a hash, never the token', () => {
	const t = mintToken();
	const h = hashToken(t);
	assert.equal(h.length, 32);
	assert.ok(!h.toString('latin1').includes(t));
});

test('public ids are short, lowercase and unambiguous', () => {
	const ids = Array.from({ length: 500 }, () => publicId());
	for (const id of ids) assert.match(id, /^[a-hj-km-np-z2-9]{6}$/);
	assert.equal(new Set(ids).size, 500);
});

test('hashing an IP is stable per salt and changes when the salt rotates', () => {
	const a = hashIp('203.0.113.7', 'salt-one');
	assert.deepEqual(a, hashIp('203.0.113.7', 'salt-one'));
	assert.notDeepEqual(a, hashIp('203.0.113.7', 'salt-two'));
	assert.notDeepEqual(a, hashIp('203.0.113.8', 'salt-one'));
});
