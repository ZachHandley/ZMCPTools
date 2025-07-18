import type { APIRoute } from 'astro';
import { JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async () => {
  try {
    // TODO: Implement orchestration tracking
    // For now return empty array as placeholder
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get orchestrations:', error);
    return new Response(JSON.stringify({ error: 'Failed to get orchestrations' }), {
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