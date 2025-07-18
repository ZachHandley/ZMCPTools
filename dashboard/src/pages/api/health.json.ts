import type { APIRoute } from 'astro';
import { JSON_HEADERS } from '../../utils/simpleDatabase.js';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    uptime: process.uptime(),
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: JSON_HEADERS
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: JSON_HEADERS
  });
};