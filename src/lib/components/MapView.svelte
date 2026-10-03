<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { onMount, untrack } from 'svelte';
	import { position } from '$lib/position.svelte';
	import type * as Leaflet from 'leaflet';
	import type { Bounds, LatLng } from '$lib/types';

	type Pin = LatLng & { id: string; label: string; paid?: boolean };
	let {
		pins = [],
		selected = $bindable(null),
		hot = null,
		pickable = false,
		onpick,
		picked = null,
		minZoom = 0,
		onzoomgate,
		onbounds,
		meCoords = null,
		locateTick = 0,
	}: {
		pins?: Pin[];
		selected?: string | null;
		hot?: string | null;
		pickable?: boolean;
		onpick?: (p: LatLng) => void;
		// A pin already placed (a restored draft, an ad being edited): drawn
		// and centred on when the map opens, instead of a blank world map.
		picked?: LatLng | null;
		// Below this zoom level, pins hide and onzoomgate(true) fires. The
		// caller (the results list) mirrors that state so "no results" means
		// the same thing on the map and in the list, not just one of them.
		// 0 disables the gate entirely (the /post pin-drop map never sets it).
		minZoom?: number;
		onzoomgate?: (gated: boolean) => void;
		// Fires with the current viewport on every pan/zoom (and once after
		// any programmatic frame()), so the caller can filter its list to
		// "what's visible right now" the way Airbnb's results follow the
		// map. This component only reports the viewport, it never filters
		// `pins` itself (Leaflet already only draws what's on-screen).
		onbounds?: (b: Bounds) => void;
		// The "Search Near Me" button's target: incrementing locateTick (a click)
		// drops a marker at meCoords and flies there. meCoords alone never
		// triggers this: geolocation already resolves silently on mount to
		// feed the ranking distance term, and that must never itself yank
		// the map away from what the musician is actually looking at.
		meCoords?: LatLng | null;
		locateTick?: number;
	} = $props();

	// Leaflet's Map instance is a stateful class the library mutates
	// internally; wrapping it in $state would fight Svelte's proxy, so it
	// stays a plain variable and `ready` is the reactive signal that it
	// exists. Same reasoning for the layer handles below.
	let el: HTMLDivElement;
	let ready = $state(false);
	let zoomGated = $state(false);
	let L: typeof Leaflet;
	let map: Leaflet.Map;
	let pinLayer: Leaflet.LayerGroup;
	let dropLayer: Leaflet.LayerGroup;
	let meLayer: Leaflet.LayerGroup;

	const WORLD_CENTER: [number, number] = [20, 10];
	const WORLD_ZOOM = 2;
	const LOCAL_ZOOM = 11;
	const FIT_MAX_ZOOM = 12;
	const FIT_PADDING: [number, number] = [40, 40];

	const pinBounds = () => L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));

	// Which ads are on the map, independent of their order. Re-ranking
	// hands this component a brand new array holding the same ads, so
	// keying the framing effect on `pins` itself re-fitted the map every
	// time a filter changed. Sorted, so a reorder alone is not a change.
	const pinSetKey = $derived(
		pins
			.map((p) => p.id)
			.sort()
			.join(','),
	);

	// Frames on the pins themselves when there are any (real tiles already
	// carry enough geographic context that a drawn region outline on top
	// of them would be redundant); otherwise centers on the searching
	// musician's own position if they've granted it, or a generic world
	// view if not, with no per-country data involved either way.
	function frame() {
		if (pickable && picked) {
			map.setView([picked.lat, picked.lng], LOCAL_ZOOM);
		} else if (pins.length) {
			map.fitBounds(pinBounds(), { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM });
		} else {
			const p = position.coords;
			map.setView(p ? [p.lat, p.lng] : WORLD_CENTER, p ? LOCAL_ZOOM : WORLD_ZOOM);
		}
	}

	// A genuinely empty country still shows its normal empty state rather
	// than a misleading "zoom in" prompt, hence the `pins.length` guard.
	// Reads and writes `zoomGated`, so calling this from inside the pin
	// $effect below (a tracked context) would register `zoomGated` as one
	// of that effect's own dependencies, and the effect then re-runs whenever
	// the gate flips, re-fitting bounds via frame() and undoing the very
	// zoom-out that triggered the gate. untrack() at the call site (not
	// here, the read/write themselves are the point) keeps that reaction
	// out of the effect's dependency list; the native 'zoomend' listener
	// calls this outside any tracked context, so it needs no such wrapping.
	//
	// The floor is minZoom OR the zoom at which every pin fits, whichever is
	// lower. Ads spread across a whole country fit at a zoom below minZoom,
	// so a fixed floor made the ALL button hide every pin it had just
	// framed: fitBounds landed at zoom 7, the gate fired at 8, and the list
	// emptied itself. Whatever "fit all pins" produces is by definition a
	// view worth showing, so the gate can never fire there.
	function applyGate() {
		const floor = pins.length
			? Math.min(minZoom, map.getBoundsZoom(pinBounds(), false, L.point(FIT_PADDING)), FIT_MAX_ZOOM)
			: minZoom;
		const should = minZoom > 0 && pins.length > 0 && map.getZoom() < floor;
		if (should === zoomGated) return;
		zoomGated = should;
		onzoomgate?.(should);
		if (should) pinLayer.removeFrom(map);
		else pinLayer.addTo(map);
	}

	function reportBounds() {
		const b = map.getBounds();
		onbounds?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
	}

	onMount(() => {
		let disposed = false;
		position.request();
		(async () => {
			const mod = await import('leaflet');
			if (disposed) return;
			L = mod.default ?? (mod as any);

			map = L.map(el, { zoomControl: false, attributionControl: true });
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 19,
			}).addTo(map);

			pinLayer = L.layerGroup().addTo(map);
			dropLayer = L.layerGroup().addTo(map);
			meLayer = L.layerGroup().addTo(map);
			frame();
			if (pickable && picked) dropDot(dropLayer, picked, 'lf-drop');
			map.on('zoomend', applyGate);
			map.on('moveend', reportBounds);

			map.on('click', (e: Leaflet.LeafletMouseEvent) => {
				if (pickable) {
					dropDot(dropLayer, e.latlng, 'lf-drop');
					onpick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
				} else {
					// A click that landed on a pin never reaches here: its own
					// handler below stops propagation before this fires.
					selected = null;
				}
			});

			ready = true;
			applyGate();
			reportBounds();
		})();
		return () => {
			disposed = true;
			map?.remove();
		};
	});

	// The pin-drop crosshair on /post and the "you are here" dot are the
	// same three concentric circles; only the colour differs, so they share
	// one icon and one block of CSS, keyed by class.
	function dropDot(
		layer: Leaflet.LayerGroup,
		at: LatLng | Leaflet.LatLng,
		cls: 'lf-drop' | 'lf-me',
	) {
		layer.clearLayers();
		L.marker(at, {
			icon: L.divIcon({
				className: 'lf-dot-wrap',
				html: `<div class="lf-dot ${cls}"><span class="halo"></span><span class="ring"></span><span class="core"></span></div>`,
				iconSize: [52, 52],
				iconAnchor: [26, 26],
			}),
		}).addTo(layer);
	}

	// The label is a band name now, which is whatever the poster typed, and
	// it goes into an innerHTML string below.
	const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

	function pinIcon(p: Pin, isOn: boolean, isHot: boolean) {
		const w = Math.max(34, p.label.length * 5.8 + 11);
		const cls = ['lf-pin', isOn && 'on', isHot && 'hot', p.paid && 'paid']
			.filter(Boolean)
			.join(' ');
		return L.divIcon({
			className: 'lf-pin-wrap',
			html: `<div class="${cls}" style="width:${w}px">
				<span class="lf-pin-label">${esc(p.label)}</span>
				<span class="lf-pin-stem"></span><span class="lf-pin-dot"></span>
			</div>`,
			iconSize: [w, 24],
			iconAnchor: [w / 2, 22],
		});
	}

	// Marker redraw only. This depends on `selected` and `hot` because the
	// icon encodes both, so it must never move the map: framing from in
	// here meant every card click and every card hover re-fitted the view
	// to all pins, which looked like "clicking an ad zooms back out".
	$effect(() => {
		if (!ready) return;
		pinLayer.clearLayers();
		for (const p of pins) {
			const marker = L.marker([p.lat, p.lng], {
				icon: pinIcon(p, selected === p.id, hot === p.id),
			});
			marker.on('click', (e) => {
				L.DomEvent.stopPropagation(e);
				selected = selected === p.id ? null : p.id;
			});
			marker.addTo(pinLayer);
		}
		untrack(applyGate);
	});

	// Framing, keyed on which ads are shown rather than on the array. A
	// country switch or the Gigs/Recruit toggle re-frames; reordering,
	// hovering and selecting do not.
	$effect(() => {
		pinSetKey;
		if (!ready) return;
		untrack(() => {
			frame();
			applyGate();
			reportBounds();
		});
	});

	// Selecting an ad flies to its pin. Never zooms out: if the musician
	// is already closer in than LOCAL_ZOOM, the zoom is left alone and
	// this only pans. Deselecting leaves the map exactly where it is.
	$effect(() => {
		const id = selected;
		if (!ready || !id) return;
		untrack(() => {
			const p = pins.find((x) => x.id === id);
			if (p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), LOCAL_ZOOM), { duration: 0.6 });
		});
	});

	// Keyed on locateTick alone (not meCoords) so this only ever fires from
	// an actual "Search Near Me" click, never from geolocation quietly resolving
	// in the background for the ranking distance term.
	$effect(() => {
		if (locateTick === 0 || !map) return;
		const p = untrack(() => meCoords);
		if (!p) return;
		dropDot(meLayer, p, 'lf-me');
		map.setView([p.lat, p.lng], LOCAL_ZOOM);
	});

	const zoom = (delta: number) => map?.setZoom(map.getZoom() + delta);
