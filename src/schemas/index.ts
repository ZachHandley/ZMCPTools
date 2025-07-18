// Export all Zod v4 + Drizzle schemas
export * from './agents';
export * from './communication';
export * from './logs';
export * from './memories';
export * from './scraping';
export * from './objectives';
export * from './plans';
export * from './knowledge-graph';
export * from './projects';

// Re-export commonly used types for convenience
export type {
  // Memory types
  Memory,
  NewMemory,
  MemoryUpdate,
  MemoryType,
  MemoryCategory,
  MemorySearch,
} from './memories';

export type {
  // Agent types  
  AgentSession,
  NewAgentSession,
  AgentSessionUpdate,
  AgentStatus,
  AgentFilter,
  AgentHeartbeat,
} from './agents';

export type {
  // Objective types
  Objective,
  NewObjective,
  ObjectiveUpdate,
  ObjectiveDependency,
  NewObjectiveDependency,
  ObjectiveType,
  ObjectiveStatus,
  DependencyType,
  ObjectiveFilter,
  ObjectiveCreateRequest,
} from './objectives';

export type {
  // Plan types
  Plan,
  NewPlan,
  PlanUpdate,
  PlanSection,
  PlanMetadata,
  PlanStatus,
  PlanPriority,
  SectionType,
  PlanFilter,
  PlanCreateRequest,
  PlanSectionUpdate,
  PlanObjectiveUpdate,
} from './plans';

export type {
  // Communication types
  ChatRoom,
  NewChatRoom,
  ChatRoomUpdate,
  ChatMessage,
  NewChatMessage,
  RoomParticipant,
  NewRoomParticipant,
  RoomParticipantUpdate,
  MessageType,
  ParticipantStatus,
  MessageFilter,
  ParticipantFilter,
  RoomJoinRequest,
  SendMessageRequest,
  WaitForMessagesRequest,
  AddParticipantRequest,
  UpdateParticipantRequest,
  // Cleanup and maintenance types
  StaleRoomInfo,
  RoomActivityStats,
  CleanupConfiguration,
  CleanupError,
  AgentCleanupResult,
  RoomCleanupResult,
  ComprehensiveCleanupResult,
} from './communication';

export type {
  // Scraping types
  DocumentationSource,
  NewDocumentationSource,
  DocumentationSourceUpdate,
  ScrapeJob,
  NewScrapeJob,
  ScrapeJobUpdate,
  Website,
  NewWebsite,
  WebsiteUpdate,
  WebsitePage,
  NewWebsitePage,
  WebsitePageUpdate,
  SourceType,
  UpdateFrequency,
  ScrapeJobStatus,
  DocumentationStatus,
  ScrapeDocumentationRequest,
  SearchDocumentationRequest,
  ScrapeJobFilter,
} from './scraping';

export type {
  // Log types
  ErrorLog,
  NewErrorLog,
  ErrorLogUpdate,
  ToolCallLog,
  NewToolCallLog,
  ErrorType,
  ErrorCategory,
  ResolutionStatus,
  Severity,
  ToolCallStatus,
  ErrorLogFilter,
  ToolCallLogFilter,
  LogErrorRequest,
  LogToolCallRequest,
} from './logs';

export type {
  // Knowledge graph types
  KnowledgeEntity,
  NewKnowledgeEntity,
  KnowledgeEntityUpdate,
  KnowledgeRelationship,
  NewKnowledgeRelationship,
  KnowledgeRelationshipUpdate,
  KnowledgeInsight,
  NewKnowledgeInsight,
  EntityType,
  RelationshipType,
  Confidence,
  KnowledgeSearch,
  EntityFilter,
  RelationshipFilter,
} from './knowledge-graph';

export type {
  // Project types
  Project,
  NewProject,
  ProjectUpdate,
  ProjectStatus,
  McpServerType,
  ProjectRegistration,
  ProjectHeartbeat,
  ProjectFilter,
} from './projects';


