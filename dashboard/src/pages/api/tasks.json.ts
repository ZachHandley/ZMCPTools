import type { APIRoute } from 'astro';
import { getObjectives, JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const repository = url.searchParams.get('repository');
    const status = url.searchParams.get('status');
    
    const objectives = await getObjectives(repository || '.', status || undefined);
    
    return new Response(JSON.stringify(objectives), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get objectives:', error);
    return new Response(JSON.stringify({ error: 'Failed to get objectives' }), {
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