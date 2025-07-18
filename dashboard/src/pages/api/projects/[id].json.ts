import type { APIRoute } from 'astro';
import { getProject, JSON_HEADERS } from '../../../utils/simpleDatabase.js';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Project ID is required' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  try {
    const project = await getProject(id);
    
    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: JSON_HEADERS
      });
    }
    
    return new Response(JSON.stringify(project), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    console.error('Failed to get project:', error);
    return new Response(JSON.stringify({ error: 'Failed to get project' }), {
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