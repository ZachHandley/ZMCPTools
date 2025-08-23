import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpTool } from '../schemas/tools/index.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DatabaseManager } from '../database/index.js';
import { AgentService, CommunicationService, KnowledgeGraphService } from '../services/index.js';
import type { MessageType } from '../schemas/index.js';

// Import centralized request schemas
import {
  JoinRoomSchema,
  SendMessageSchema,
  ListRoomsSchema
} from '../schemas/tools/communication.js';

// Import centralized response schemas
import {
  createSuccessResponse,
  createErrorResponse,
  type AgentOrchestrationResponse
} from '../schemas/toolResponses.js';

// Import individual response schemas and types
import {
  JoinRoomResponseSchema,
  SendMessageResponseSchema,
  ListRoomsResponseSchema,
  type JoinRoomResponse,
  type SendMessageResponse,
  type ListRoomsResponse
} from '../schemas/tools/communication.js';

export class CommunicationTools {
  private agentService: AgentService;
  private communicationService: CommunicationService;
  private knowledgeGraphService: KnowledgeGraphService;
  private repositoryPath: string;

  constructor(private db: DatabaseManager, repositoryPath: string) {
    this.repositoryPath = repositoryPath;
    this.agentService = new AgentService(db);
    this.communicationService = new CommunicationService(db);
    // Initialize KnowledgeGraphService with VectorSearchService
    this.initializeKnowledgeGraphService(db);
  }

  private async initializeKnowledgeGraphService(db: DatabaseManager): Promise<void> {
    try {
      const { VectorSearchService } = await import('../services/VectorSearchService.js');
      const vectorService = new VectorSearchService(db);
      this.knowledgeGraphService = new KnowledgeGraphService(db, vectorService);
    } catch (error: any) {
      console.warn('Failed to initialize KnowledgeGraphService:', error);
      // Fallback to a minimal implementation that doesn't crash
      this.knowledgeGraphService = {
        createEntity: async () => ({ id: 'fallback', name: 'fallback' }),
        findEntitiesBySemanticSearch: async () => []
      } as any;
    }
  }

  /**
   * Get MCP tools for communication functionality
   * Returns properly structured McpTool objects with handlers
   */
  getTools(): McpTool[] {
    return [
      {
        name: 'join_room',
        description: 'Join communication room for coordination',
        inputSchema: zodToJsonSchema(JoinRoomSchema),
        outputSchema: zodToJsonSchema(JoinRoomResponseSchema),
        handler: this.joinRoom.bind(this)
      },
      {
        name: 'send_message',
        description: 'Send message to coordination room',
        inputSchema: zodToJsonSchema(SendMessageSchema),
        outputSchema: zodToJsonSchema(SendMessageResponseSchema),
        handler: this.sendMessage.bind(this)
      },
      {
        name: 'list_rooms',
        description: 'List communication rooms with filtering',
        inputSchema: zodToJsonSchema(ListRoomsSchema),
        outputSchema: zodToJsonSchema(ListRoomsResponseSchema),
        handler: this.listRooms.bind(this)
      }
    ];
  }

