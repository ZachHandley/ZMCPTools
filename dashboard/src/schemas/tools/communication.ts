import { z } from 'zod';

// ===============================================
// Communication Tool Request Schemas
// ===============================================

export const JoinRoomSchema = z.object({
  roomName: z.string().describe('Name of the communication room to join. This should be an existing room created for coordination between agents.'),
  agentName: z.string().describe('Name or identifier of the agent joining the room. This will be used to identify the agent in room communications.')
});

export const SendMessageSchema = z.object({
  roomName: z.string().describe('Name of the communication room where the message will be sent. The room must exist and the agent should be a member.'),
  agentName: z.string().describe('Name or identifier of the agent sending the message. This will be displayed as the message sender.'),
  message: z.string().describe('The message content to send to the room. Can include coordination instructions, status updates, questions, or other communication.'),
  mentions: z.array(z.string()).optional().describe('Optional array of agent names to mention in the message. Mentioned agents may receive special notifications or attention.')
});

export const WaitForMessagesSchema = z.object({
  roomName: z.string().describe('Name of the communication room to monitor for new messages. The agent should be a member of this room.'),
  timeout: z.number().default(30000).describe('Maximum time to wait for messages in milliseconds. Defaults to 30 seconds (30000ms). After this time, the function will return with whatever messages were received.'),
  sinceTimestamp: z.string().optional().describe('Optional ISO timestamp string to only retrieve messages sent after this time. If not provided, will wait for any new messages from the current time.')
});

export const CloseRoomSchema = z.object({
  roomName: z.string().describe('Name of the communication room to close. This performs a soft close, marking the room as closed but preserving all messages and data.'),
  terminateAgents: z.boolean().default(true).describe('Whether to terminate all agents associated with this room when closing it. Defaults to true. If false, agents will remain active but lose their room association.')
});

export const DeleteRoomSchema = z.object({
  roomName: z.string().describe('Name of the communication room to permanently delete. This will remove all messages and data associated with the room.'),
  forceDelete: z.boolean().default(false).describe('Whether to force delete the room even if it\'s not closed. Defaults to false. If false, the room must be closed before deletion. If true, will delete the room regardless of status.')
});

export const ListRoomsSchema = z.object({
  repositoryPath: z.string().describe('Absolute path to the repository where rooms will be listed. This determines the scope of the room search.'),
  status: z.enum(['active', 'closed', 'all']).optional().describe('Optional status filter to show rooms with specific status. "active" shows only open rooms, "closed" shows only closed rooms, "all" shows all rooms. If not provided, defaults to showing all rooms.'),
  limit: z.number().default(20).describe('Maximum number of rooms to return. Defaults to 20. Use for pagination.'),
  offset: z.number().default(0).describe('Number of rooms to skip before returning results. Defaults to 0. Use for pagination.')
});

export const ListRoomMessagesSchema = z.object({
  roomName: z.string().describe('Name of the communication room to retrieve messages from. The room must exist and be accessible.'),
  limit: z.number().default(50).describe('Maximum number of messages to return. Defaults to 50. Use for pagination and to control response size.'),
  offset: z.number().default(0).describe('Number of messages to skip before returning results. Defaults to 0. Use for pagination through message history.'),
  sinceTimestamp: z.string().optional().describe('Optional ISO timestamp string to only retrieve messages sent after this time. Useful for getting recent messages or continuing from a specific point in time.')
});

export const CreateDelayedRoomSchema = z.object({
  agentId: z.string().describe('ID of the agent creating the coordination room. This agent will be automatically added to the room as a participant.'),
  repositoryPath: z.string().describe('Absolute path to the repository where the room will be created. This determines the scope and context of the coordination room.'),
  reason: z.string().describe('Reason or purpose for creating the coordination room. This will be included in the room description and initial message.'),
  participants: z.array(z.string()).optional().default([]).describe('Optional array of additional agent IDs or names to invite to the coordination room. The creating agent is automatically included.')
});

export const AnalyzeCoordinationPatternsSchema = z.object({
  repositoryPath: z.string().describe('Absolute path to the repository to analyze for coordination patterns. This determines the scope of rooms and communication to analyze.')
});

