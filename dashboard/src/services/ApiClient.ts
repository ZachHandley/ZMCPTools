/**
 * API Client for ZMCPTools Dashboard
 * 
 * Handles communication with the CLI backend server for data retrieval
 */

import type { Plan } from '../../../src/schemas/plans';

export interface DashboardStats {
  projects: { active: number; total: number };
  agents: { active: number; idle: number; completed: number; failed: number };
  tasks: { running: number; pending: number; completed: number };
  rooms: { active: number; total: number };
  plans: { active: number; total: number; completed: number };
}

export interface Project {
  id: string;
  name: string;
  repositoryPath: string;
  mcpServerType: string;
  mcpServerPid?: number;
  mcpServerPort?: number;
  mcpServerHost?: string;
  claudeSessionId?: string;
  foundationSessionId?: string;
  status: string;
  startTime: string;
  lastHeartbeat?: string;
  endTime?: string;
  projectMetadata?: Record<string, any>;
  webUiEnabled?: boolean;
  webUiPort?: number;
  webUiHost?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  agentName: string;
  repositoryPath: string;
  taskDescription: string;
  status: string;
  claudePid?: number;
  lastHeartbeat: string;
  createdAt: string;
  endTime?: string;
  capabilities?: string[];
  dependsOn?: string[];
  roomId?: string;
  metadata?: Record<string, any>;
}

export interface Orchestration {
  orchestrationId: string;
  title: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;
  duration?: number;
  progress: number;
  totalTasks: number;
  completedTasks: any[];
  failedTasks: any[];
  activeAgents: any[];
  spawnedAgents: any[];
  roomName?: string;
  foundationSessionId?: string;
  nextSteps: string[];
  insights: any[];
  errors: string[];
}

export interface Room {
  roomId: string;
  roomName: string;
  memberCount: number;
  activeMembers: string[];
  recentMessages: any[];
  messageCount: number;
  lastActivity: string;
  topicSummary?: string;
  coordinationStatus: 'active' | 'idle' | 'blocked';
}

export class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    // Use current location for API base URL in development
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      const port = window.location.port;
      this.baseUrl = `${protocol}//${hostname}:${port}/api`;
    } else {
      // Fallback for SSR
      this.baseUrl = '/api';
    }
    console.log('🌐 API Client base URL:', this.baseUrl);
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  async getStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/stats.json');
  }

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects.json');
  }

  async getProject(id: string): Promise<Project> {
    return this.request<Project>(`/projects/${id}.json`);
  }

  async getAgents(repositoryPath?: string, status?: string): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (repositoryPath) params.append('repository', repositoryPath);
    if (status) params.append('status', status);
    
    const query = params.toString();
    return this.request<Agent[]>(`/agents.json${query ? `?${query}` : ''}`);
  }

  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}.json`);
  }

  async terminateAgent(id: string): Promise<void> {
    return this.request<void>(`/agents/${id}/terminate.json`, {
      method: 'POST',
    });
  }

  async getOrchestrations(repositoryPath?: string): Promise<Orchestration[]> {
    const params = new URLSearchParams();
    if (repositoryPath) params.append('repository', repositoryPath);
    
    const query = params.toString();
    return this.request<Orchestration[]>(`/orchestrations.json${query ? `?${query}` : ''}`);
  }

  async getOrchestration(id: string): Promise<Orchestration> {
    return this.request<Orchestration>(`/orchestrations/${id}.json`);
  }

  async pauseOrchestration(id: string): Promise<void> {
    return this.request<void>(`/orchestrations/${id}/pause.json`, {
      method: 'POST',
    });
  }

  async resumeOrchestration(id: string): Promise<void> {
    return this.request<void>(`/orchestrations/${id}/resume.json`, {
      method: 'POST',
    });
  }

  async getRooms(repositoryPath?: string): Promise<Room[]> {
    const params = new URLSearchParams();
    if (repositoryPath) params.append('repository', repositoryPath);
    
    const query = params.toString();
    return this.request<Room[]>(`/rooms.json${query ? `?${query}` : ''}`);
  }

  async getRoom(id: string): Promise<Room> {
    return this.request<Room>(`/rooms/${id}.json`);
  }

  async joinRoom(roomName: string, agentName: string): Promise<void> {
    return this.request<void>(`/rooms/${roomName}/join.json`, {
      method: 'POST',
      body: JSON.stringify({ agentName }),
    });
  }

  async closeRoom(id: string): Promise<void> {
    return this.request<void>(`/rooms/${id}/close.json`, {
      method: 'POST',
    });
  }

  async getTasks(repositoryPath?: string, status?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (repositoryPath) params.append('repository', repositoryPath);
    if (status) params.append('status', status);
    
    const query = params.toString();
    return this.request<any[]>(`/tasks.json${query ? `?${query}` : ''}`);
  }

  async getTask(id: string): Promise<any> {
    return this.request<any>(`/tasks/${id}.json`);
  }

  async getSystemHealth(): Promise<{ status: string; uptime: number; version: string }> {
    return this.request<{ status: string; uptime: number; version: string }>('/health.json');
  }

  async getMemories(query?: string, repositoryPath?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (repositoryPath) params.append('repository', repositoryPath);
    
    const queryStr = params.toString();
    return this.request<any[]>(`/memories.json${queryStr ? `?${queryStr}` : ''}`);
  }

  async getRoomMessages(roomName: string, limit?: number): Promise<any[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    
    const query = params.toString();
    return this.request<any[]>(`/rooms/${roomName}/messages.json${query ? `?${query}` : ''}`);
  }

  async getPlans(repositoryPath?: string, status?: string): Promise<Plan[]> {
    const params = new URLSearchParams();
    if (repositoryPath) params.append('repository', repositoryPath);
    if (status) params.append('status', status);
    
    const query = params.toString();
    return this.request<Plan[]>(`/plans.json${query ? `?${query}` : ''}`);
  }

  async getPlan(id: string): Promise<Plan> {
    return this.request<Plan>(`/plans/${id}.json`);
  }
}