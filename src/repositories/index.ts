// Base repository exports
export {
  BaseRepository,
  type DatabaseOperations,
  type RepositoryConfig,
  type ListOptions,
  type PaginatedResult,
  type QueryBuilder,
  RepositoryError,
  ValidationError,
  NotFoundError,
} from './BaseRepository.js';

// Re-export common Drizzle ORM utilities for repository implementations
export {
  eq,
  and,
  or,
  isNull,
  isNotNull,
  like,
  gt,
  gte,
  lt,
  lte,
  sql,
  desc,
  asc,
  count,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';

// Re-export table types for convenience
export type {
  SQLiteTable,
  SQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// Re-export schema types for repository implementations
export {
  allTables,
  insertSchemas,
  selectSchemas,
  updateSchemas,
  DATABASE_CONSTANTS,
} from '../schemas/index.js';

// Import types for helper function
import type { SQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { RepositoryConfig } from './BaseRepository.js';

// Example repository implementation helper function
export function createRepositoryConfig<TTable extends SQLiteTable>(
  table: TTable,
  primaryKey: SQLiteColumn,
  insertSchema: any,
  selectSchema: any,
  updateSchema: any,
  loggerCategory?: string
): RepositoryConfig<TTable> {
  return {
    table,
    primaryKey,
    insertSchema,
    selectSchema,
    updateSchema: updateSchema || insertSchema, // Fallback to insertSchema if updateSchema is problematic
    loggerCategory,
  };
}

// Repository implementations
export { MemoryRepository } from './MemoryRepository.js';
export { AgentRepository } from './AgentRepository.js';
export { ObjectiveRepository } from './ObjectiveRepository.js';
export { PlanRepository } from './PlanRepository.js';
export { CommunicationRepository } from './CommunicationRepository.js';
export { DocumentationRepository } from './DocumentationRepository.js';
export { ScrapeJobRepository } from './ScrapeJobRepository.js';
export { WebsiteRepository } from './WebsiteRepository.js';
export { WebsitePagesRepository } from './WebsitePagesRepository.js';
export { ToolCallLogRepository } from './ToolCallLogRepository.js';
export { ErrorLogRepository } from './ErrorLogRepository.js';
export { 
  KnowledgeEntityRepository,
  KnowledgeRelationshipRepository,
  KnowledgeInsightRepository
} from './KnowledgeGraphRepository.js';
export { ProjectRepository } from './ProjectRepository.js';

/**
 * Helper function to create a type-safe repository with full TypeScript support
 * 
 * Example usage:
 * ```typescript
 * import { agentSessions, insertAgentSessionSchema, selectAgentSessionSchema, updateAgentSessionSchema } from '../schemas/index.js';
 * 
 * class AgentRepository extends BaseRepository<
 *   typeof agentSessions,
 *   AgentSession,
 *   NewAgentSession,
 *   AgentSessionUpdate
 * > {
 *   constructor(drizzleManager: DatabaseManager) {
 *     super(drizzleManager, createRepositoryConfig(
 *       agentSessions,
 *       agentSessions.id,
 *       insertAgentSessionSchema,
 *       selectAgentSessionSchema,
 *       updateAgentSessionSchema,
 *       'agent-repository'
 *     ));
 *   }
 * 
 *   // Add custom methods specific to agents
 *   async findByRepositoryPath(repositoryPath: string): Promise<AgentSession[]> {
 *     return this.findByField('repositoryPath', repositoryPath);
 *   }
 * 
 *   async findActiveAgents(): Promise<AgentSession[]> {
 *     return this.query()
 *       .where(eq(agentSessions.status, 'active'))
 *       .orderBy(agentSessions.lastHeartbeat, 'desc')
 *       .execute();
 *   }
 * }
 * ```
 */