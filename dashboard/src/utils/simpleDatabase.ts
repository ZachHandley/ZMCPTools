import Database from 'better-sqlite3';
import path from 'path';
import { homedir } from 'os';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, desc, and } from 'drizzle-orm';

// Import schemas from the copied schemas directory
import {
  allTables,
  agentSessions,
  tasks,
  chatRooms,
  chatMessages,
  projects,
  roomParticipants,
  plans
} from '../schemas/index.js';

let dbInstance: Database.Database | null = null;
let drizzleInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabase() {
  if (!dbInstance) {
    // Use the same path as the main MCP server
    const dataDir = process.env.ZMCP_DATA_DIR || path.join(homedir(), '.mcptools', 'data');
    const dbPath = path.join(dataDir, 'claude_mcp_tools.db');
    
    dbInstance = new Database(dbPath, {
      timeout: 30000,
      fileMustExist: false,
    });
    
    // Configure SQLite for consistency with main MCP server
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('busy_timeout = 30000');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

export function getDrizzleDatabase() {
  if (!drizzleInstance) {
    const sqliteDb = getDatabase();
    drizzleInstance = drizzle(sqliteDb, { schema: allTables });
  }
  return drizzleInstance;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  ...CORS_HEADERS
};

// Service functions using Drizzle ORM
export async function getProjects() {
  const db = getDrizzleDatabase();
  const rawProjects = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  
  // Transform the raw projects to parse JSON metadata and check for stale projects
  const now = new Date();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes
  
  return rawProjects.map(project => {
    let status = project.status;
    
    // Mark as stale if last heartbeat is too old
    const heartbeatField = project.lastHeartbeat || project.last_heartbeat;
    if (heartbeatField) {
      const lastHeartbeat = new Date(heartbeatField);
      const timeDiff = now.getTime() - lastHeartbeat.getTime();
      
      if (timeDiff > staleThreshold && status === 'active') {
        status = 'stale';
      }
    }
    
    return {
      ...project,
      status,
      projectMetadata: project.projectMetadata ? JSON.parse(project.projectMetadata) : {}
    };
  });
}

export async function getProject(id: string) {
  const db = getDrizzleDatabase();
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  const project = result[0];
  
  if (!project) return null;
  
  // Transform the project to parse JSON metadata
  return {
    ...project,
    projectMetadata: project.projectMetadata ? JSON.parse(project.projectMetadata) : {}
  };
}

export async function getAgents(repository?: string, status?: string) {
  const db = getDrizzleDatabase();
  let query = db.select().from(agentSessions);
  
  const conditions = [];
  if (repository) {
    conditions.push(eq(agentSessions.repositoryPath, repository));
  }
  if (status) {
    conditions.push(eq(agentSessions.status, status));
  }
  
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }
  
  // Sort by most recent activity (lastHeartbeat), then by creation time
  return await query.orderBy(desc(agentSessions.lastHeartbeat), desc(agentSessions.createdAt));
}

export async function getAgent(id: string) {
  const db = getDrizzleDatabase();
  const result = await db.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
  return result[0] || null;
}

export async function terminateAgent(id: string) {
  const db = getDrizzleDatabase();
  const result = await db.update(agentSessions)
    .set({ 
      status: 'terminated',
      lastHeartbeat: new Date().toISOString()
    })
    .where(eq(agentSessions.id, id));
  return result;
}

export async function getTasks(repository?: string, status?: string) {
  const db = getDrizzleDatabase();
  let query = db.select().from(tasks);
  
  const conditions = [];
  if (repository) {
    conditions.push(eq(tasks.repositoryPath, repository));
  }
  if (status) {
    conditions.push(eq(tasks.status, status));
  }
  
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }
  
  return await query.orderBy(desc(tasks.createdAt));
}

export async function getRooms(repository?: string) {
  const db = getDrizzleDatabase();
  let query = db.select().from(chatRooms);
  
  if (repository) {
    query = query.where(eq(chatRooms.repositoryPath, repository));
  }
  
  const rooms = await query.orderBy(desc(chatRooms.createdAt));
  
  // Enhance rooms with activity data using Promise.all for parallel processing
  const enhancedRooms = await Promise.all(
    rooms.map(async (room: any) => {
      try {
        const [stats, recentMessages] = await Promise.all([
          getRoomStats(room.id),
          getRoomMessages(room.id, 5)
        ]);
        
        return {
          roomId: room.id,
          roomName: room.name,
          memberCount: stats.participantCount,
          activeMembers: [], // TODO: Get active members from roomParticipants table
          recentMessages,
          messageCount: stats.messageCount,
          lastActivity: stats.lastActivity || room.createdAt,
          topicSummary: room.description || '',
          coordinationStatus: stats.messageCount > 0 ? 'active' : 'idle'
        };
      } catch (error) {
        console.error(`Error enhancing room ${room.id}:`, error);
        // Return basic room info if enhancement fails
        return {
          roomId: room.id,
          roomName: room.name,
          memberCount: 0,
          activeMembers: [],
          recentMessages: [],
          messageCount: 0,
          lastActivity: room.createdAt,
          topicSummary: room.description || '',
          coordinationStatus: 'idle'
        };
      }
    })
  );
  
  return enhancedRooms;
}