export const BroadcastMessageToAgentsSchema = z.object({
  repositoryPath: z.string().describe('Absolute path to the repository where target agents are located. This determines the scope of agents to potentially message.'),
  agentIds: z.array(z.string()).describe('Array of specific agent IDs to send the message to. Only agents in this list will receive the message.'),
  message: z.string().describe('The message content to broadcast to the specified agents. This should be clear and actionable.'),
  autoResume: z.boolean().default(true).describe('Whether to automatically resume dead agents before sending the message. If true, any agents that are not currently active will be resumed with their last session before message delivery. Defaults to true.'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal').describe('Priority level of the message. Higher priority messages may be delivered with special formatting or emphasis. Defaults to "normal".'),
  messageType: z.enum(['coordination', 'instruction', 'status', 'notification']).default('coordination').describe('Type of message being sent. Affects how the message is formatted and processed by receiving agents. Defaults to "coordination".')
});

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type WaitForMessagesInput = z.infer<typeof WaitForMessagesSchema>;
export type CloseRoomInput = z.infer<typeof CloseRoomSchema>;
export type DeleteRoomInput = z.infer<typeof DeleteRoomSchema>;
export type ListRoomsInput = z.infer<typeof ListRoomsSchema>;
export type ListRoomMessagesInput = z.infer<typeof ListRoomMessagesSchema>;
export type CreateDelayedRoomInput = z.infer<typeof CreateDelayedRoomSchema>;
export type AnalyzeCoordinationPatternsInput = z.infer<typeof AnalyzeCoordinationPatternsSchema>;
export type BroadcastMessageToAgentsInput = z.infer<typeof BroadcastMessageToAgentsSchema>;

// ===============================================
// Communication Tool Response Schemas
// ===============================================

// Join Room Response
export const JoinRoomResponseSchema = z.object({
  success: z.boolean().describe('Whether the agent successfully joined the communication room. True if agent is now a participant and can send/receive messages.'),
  message: z.string().describe('Human-readable message describing the join result, including room name and confirmation or error details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the agent joined the room.'),
  execution_time_ms: z.number().optional().describe('Time taken to join the room in milliseconds, including participant registration and message history retrieval.'),
  data: z.object({
    room_id: z.string().describe('Unique identifier of the joined room, used for internal operations and message routing.'),
    room_name: z.string().describe('Human-readable name of the room that was joined.'),
    agent_name: z.string().describe('Name of the agent that joined the room, as it will appear in messages and participant lists.'),
    participant_count: z.number().describe('Total number of participants currently in the room, including the newly joined agent.'),
    recent_message_count: z.number().describe('Number of recent messages retrieved for context, typically the last 10 messages.'),
    recent_messages: z.array(z.any()).describe('Array of recent message objects providing context about ongoing conversations, limited to last 5 messages for response size.')
  }).optional().describe('Room join details returned when successful, containing room info, participant count, and recent message context.')
});

// Send Message Response
export const SendMessageResponseSchema = z.object({
  success: z.boolean().describe('Whether the message was successfully sent to the room. True if message was delivered to all participants.'),
  message: z.string().describe('Human-readable confirmation of message delivery or error details if sending failed.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the message was sent and delivered.'),
  execution_time_ms: z.number().optional().describe('Time taken to send the message in milliseconds, including delivery to all participants.'),
  data: z.object({
    message_id: z.string().describe('Unique identifier of the sent message, used for tracking and potential message operations.'),
    room_name: z.string().describe('Name of the room where the message was sent.'),
    agent_name: z.string().describe('Name of the agent that sent the message, as it appears to other participants.'),
    mentions: z.array(z.string()).describe('List of agent names that were mentioned in the message, who may receive special notifications.')
  }).optional().describe('Message sending details returned when successful, containing message ID, room info, and mention information.')
});

// Wait For Messages Response
export const WaitForMessagesResponseSchema = z.object({
  success: z.boolean().describe('Whether the wait operation completed successfully. True if messages were retrieved or timeout was reached gracefully.'),
  message: z.string().describe('Human-readable description of the wait result, including number of messages received or timeout information.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the wait operation completed.'),
  execution_time_ms: z.number().optional().describe('Actual time spent waiting for messages in milliseconds, may be less than requested timeout if messages arrived.'),
  data: z.object({
    messages: z.array(z.any()).describe('Array of message objects received during the wait period, each containing agent name, message content, timestamp, and metadata.'),
    count: z.number().describe('Total number of messages received during the wait period.'),
    room_name: z.string().describe('Name of the room that was monitored for messages.')
  }).optional().describe('Message wait results returned when successful, containing all messages received during the wait period with metadata.')
});

// Close Room Response
export const CloseRoomResponseSchema = z.object({
  success: z.boolean().describe('Whether the room was successfully closed. True if room is marked as closed and associated agents were handled.'),
  message: z.string().describe('Human-readable description of the close operation result, including room name and agent termination summary.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the room was closed.'),
  execution_time_ms: z.number().optional().describe('Time taken to close the room in milliseconds, including agent termination if requested.'),
  data: z.object({
    room_name: z.string().describe('Name of the room that was closed.'),
    terminated_agents: z.array(z.string()).describe('List of agent IDs that were terminated as part of the room closure process.'),
    agent_count: z.number().describe('Number of agents that were terminated when closing the room.')
  }).optional().describe('Room closure details returned when successful, containing room name and information about terminated agents.')
});

// Delete Room Response
export const DeleteRoomResponseSchema = z.object({
  success: z.boolean().describe('Whether the room was successfully deleted permanently. True if room and all associated data were removed.'),
  message: z.string().describe('Human-readable description of the deletion result, including room name and data removal confirmation.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the room was permanently deleted.'),
  execution_time_ms: z.number().optional().describe('Time taken to delete the room in milliseconds, including message deletion and agent cleanup.'),
  data: z.object({
    room_name: z.string().describe('Name of the room that was permanently deleted.'),
    messages_deleted: z.boolean().describe('Whether all messages in the room were successfully deleted from the database.'),
    agents_terminated: z.number().describe('Number of agents that were terminated as part of the room deletion process.')
  }).optional().describe('Room deletion details returned when successful, containing room name and confirmation of data removal.')
});

// List Rooms Response
export const ListRoomsResponseSchema = z.object({
  success: z.boolean().describe('Whether the room listing operation completed successfully. True if room information was retrieved and formatted.'),
  message: z.string().describe('Human-readable description of the listing result, including number of rooms found and any filtering applied.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the room listing was completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to retrieve and format the room list in milliseconds.'),
  data: z.object({
    rooms: z.array(z.object({
      id: z.string().describe('Unique identifier of the room.'),
      name: z.string().describe('Human-readable name of the room.'),
      description: z.string().optional().describe('Optional description of the room\'s purpose or context.'),
      repository_path: z.string().describe('File system path of the repository this room is associated with.'),
      is_general: z.boolean().describe('Whether this is a general-purpose room (true) or a specialized coordination room (false).'),
      status: z.string().describe('Current status of the room ("active" for open rooms, "closed" for closed rooms).'),
      created_at: z.string().describe('ISO timestamp string indicating when the room was created.'),
      closed_at: z.string().optional().describe('ISO timestamp string indicating when the room was closed, if applicable.'),
      metadata: z.any().optional().describe('Additional room metadata including creation context, associated agents, and configuration.')
    })).describe('Array of room objects with their status, metadata, and associated repository information.'),
    pagination: z.object({
      total: z.number().describe('Total number of rooms matching the search criteria (before pagination).'),
      limit: z.number().describe('Maximum number of rooms returned in this response.'),
      offset: z.number().describe('Number of rooms skipped before this page of results.'),
      has_more: z.boolean().describe('Whether there are more rooms available beyond this page.')
    }).describe('Pagination information for navigating through large room lists.')
  }).optional().describe('Room listing details returned when successful, containing room information with pagination support.')
});

// List Room Messages Response
export const ListRoomMessagesResponseSchema = z.object({
  success: z.boolean().describe('Whether the message listing operation completed successfully. True if messages were retrieved from the specified room.'),
  message: z.string().describe('Human-readable description of the message retrieval result, including number of messages found.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the message listing was completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to retrieve and format the message list in milliseconds.'),
  data: z.object({
    room_id: z.string().describe('Unique identifier of the room from which messages were retrieved.'),
    room_name: z.string().describe('Human-readable name of the room from which messages were retrieved.'),
    messages: z.array(z.object({
      id: z.string().describe('Unique identifier of the message.'),
      agent_name: z.string().describe('Name of the agent that sent this message.'),
      message: z.string().describe('Full text content of the message.'),
      mentions: z.array(z.string()).optional().describe('List of agent names that were mentioned in this message.'),
      message_type: z.string().describe('Type of message (e.g., "standard", "system", "coordination").'),
      timestamp: z.string().describe('ISO timestamp string indicating when this message was sent.')
    })).describe('Array of message objects in chronological order, containing full message content and metadata.'),
    pagination: z.object({
      total: z.number().describe('Total number of messages in the room (before pagination).'),
      limit: z.number().describe('Maximum number of messages returned in this response.'),
      offset: z.number().describe('Number of messages skipped before this page of results.'),
      has_more: z.boolean().describe('Whether there are more messages available beyond this page.')
    }).describe('Pagination information for navigating through message history.')
  }).optional().describe('Message listing details returned when successful, containing message content and metadata with pagination support.')
});

// Create Delayed Room Response
export const CreateDelayedRoomResponseSchema = z.object({
  success: z.boolean().describe('Whether the delayed coordination room was successfully created. True if room was created and participants were added.'),
  message: z.string().describe('Human-readable description of the room creation result, including room name and participant summary.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the delayed room was created.'),
  execution_time_ms: z.number().optional().describe('Time taken to create the room in milliseconds, including participant setup and initial message.'),
  data: z.object({
    room_name: z.string().describe('Name of the created coordination room.'),
    reason: z.string().describe('The reason or purpose for which the room was created.'),
    participants: z.array(z.string()).describe('List of agent IDs or names that were added to the room, including the creating agent.'),
    created_at: z.string().describe('ISO timestamp string indicating when the room was created.')
  }).optional().describe('Room creation details returned when successful, containing room name, purpose, and participant information.')
});

// Analyze Coordination Patterns Response
export const AnalyzeCoordinationPatternsResponseSchema = z.object({
  success: z.boolean().describe('Whether the coordination pattern analysis completed successfully. True if analysis was performed and patterns were identified.'),
  message: z.string().describe('Human-readable description of the analysis result, including summary of patterns found.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the coordination analysis was completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to complete the pattern analysis in milliseconds.'),
  data: z.object({
    total_rooms: z.number().describe('Total number of communication rooms in the repository.'),
    active_rooms: z.number().describe('Number of currently active (not closed) rooms.'),
    recommendations: z.array(z.string()).describe('Array of recommendations for improving coordination based on the analysis patterns.')
  }).optional().describe('Coordination analysis details returned when successful, containing room statistics and improvement recommendations.')
});

// Broadcast Message To Agents Response
export const BroadcastMessageToAgentsResponseSchema = z.object({
  success: z.boolean().describe('Whether the broadcast message operation completed successfully. True if all targeted agents received the message or were successfully resumed and messaged.'),
  message: z.string().describe('Human-readable description of the broadcast result, including delivery summary and any agent resumption details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the broadcast operation completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to complete the entire broadcast operation in milliseconds, including agent resumption and message delivery.'),
  data: z.object({
    total_agents: z.number().describe('Total number of agents that were targeted for the broadcast message.'),
    delivered_count: z.number().describe('Number of agents that successfully received the message.'),
    resumed_count: z.number().describe('Number of agents that were resumed from inactive state before message delivery.'),
    failed_count: z.number().describe('Number of agents that failed to receive the message or could not be resumed.'),
    delivery_results: z.array(z.object({
      agent_id: z.string().describe('ID of the agent targeted for message delivery.'),
      delivered: z.boolean().describe('Whether the message was successfully delivered to this agent.'),
      resumed: z.boolean().describe('Whether this agent was resumed from inactive state before message delivery.'),
      error: z.string().optional().describe('Error message if delivery or resumption failed for this agent.'),
      room_name: z.string().optional().describe('Name of the room where the message was delivered, if applicable.')
    })).describe('Array of delivery results for each individual agent, showing success/failure status and resumption details.'),
    message_content: z.string().describe('The original message content that was broadcast to all agents.'),
    priority: z.string().describe('Priority level of the broadcast message.'),
    message_type: z.string().describe('Type of message that was broadcast.')
  }).optional().describe('Broadcast message details returned when successful, containing delivery statistics, resumption results, and individual agent outcomes.')
});

// Export response types
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
export type WaitForMessagesResponse = z.infer<typeof WaitForMessagesResponseSchema>;
export type CloseRoomResponse = z.infer<typeof CloseRoomResponseSchema>;
export type DeleteRoomResponse = z.infer<typeof DeleteRoomResponseSchema>;
export type ListRoomsResponse = z.infer<typeof ListRoomsResponseSchema>;
export type ListRoomMessagesResponse = z.infer<typeof ListRoomMessagesResponseSchema>;
export type CreateDelayedRoomResponse = z.infer<typeof CreateDelayedRoomResponseSchema>;
export type AnalyzeCoordinationPatternsResponse = z.infer<typeof AnalyzeCoordinationPatternsResponseSchema>;
export type BroadcastMessageToAgentsResponse = z.infer<typeof BroadcastMessageToAgentsResponseSchema>;