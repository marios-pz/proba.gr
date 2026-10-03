// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Locals {}
		interface Error {
			message: string;
			/** Only set by hooks.server.ts's handleError, so +error.svelte can
			 *  tell a dead database apart from every other kind of failure.
			 *  Optional: a plain `error(status, 'message')` elsewhere in the
			 *  app (a normal 400/404) never sets it, and shouldn't have to. */
			dbDown?: boolean;
		}
		interface PageData {
			/** Link-preview text for a shared ad, read by +layout.svelte's og tags. */
			share?: { id: string; kind: string; title: string; description: string };
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
