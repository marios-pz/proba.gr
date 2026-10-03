export type LatLng = { lat: number; lng: number };

/**
 * Great-circle distance in kilometres. Client-safe geo math (mirrors
 * server/geo.ts's server-only geo math): used only to rank ads against the
 * searching musician's own position, which never leaves the browser. See
 * $lib/position.svelte.ts.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLng = ((b.lng - a.lng) * Math.PI) / 180;
	const s1 = Math.sin(dLat / 2),
		s2 = Math.sin(dLng / 2);
	const t =
		s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
	return 2 * R * Math.asin(Math.sqrt(t));
}
