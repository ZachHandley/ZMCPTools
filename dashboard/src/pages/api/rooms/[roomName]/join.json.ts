import type { APIRoute } from 'astro';
import { joinRoom, JSON_HEADERS } from '../../../../utils/simpleDatabase.js';

export const POST: APIRoute = async ({ params, request }) => {
  const { roomName } = params;

  if (!roomName) {
    return new Response(JSON.stringify({ error: 'Room name is required' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  try {
    // Parse request body
    const body = await request.json();
    const { agentName } = body;

    if (!agentName) {
      return new Response(JSON.stringify({ error: 'Agent name is required' }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    await joinRoom(roomName, agentName);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to join room:', error);
    return new Response(JSON.stringify({ error: 'Failed to join room' }), {
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