// Re-export schemas for validation
export {
  // Memory schemas
  memoryTypeSchema,
  memoryCategorySchema,
  memoryTagsSchema,
  memoryContextSchema,
  memoryMiscDataSchema,
  insertMemorySchema,
  selectMemorySchema,
  updateMemorySchema,
  memorySearchSchema,
} from './memories';

export {
  // Agent schemas
  agentStatusSchema,
  agentCapabilitiesSchema,
  agentMetadataSchema,
  insertAgentSessionSchema,
  selectAgentSessionSchema,
  updateAgentSessionSchema,
  agentFilterSchema,
  agentHeartbeatSchema,
} from './agents';

export {
  // Objective schemas
  objectiveTypeSchema,
  objectiveStatusSchema,
  dependencyTypeSchema,
  objectiveRequirementsSchema,
  objectiveResultsSchema,
  insertObjectiveSchema,
  selectObjectiveSchema,
  updateObjectiveSchema,
  insertObjectiveDependencySchema,
  selectObjectiveDependencySchema,
  objectiveFilterSchema,
  objectiveCreateRequestSchema,
} from './objectives';

export {
  // Plan schemas
  planStatusSchema,
  planPrioritySchema,
  sectionTypeSchema,
  planSectionSchema,
  planMetadataSchema,
  insertPlanSchema,
  selectPlanSchema,
  updatePlanSchema,
  planFilterSchema,
  planCreateRequestSchema,
  planSectionUpdateSchema,
  planObjectiveUpdateSchema,
} from './plans';

export {
  // Communication schemas
  messageTypeSchema,
  participantStatusSchema,
  roomMetadataSchema,
  messageMentionsSchema,
  participantMetadataSchema,
  insertChatRoomSchema,
  selectChatRoomSchema,
  updateChatRoomSchema,
  insertChatMessageSchema,
  selectChatMessageSchema,
  insertRoomParticipantSchema,
  selectRoomParticipantSchema,
  updateRoomParticipantSchema,
  messageFilterSchema,
  participantFilterSchema,
  roomJoinRequestSchema,
  sendMessageRequestSchema,
  waitForMessagesRequestSchema,
  addParticipantRequestSchema,
  updateParticipantRequestSchema,
} from './communication';

export {
  // Scraping schemas
  sourceTypeSchema,
  updateFrequencySchema,
  scrapeJobStatusSchema,
  documentationStatusSchema,
  selectorsSchema,
  allowPatternsSchema,
  ignorePatternsSchema,
  sourceMetadataSchema,
  jobDataSchema,
  resultDataSchema,
  insertDocumentationSourceSchema,
  selectDocumentationSourceSchema,
  updateDocumentationSourceSchema,
  insertScrapeJobSchema,
  selectScrapeJobSchema,
  updateScrapeJobSchema,
  insertWebsiteSchema,
  selectWebsiteSchema,
  updateWebsiteSchema,
  insertWebsitePageSchema,
  selectWebsitePageSchema,
  updateWebsitePageSchema,
  scrapeDocumentationRequestSchema,
  searchDocumentationRequestSchema,
  scrapeJobFilterSchema,
} from './scraping';

export {
  // Log schemas
  errorTypeSchema,
  errorCategorySchema,
  resolutionStatusSchema,
  severitySchema,
  toolCallStatusSchema,
  errorContextSchema,
  errorEnvironmentSchema,
  toolParametersSchema,
  toolResultSchema,
  insertErrorLogSchema,
  selectErrorLogSchema,
  updateErrorLogSchema,
  insertToolCallLogSchema,
  selectToolCallLogSchema,
  errorLogFilterSchema,
  toolCallLogFilterSchema,
  logErrorRequestSchema,
  logToolCallRequestSchema,
} from './logs';

export {
  // Knowledge graph schemas
  entityTypeSchema,
  relationshipTypeSchema,
  confidenceSchema,
  entityPropertiesSchema,
  relationshipPropertiesSchema,
  insertKnowledgeEntitySchema,
  selectKnowledgeEntitySchema,
  updateKnowledgeEntitySchema,
  insertKnowledgeRelationshipSchema,
  selectKnowledgeRelationshipSchema,
  updateKnowledgeRelationshipSchema,
  insertKnowledgeInsightSchema,
  selectKnowledgeInsightSchema,
  updateKnowledgeInsightSchema,
  knowledgeSearchSchema,
  entityFilterSchema,
  relationshipFilterSchema,
} from './knowledge-graph';

