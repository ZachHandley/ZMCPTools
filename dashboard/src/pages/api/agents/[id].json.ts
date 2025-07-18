import type { APIRoute } from 'astro';
import { getAgent, JSON_HEADERS } from '../../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Agent ID is required' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  try {
    const agent = await getAgent(id);
    
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: JSON_HEADERS
      });
    }
    
    return new Response(JSON.stringify(agent), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get agent:', error);
    return new Response(JSON.stringify({ error: 'Failed to get agent' }), {
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