import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// one artefact, one process: `npm run build` then `npm start`
		adapter: adapter({ out: 'build' }),
	},
};
