import type { PageServerLoad } from './$types';
import { siteStats } from '$lib/server/queries';

export const load: PageServerLoad = async () => ({ stats: await siteStats() });
