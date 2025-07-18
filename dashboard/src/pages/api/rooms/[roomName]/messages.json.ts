import type { APIRoute } from 'astro';
import { getRoomMessages, JSON_HEADERS } from '../../../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ params, request }) => {
  const { roomName } = params;

  if (!roomName) {
    return new Response(JSON.stringify({ error: 'Room name is required' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  try {
    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const messages = await getRoomMessages(roomName, limit);
    
    return new Response(JSON.stringify(messages), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get room messages:', error);
    return new Response(JSON.stringify({ error: 'Failed to get room messages' }), {
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