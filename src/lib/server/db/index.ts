import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

/**
 * Lazy singleton. The build step imports every server module to analyse
 * routes, so connecting at module load would make `npm run build` require a
 * live database. It should not: building is not deploying.
 *
 * By the time a request actually touches this, bootstrap.js has already run
 * and proved the schema is current, or the process never started.
 */
let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
	if (_db) return _db;
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	// Neon bills compute while any connection is open, and its own
	// autosuspend only starts counting once the last one closes. postgres.js
	// defaults to no idle_timeout, so a pool left at that default holds a
	// connection open forever after the first query, keeping Neon's compute
	// awake around the clock. idle_timeout here closes it 10s after the last
	// query, so a quiet site actually costs nothing, and the next request
	// just opens a fresh one.
	_db = drizzle(postgres(env.DATABASE_URL, { max: 10, idle_timeout: 10 }), { schema });
	return _db;
}

/** Convenience proxy, so callers can write `db.execute(...)` as usual. */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
	get: (_, prop) => Reflect.get(getDb() as object, prop, getDb()),
});

export { schema };