export {
  // Project schemas
  projectStatusSchema,
  mcpServerTypeSchema,
  projectMetadataSchema,
  insertProjectSchema,
  selectProjectSchema,
  updateProjectSchema,
  projectRegistrationSchema,
  projectHeartbeatSchema,
  projectFilterSchema,
} from './projects';


// Re-export Drizzle table definitions
export { memories } from './memories';
export { agentSessions } from './agents';
export { objectives, objectiveDependencies } from './objectives';
export { plans } from './plans';
export { chatRooms, chatMessages, roomParticipants } from './communication';
export { documentationSources, scrapeJobs, websites, websitePages } from './scraping';
export { errorLogs, toolCallLogs } from './logs';
export { knowledgeEntities, knowledgeRelationships, knowledgeInsights } from './knowledge-graph';
export { projects } from './projects';

// Import tables and schemas for collections
import { 
  memories, 
  insertMemorySchema, 
  selectMemorySchema, 
  updateMemorySchema 
} from './memories';
import { 
  agentSessions, 
  insertAgentSessionSchema, 
  selectAgentSessionSchema, 
  updateAgentSessionSchema 
} from './agents';
import { 
  objectives, 
  objectiveDependencies, 
  insertObjectiveSchema, 
  selectObjectiveSchema, 
  updateObjectiveSchema,
  insertObjectiveDependencySchema,
  selectObjectiveDependencySchema
} from './objectives';
import {
  plans,
  insertPlanSchema,
  selectPlanSchema,
  updatePlanSchema
} from './plans';
import { 
  chatRooms, 
  chatMessages,
  roomParticipants,
  insertChatRoomSchema, 
  selectChatRoomSchema, 
  updateChatRoomSchema,
  insertChatMessageSchema,
  selectChatMessageSchema,
  insertRoomParticipantSchema,
  selectRoomParticipantSchema,
  updateRoomParticipantSchema
} from './communication';
import { 
  documentationSources, 
  scrapeJobs, 
  websites,
  websitePages,
  insertDocumentationSourceSchema,
  selectDocumentationSourceSchema,
  updateDocumentationSourceSchema,
  insertScrapeJobSchema,
  selectScrapeJobSchema,
  updateScrapeJobSchema,
  insertWebsiteSchema,
  selectWebsiteSchema,
  updateWebsiteSchema,
  insertWebsitePageSchema,
  selectWebsitePageSchema,
  updateWebsitePageSchema
} from './scraping';
import { 
  errorLogs, 
  toolCallLogs,
  insertErrorLogSchema,
  selectErrorLogSchema,
  updateErrorLogSchema,
  insertToolCallLogSchema,
  selectToolCallLogSchema
} from './logs';
import {
  knowledgeEntities,
  knowledgeRelationships,
  knowledgeInsights,
  insertKnowledgeEntitySchema,
  selectKnowledgeEntitySchema,
  updateKnowledgeEntitySchema,
  insertKnowledgeRelationshipSchema,
  selectKnowledgeRelationshipSchema,
  updateKnowledgeRelationshipSchema,
  insertKnowledgeInsightSchema,
  selectKnowledgeInsightSchema,
  updateKnowledgeInsightSchema
} from './knowledge-graph';
import {
  projects,
  insertProjectSchema,
  selectProjectSchema,
  updateProjectSchema
} from './projects';

// Database schema collections for easier management
export const allTables = {
  // Core tables
  agentSessions,
  objectives,
  objectiveDependencies,
  plans,
  memories,
  projects,
  
  // Communication tables  
  chatRooms,
  chatMessages,
  roomParticipants,
  
  // Scraping tables
  documentationSources,
  scrapeJobs,
  websites,
  websitePages,
  
  // Log tables
  errorLogs,
  toolCallLogs,
  
  // Knowledge graph tables
  knowledgeEntities,
  knowledgeRelationships,
  knowledgeInsights,
} as const;

