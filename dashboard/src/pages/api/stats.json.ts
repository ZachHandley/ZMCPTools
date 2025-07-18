import type { APIRoute } from 'astro';
import { getSystemStats, JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async () => {
  try {
    const stats = await getSystemStats();
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    return new Response(JSON.stringify({ error: 'Failed to get system stats' }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: JSON_HEADERS
  });
};