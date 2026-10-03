/**
 * The public position. Bands should be findable without publishing the
 * street address of a room full of gear, so the pin the world sees is the
 * real one pushed up to `metres` in a random direction. Uniform inside the
 * disc, not the naive lat+rand which clusters at the centre.
 *
 * Server-only: nothing about the math is sensitive, there's just no
 * reason for the client to call it.
 */
export function jitter(lat: number, lng: number, metres = 700) {
	const ang = Math.random() * 2 * Math.PI;
	const rad = Math.sqrt(Math.random()) * metres;
	return {
		lat: +(lat + (rad * Math.cos(ang)) / 111_320).toFixed(6),
		lng: +(lng + (rad * Math.sin(ang)) / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(6),
	};
}