</script>

<div class="wrap">
	<div
		bind:this={el}
		class="map"
		class:pick={pickable}
		role="group"
		aria-label={pickable ? 'Click to place your rehearsal room' : 'Map of ads'}
	></div>

	<div class="zoom">
		<button type="button" onclick={() => zoom(1)} aria-label="Zoom in">+</button>
		<button type="button" onclick={() => zoom(-1)} aria-label="Zoom out">&minus;</button>
		<button type="button" class="rs" aria-label="Fit all pins" onclick={frame}>ALL</button>
	</div>
	{#if pickable}
		<div class="coords">click the map to place it</div>
	{:else if zoomGated}
		<div class="coords zoomgate">zoom in to see ads here</div>
	{/if}
</div>

<style>
	/* No border: the map panel around this is already the frame, and a
	   bordered map inside a bordered panel is a box in a box.
	   transform: translateZ(0) promotes it onto its own compositing layer,
	   so the overflow clip is computed once against a static layer rather
	   than re-tested every frame against the moving tiles underneath;
	   without it, panning inside a clipped container is a common source of
	   mobile/WebView jank. */
	.wrap {
		position: relative;
		border: 0;
		background: var(--sea);
		overflow: hidden;
		transform: translateZ(0);
	}
	.map {
		width: 100%;
		height: 440px;
		background: var(--sea);
	}
	.map.pick {
		height: 320px;
		cursor: crosshair;
	}
	@media (max-width: 820px) {
		.map {
			height: 300px;
		}
		/* A thumb needs more room to place a pin accurately than a mouse
		   does, so the picker gets taller on a phone, not shorter. */
		.map.pick {
			height: 360px;
		}
	}

	.zoom {
		position: absolute;
		right: 8px;
		top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 400;
	}
	.zoom button {
		font: inherit;
		width: 34px;
		height: 34px;
		background: #050805d9;
		color: var(--ink);
		border: 0;
		box-shadow: inset 0 1px 0 rgba(61, 92, 48, 0.7);
		cursor: pointer;
		font-size: 15px;
		line-height: 1;
		padding: 0;
	}
	.zoom button:hover {
		color: var(--marker);
		background: #0d1a0fe6;
	}
	.zoom .rs {
		font-size: 9px;
	}
	@media (max-width: 820px) {
		.zoom {
			gap: 8px;
		}
		.zoom button {
			width: 38px;
			height: 38px;
			font-size: 17px;
		}
		.zoom .rs {
			font-size: 9.5px;
		}
	}
	/* Above Leaflet's attribution strip, which owns the bottom-right and is
	   about 18px tall. */
	.coords {
		position: absolute;
		left: 8px;
		bottom: 24px;
		font-size: 10.5px;
		letter-spacing: 0.1em;
		color: var(--dim);
		background: #050805cc;
		padding: 4px 7px;
		pointer-events: none;
		z-index: 400;
	}
	.coords.zoomgate {
		color: var(--marker);
		text-transform: uppercase;
	}

	/* Leaflet renders these into the map's own panes, outside Svelte's
	   template, so they can't be component-scoped; :global it is. */
	:global(.leaflet-container) {
		background: var(--sea);
		font-family: var(--mono);
	}
	/* OSM's own tiles are keyless but render light-only; invert+rotate
	   turns them dark without needing a dark-specific tile source. Filtering
	   the whole tile pane once (rather than each tile img individually, via
	   the tileLayer className option this used to be) is the difference
	   between one filtered GPU layer and a dozen+ redrawn on every frame of
	   a pan, and the latter is a well-known source of mobile drag jitter. */
	:global(.leaflet-tile-pane) {
		/* invert+rotate turns the light tiles dark; the sepia/hue-rotate pair
		   after it drags the whole map into the same moss the rest of the UI
		   sits in, so it stops reading as a grey widget bolted onto a green page. */
		filter: invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.86) sepia(0.5)
			hue-rotate(58deg) saturate(0.7);
		will-change: transform;
	}
	:global(.leaflet-control-attribution) {
		background: #05080599;
		color: var(--dim);
		font-size: 9.5px;
	}
	:global(.leaflet-control-attribution a) {
		color: var(--dim);
	}

	:global(.lf-pin-wrap),
	:global(.lf-dot-wrap) {
		pointer-events: none;
	}
	:global(.lf-pin) {
		position: relative;
		height: 15px;
		cursor: pointer;
		pointer-events: auto;
		background: #070d08ee;
		border: 1px solid var(--moss);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	:global(.lf-pin-label) {
		font-family: var(--mono);
		font-size: 8.5px;
		font-weight: 700;
		color: var(--ink);
		letter-spacing: 0.04em;
	}
	:global(.lf-pin-stem) {
		position: absolute;
		left: 50%;
		top: 100%;
		width: 1px;
		height: 6px;
		background: var(--ink);
	}
	:global(.lf-pin-dot) {
		position: absolute;
		left: 50%;
		top: calc(100% + 5px);
		width: 3.8px;
		height: 3.8px;
		margin-left: -1.9px;
		border-radius: 50%;
		background: var(--ink);
		border: 0.8px solid #050805;
	}
	:global(.lf-pin.hot) {
		background: #16221a;
	}
	:global(.lf-pin.on) {
		background: var(--marker);
		border-color: var(--marker);
	}
	:global(.lf-pin.on .lf-pin-label) {
		color: #060806;
	}
	:global(.lf-pin.on .lf-pin-stem),
	:global(.lf-pin.on .lf-pin-dot) {
		background: var(--marker);
	}
	:global(.lf-pin.paid) {
		border-color: var(--stamp);
	}

	/* One dot, two colours: the pin-drop crosshair on /post (marker yellow)
	   and "you are here" from the Search Near Me button (stamp red, matching its
	   own button). --dot is the only thing that differs between them. */
	:global(.lf-dot) {
		position: relative;
		width: 100%;
		height: 100%;
	}
	:global(.lf-drop) {
		--dot: var(--marker);
	}
	:global(.lf-me) {
		--dot: var(--stamp);
	}
	:global(.lf-dot .ring) {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 18px;
		height: 18px;
		margin: -9px 0 0 -9px;
		border-radius: 50%;
		border: 1.4px solid var(--dot);
	}
	:global(.lf-dot .core) {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 4.8px;
		height: 4.8px;
		margin: -2.4px 0 0 -2.4px;
		border-radius: 50%;
		background: var(--dot);
	}
	:global(.lf-dot .halo) {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 52px;
		height: 52px;
		margin: -26px 0 0 -26px;
		border-radius: 50%;
		background: var(--dot);
		opacity: 0.13;
	}
</style>
