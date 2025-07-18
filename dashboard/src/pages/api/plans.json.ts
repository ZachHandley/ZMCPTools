import type { APIRoute } from 'astro';
import { getDrizzleDatabase, JSON_HEADERS } from '../../utils/simpleDatabase.js';
import { plans } from '../../schemas/index.js';
import { eq, desc, and } from 'drizzle-orm';

export const GET: APIRoute = async ({ url }) => {
  try {
    const params = new URLSearchParams(url.search);
    const repositoryPath = params.get('repository');
    const status = params.get('status');

    const db = getDrizzleDatabase();
    let query = db.select().from(plans);
    
    const conditions = [];
    if (repositoryPath) {
      conditions.push(eq(plans.repositoryPath, repositoryPath));
    }
    if (status) {
      conditions.push(eq(plans.status, status));
    }
    
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }
    
    const result = await query.orderBy(desc(plans.createdAt));

    // Calculate progress (JSON fields are already parsed by Drizzle)
    const parsedPlans = result.map((plan: any) => ({
      ...plan,
      sections: plan.sections || [],
      metadata: plan.metadata || {},
      progress: calculateProgress(plan) // Calculate progress from sections
    }));

    return new Response(JSON.stringify(parsedPlans), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch plans' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

function calculateProgress(plan: any): number {
  if (!plan.sections || !Array.isArray(plan.sections)) return 0;
  
  const sections = plan.sections;
  if (sections.length === 0) return 0;
  
  // Simple progress calculation based on section completion
  // This is a placeholder - you might want to implement more sophisticated logic
  if (plan.status === 'completed') return 100;
  if (plan.status === 'in_progress') return 50;
  if (plan.status === 'approved') return 25;
  
  return 0;
}