  /**
   * Join communication room for coordination
   * Auto-creates room if it doesn't exist for seamless coordination
   */
  async joinRoom(args: any): Promise<JoinRoomResponse> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      roomName: args.roomName || args.room_name,
      agentName: args.agentName || args.agent_name
    };
    
    const { roomName, agentName } = JoinRoomSchema.parse(normalizedArgs);
    const startTime = performance.now();
    
    try {
      // Check if room exists
      let room = await this.communicationService.getRoom(roomName);
      let roomCreated = false;
      
      // Auto-create room if it doesn't exist (consolidated functionality from create_delayed_room)
      if (!room) {
        try {
          room = await this.communicationService.createRoom({
            name: roomName,
            description: `Auto-created coordination room for agent communication`,
            repositoryPath: this.repositoryPath,
            metadata: {
              type: 'coordination',
              autoCreated: true,
              createdBy: agentName,
              createdAt: new Date().toISOString()
            }
          });
          roomCreated = true;
        } catch (createError: any) {
          const executionTime = performance.now() - startTime;
          return createErrorResponse(
            'Failed to create room',
            `Room ${roomName} not found and could not be created: ${createError.message}`,
            'ROOM_CREATE_FAILED'
          ) as JoinRoomResponse;
        }
      }

      // Join the room
      await this.communicationService.joinRoom(roomName, agentName);

      // Get recent messages for context
      const recentMessages = await this.communicationService.getRecentMessages(roomName, 10);
      const participants = await this.communicationService.getRoomParticipants(roomName);

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        roomCreated 
          ? `Successfully created and joined room ${roomName}` 
          : `Successfully joined room ${roomName}`,
        {
          room_id: room.id,
          room_name: roomName,
          agent_name: agentName,
          participant_count: participants.length,
          recent_message_count: recentMessages.length,
          recent_messages: recentMessages.slice(0, 5), // Return last 5 for context
          room_created: roomCreated
        },
        executionTime
      ) as JoinRoomResponse;

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to join room',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'JOIN_ROOM_ERROR'
      ) as JoinRoomResponse;
    }
  }

  /**
   * Send message to coordination room
   */
  async sendMessage(args: any): Promise<SendMessageResponse> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      roomName: args.roomName || args.room_name,
      agentName: args.agentName || args.agent_name,
      message: args.message,
      mentions: args.mentions
    };
    
    const { roomName, agentName, message, mentions } = SendMessageSchema.parse(normalizedArgs);
    const startTime = performance.now();
    
    try {
      const sentMessage = await this.communicationService.sendMessage({
        roomName,
        agentName,
        message,
        mentions,
        messageType: 'standard' as MessageType
      });

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        'Message sent successfully',
        {
          message_id: sentMessage.id,
          room_name: roomName,
          agent_name: agentName,
          mentions: mentions || []
        },
        executionTime
      ) as SendMessageResponse;

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to send message',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'SEND_MESSAGE_ERROR'
      ) as SendMessageResponse;
    }
  }

  /**
   * List communication rooms with filtering and pagination
   * Enhanced with message previews for better coordination visibility
   */
  async listRooms(args: any): Promise<ListRoomsResponse> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      repositoryPath: args.repositoryPath || args.repository_path,
      status: args.status,
      limit: args.limit,
      offset: args.offset
    };
    
    const { repositoryPath, status, limit = 20, offset = 0 } = ListRoomsSchema.parse(normalizedArgs);
    const startTime = performance.now();
    
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;
      const allRooms = await this.communicationService.listRooms(repoPath);
      
      // Filter by status
      let filteredRooms = allRooms;
      if (status && status !== 'all') {
        filteredRooms = allRooms.filter(room => {
          const roomStatus = room.roomMetadata?.status || 'active';
          return roomStatus === status;
        });
      }

      // Apply pagination
      const total = filteredRooms.length;
      const paginatedRooms = filteredRooms.slice(offset, offset + limit);

      // Get enhanced room information with message previews (consolidated from list_room_messages)
      const enhancedRooms = await Promise.all(
        paginatedRooms.map(async (room) => {
          try {
            const recentMessages = await this.communicationService.getRecentMessages(room.name, 3);
            const participants = await this.communicationService.getRoomParticipants(room.name);
            return {
              id: room.id,
              name: room.name,
              description: room.description,
              repository_path: room.repositoryPath,
              is_general: room.isGeneral,
              status: room.roomMetadata?.status || 'active',
              created_at: room.createdAt,
              closed_at: room.roomMetadata?.closedAt,
              participant_count: participants.length,
              recent_message_count: recentMessages.length,
              recent_messages: recentMessages.map(msg => ({
                agent_name: msg.agentName,
                message: msg.message.substring(0, 100) + (msg.message.length > 100 ? '...' : ''),
                timestamp: msg.timestamp
              })),
              metadata: room.roomMetadata
            };
          } catch (error) {
            // Return basic room info if message retrieval fails
            return {
              id: room.id,
              name: room.name,
              description: room.description,
              repository_path: room.repositoryPath,
              is_general: room.isGeneral,
              status: room.roomMetadata?.status || 'active',
              created_at: room.createdAt,
              closed_at: room.roomMetadata?.closedAt,
              participant_count: 0,
              recent_message_count: 0,
              recent_messages: [],
              metadata: room.roomMetadata
            };
          }
        })
      );

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        `Found ${total} rooms${status ? ` with status '${status}'` : ''} with message previews`,
        {
          rooms: enhancedRooms,
          pagination: {
            total,
            limit,
            offset,
            has_more: offset + limit < total
          }
        },
        executionTime
      ) as ListRoomsResponse;

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to list rooms',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'LIST_ROOMS_ERROR'
      ) as ListRoomsResponse;
    }
  }

  // Note: Removed tools are handled internally:
  // - wait_for_messages: Automatic polling handled by internal services
  // - close_room/delete_room: Automatic cleanup via lifecycle management
  // - list_room_messages: Enhanced room listing includes message previews
  // - create_delayed_room: Auto-room creation integrated into join_room
  // - analyze_coordination_patterns: Internal analytics, not user-facing
  // - broadcast_message_to_agents: Specialized function delegated to AgentService
}