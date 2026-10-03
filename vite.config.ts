import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 0.0.0.0 so the dev server is reachable from another device on the LAN
// (a phone, for checking mobile layout) without passing --host by hand.
// Port 3000 to match production (docker-compose.yml, the Dockerfile's
// EXPOSE), so "the port" means the same thing in dev and prod.
//
// The allowed dev hostname comes from ORIGIN in .env (loaded by
// `--env-file-if-exists=.env` in package.json's scripts, so it's already
// in process.env by the time this file runs) rather than being hardcoded
// here too: one value, not three copies to keep in sync. Without the
// host in allowedHosts, Vite's DNS-rebinding protection 403s any request
// whose Host header it doesn't recognize. `.test`, not `.app`: `.app` is
// HSTS preloaded into every major browser at the TLD level, so it refuses
// plain HTTP permanently, with no setting to turn that off, which cost real
// time to track down once. `.test` is IANA-reserved for exactly this and
// carries no such baggage.
const devHost = (() => {
	try {
		return new URL(process.env.ORIGIN ?? '').hostname || undefined;
	} catch {
		return undefined;
	}
})();

export default defineConfig({
	plugins: [sveltekit()],
	server: { host: '0.0.0.0', port: 3000, allowedHosts: devHost ? [devHost] : undefined },
	preview: { host: '0.0.0.0', port: 3000, allowedHosts: devHost ? [devHost] : undefined },
});
