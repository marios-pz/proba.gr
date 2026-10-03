import { Capacitor } from '@capacitor/core';

/**
 * One shared, one-shot geolocation request. MapView (to center/frame the
 * map) and the results ranking (to score by distance) both read from this
 * instead of each independently prompting for permission.
 *
 * Coordinates live only in memory: never sent to the server, never put in
 * a URL. If the musician denies or the platform has no geolocation, every
 * reader just sees `coords: null` and degrades gracefully. Nothing here
 * is required for the board to work.
 *
 * Inside the Capacitor shell this goes through @capacitor/geolocation
 * instead of the plain web API: a WebView doesn't reliably surface the
 * native OS permission prompt for `navigator.geolocation` on its own, so
 * the plugin bridges that properly. Browser visitors are unaffected:
 * `Capacitor.isNativePlatform()` is false there and this falls straight
 * through to the same web API as before.
 */
let coords = $state<{ lat: number; lng: number } | null>(null);
let status = $state<'idle' | 'pending' | 'granted' | 'denied'>('idle');

async function request() {
	if (status !== 'idle') return;
	status = 'pending';

	if (Capacitor.isNativePlatform()) {
		try {
			const { Geolocation } = await import('@capacitor/geolocation');
			const p = await Geolocation.getCurrentPosition({ maximumAge: 5 * 60_000, timeout: 8000 });
			coords = { lat: p.coords.latitude, lng: p.coords.longitude };
			status = 'granted';
		} catch {
			status = 'denied';
		}
		return;
	}

	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		status = 'denied';
		return;
	}
	navigator.geolocation.getCurrentPosition(
		(p) => {
			coords = { lat: p.coords.latitude, lng: p.coords.longitude };
			status = 'granted';
		},
		() => {
			status = 'denied';
		},
		{ maximumAge: 5 * 60_000, timeout: 8000 },
	);
}

export const position = {
	get coords() {
		return coords;
	},
	get status() {
		return status;
	},
	request,
};