// Schema validation collections
export const insertSchemas = {
  agentSessions: insertAgentSessionSchema,
  objectives: insertObjectiveSchema,
  objectiveDependencies: insertObjectiveDependencySchema,
  plans: insertPlanSchema,
  memories: insertMemorySchema,
  projects: insertProjectSchema,
  chatRooms: insertChatRoomSchema,
  chatMessages: insertChatMessageSchema,
  roomParticipants: insertRoomParticipantSchema,
  documentationSources: insertDocumentationSourceSchema,
  scrapeJobs: insertScrapeJobSchema,
  websites: insertWebsiteSchema,
  websitePages: insertWebsitePageSchema,
  errorLogs: insertErrorLogSchema,
  toolCallLogs: insertToolCallLogSchema,
  knowledgeEntities: insertKnowledgeEntitySchema,
  knowledgeRelationships: insertKnowledgeRelationshipSchema,
  knowledgeInsights: insertKnowledgeInsightSchema,
} as const;

export const selectSchemas = {
  agentSessions: selectAgentSessionSchema,
  objectives: selectObjectiveSchema,
  objectiveDependencies: selectObjectiveDependencySchema,
  plans: selectPlanSchema,
  memories: selectMemorySchema,
  projects: selectProjectSchema,
  chatRooms: selectChatRoomSchema,
  chatMessages: selectChatMessageSchema,
  roomParticipants: selectRoomParticipantSchema,
  documentationSources: selectDocumentationSourceSchema,
  scrapeJobs: selectScrapeJobSchema,
  websites: selectWebsiteSchema,
  websitePages: selectWebsitePageSchema,
  errorLogs: selectErrorLogSchema,
  toolCallLogs: selectToolCallLogSchema,
  knowledgeEntities: selectKnowledgeEntitySchema,
  knowledgeRelationships: selectKnowledgeRelationshipSchema,
  knowledgeInsights: selectKnowledgeInsightSchema,
} as const;

export const updateSchemas = {
  agentSessions: updateAgentSessionSchema,
  objectives: updateObjectiveSchema,
  plans: updatePlanSchema,
  memories: updateMemorySchema,
  projects: updateProjectSchema,
  chatRooms: updateChatRoomSchema,
  roomParticipants: updateRoomParticipantSchema,
  documentationSources: updateDocumentationSourceSchema,
  scrapeJobs: updateScrapeJobSchema,
  websites: updateWebsiteSchema,
  websitePages: updateWebsitePageSchema,
  errorLogs: updateErrorLogSchema,
  knowledgeEntities: updateKnowledgeEntitySchema,
  knowledgeRelationships: updateKnowledgeRelationshipSchema,
  knowledgeInsights: updateKnowledgeInsightSchema,
} as const;

// Database constants
export const DATABASE_CONSTANTS = {
  // Default values
  DEFAULT_AGENT_STATUS: 'active' as const,
  DEFAULT_OBJECTIVE_STATUS: 'pending' as const,
  DEFAULT_MEMORY_CONFIDENCE: 0.8,
  DEFAULT_MEMORY_RELEVANCE: 1.0,
  DEFAULT_MEMORY_USEFULNESS: 0.0,
  DEFAULT_MESSAGE_TYPE: 'standard' as const,
  DEFAULT_SCRAPE_MAX_PAGES: 200,
  DEFAULT_ERROR_SEVERITY: 'medium' as const,
  
  // Limits
  MAX_AGENT_NAME_LENGTH: 200,
  MAX_OBJECTIVE_DESCRIPTION_LENGTH: 2000,
  MAX_MEMORY_TITLE_LENGTH: 500,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_ERROR_MESSAGE_LENGTH: 2000,
  MAX_TOOL_NAME_LENGTH: 200,
  
  // Query limits
  DEFAULT_QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 1000,
  DEFAULT_MEMORY_SEARCH_LIMIT: 10,
  MAX_MEMORY_SEARCH_LIMIT: 100,
} as const;