import type { APIRoute } from 'astro';
import { getRooms, JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const repository = url.searchParams.get('repository');
    
    const enhancedRooms = await getRooms(repository || undefined);
    
    return new Response(JSON.stringify(enhancedRooms), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get rooms:', error);
    return new Response(JSON.stringify({ error: 'Failed to get rooms' }), {
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