import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm } from '../src/lib/geo.ts';
import { jitter } from '../src/lib/server/geo.ts';

const ATHENS = { lat: 37.9838, lng: 23.7275 };
const THESSALONIKI = { lat: 40.6401, lng: 22.9444 };

test('haversineKm matches a known distance', () => {
	const km = haversineKm(ATHENS, THESSALONIKI);
	assert.ok(Math.abs(km - 302) < 5, `Athens to Thessaloniki came out ${km}km`);
	assert.equal(haversineKm(ATHENS, ATHENS), 0);
	assert.equal(haversineKm(ATHENS, THESSALONIKI), haversineKm(THESSALONIKI, ATHENS));
});

test('jitter never moves a pin further than the radius it is given', () => {
	for (let i = 0; i < 2000; i++) {
		const p = jitter(ATHENS.lat, ATHENS.lng, 700);
		const metres = haversineKm(ATHENS, p) * 1000;
		// 1m of slack: the result is rounded to six decimals, ~0.11m.
		assert.ok(metres <= 701, `moved ${metres}m, past the 700m radius`);
	}
});

test('jitter spreads over the disc instead of clustering in the middle', () => {
	// Uniform over a disc puts half the points outside r/sqrt(2). A naive
	// lat+rand, lng+rand would fail this: it piles up near the real address.
	const half = 700 / Math.SQRT2;
	let outer = 0;
	const n = 3000;
	for (let i = 0; i < n; i++) {
		const p = jitter(ATHENS.lat, ATHENS.lng, 700);
		if (haversineKm(ATHENS, p) * 1000 > half) outer++;
	}
	assert.ok(Math.abs(outer / n - 0.5) < 0.05, `${outer}/${n} landed in the outer half`);
});

test('jitter keeps the real position out of the output', () => {
	const p = jitter(ATHENS.lat, ATHENS.lng, 700);
	assert.notEqual(`${p.lat},${p.lng}`, `${ATHENS.lat},${ATHENS.lng}`);
	assert.equal(p.lat, +p.lat.toFixed(6));
	assert.equal(p.lng, +p.lng.toFixed(6));
});
