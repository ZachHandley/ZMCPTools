import type { APIRoute } from 'astro';
import { getProjects, JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async () => {
  try {
    const projects = await getProjects();
    
    return new Response(JSON.stringify(projects), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get projects:', error);
    return new Response(JSON.stringify({ error: 'Failed to get projects' }), {
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