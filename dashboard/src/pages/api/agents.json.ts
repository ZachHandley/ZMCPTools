import type { APIRoute } from 'astro';
import { getAgents, JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const repository = url.searchParams.get('repository');
    const status = url.searchParams.get('status');
    
    const agents = await getAgents(
      repository || undefined,
      status || undefined
    );
    
    return new Response(JSON.stringify(agents), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get agents:', error);
    return new Response(JSON.stringify({ error: 'Failed to get agents' }), {
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