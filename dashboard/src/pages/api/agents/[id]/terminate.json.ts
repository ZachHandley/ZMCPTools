import type { APIRoute } from 'astro';
import { terminateAgent, JSON_HEADERS } from '../../../../utils/simpleDatabase.js';

export const POST: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Agent ID is required' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  try {
    await terminateAgent(id);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to terminate agent:', error);
    return new Response(JSON.stringify({ error: 'Failed to terminate agent' }), {
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