export async function getRoomStats(roomId: string) {
  const db = getDrizzleDatabase();
  
  try {
    // Get all messages for this room, ordered by timestamp
    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.timestamp));
    
    // Count messages
    const messageCount = messages.length;
    
    // Count unique participants
    const uniqueAgents = new Set(messages.map(m => m.agentName));
    const participantCount = uniqueAgents.size;
    
    // Get last activity (most recent message timestamp)
    const lastActivity = messageCount > 0 ? messages[0].timestamp : null;
    
    return {
      messageCount,
      participantCount,
      lastActivity
    };
  } catch (error) {
    console.error(`Error getting room stats for ${roomId}:`, error);
    return {
      messageCount: 0,
      participantCount: 0,
      lastActivity: null
    };
  }
}

export async function getRoomMessages(roomId: string, limit: number = 50) {
  const db = getDrizzleDatabase();
  try {
    return await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);
  } catch (error) {
    console.error(`Error getting room messages for ${roomId}:`, error);
    return [];
  }
}

export async function joinRoom(roomName: string, agentName: string) {
  // This is a simplified implementation - just acknowledge the join
  // In reality, this would update room participants table
  return { success: true };
}

export async function getSystemStats() {
  const db = getDrizzleDatabase();
  
  try {
    console.log('📊 Computing system stats...');
    
    // Get all records to compute stats
    const allProjects = await db.select().from(projects);
    const allAgents = await db.select().from(agentSessions);
    const allTasks = await db.select().from(tasks);
    const allRooms = await db.select().from(chatRooms);
    const allPlans = await db.select().from(plans);
    
    console.log('📊 Record counts:', { 
      projects: allProjects.length, 
      agents: allAgents.length, 
      tasks: allTasks.length, 
      rooms: allRooms.length, 
      plans: allPlans.length 
    });
  
  // Compute project stats with stale detection
  const now = new Date();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes
  
  const projectStats = allProjects.reduce((acc: any, project) => {
    let status = project.status;
    
    // Mark as stale if last heartbeat is too old
    const heartbeatField = project.lastHeartbeat || project.last_heartbeat;
    if (heartbeatField) {
      const lastHeartbeat = new Date(heartbeatField);
      const timeDiff = now.getTime() - lastHeartbeat.getTime();
      
      if (timeDiff > staleThreshold && status === 'active') {
        status = 'stale';
      }
    }
    
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  // Compute agent stats
  const agentStats = allAgents.reduce((acc: any, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1;
    return acc;
  }, {});
  
  // Compute task stats
  const taskStats = allTasks.reduce((acc: any, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
  
  // Compute plan stats
  const planStats = allPlans.reduce((acc: any, plan) => {
    acc[plan.status] = (acc[plan.status] || 0) + 1;
    return acc;
  }, {});
  
  const roomCount = allRooms.length;
  
  // Transform to expected format
  const projectsResult = { 
    active: projectStats.active || 0,
    stale: projectStats.stale || 0,
    total: allProjects.length 
  };
  
  const agentsResult = { 
    active: agentStats.active || 0, 
    idle: agentStats.idle || 0, 
    completed: agentStats.completed || 0, 
    failed: agentStats.failed || 0 
  };
  
  const tasksResult = { 
    running: taskStats.in_progress || 0, 
    pending: taskStats.pending || 0, 
    completed: taskStats.completed || 0 
  };
  
  const plansResult = {
    active: planStats.in_progress || 0,
    total: allPlans.length,
    completed: planStats.completed || 0
  };
  
  const result = {
    projects: projectsResult,
    agents: agentsResult,
    tasks: tasksResult,
    rooms: {
      active: roomCount,
      total: roomCount
    },
    plans: plansResult
  };
  
  console.log('📊 Computed stats:', result);
  return result;
  
  } catch (error) {
    console.error('❌ Error computing system stats:', error);
    throw error;
  }
}