import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { Logger } from '../utils/logger.js';
import { pathResolver } from '../utils/pathResolver.js';
import {
  allTables,
  agentSessions,
  objectives,
  objectiveDependencies,
  memories,
  chatRooms,
  chatMessages,
  documentationSources,
  scrapeJobs,
  websites,
  websitePages,
  errorLogs,
  toolCallLogs,
  projects,
} from '../schemas/index.js';

export interface DatabaseConfig {
  path?: string;
  wal?: boolean;
  timeout?: number;
  verbose?: boolean;
  maxConnections?: number;
  busyTimeoutMs?: number;
  checkpointIntervalMs?: number;
  connectionPoolSize?: number;
  enableConnectionPooling?: boolean;
}

// Connection pool for managing multiple database connections
class ConnectionPool {
  private connections: Database.Database[] = [];
  private availableConnections: Database.Database[] = [];
  private busyConnections = new Set<Database.Database>();
  private readonly maxConnections: number;
  private readonly dbPath: string;
  private readonly config: DatabaseConfig;
  private readonly logger: Logger;

  constructor(dbPath: string, config: DatabaseConfig, logger: Logger) {
    this.dbPath = dbPath;
    this.config = config;
    this.logger = logger;
    this.maxConnections = config.connectionPoolSize || 5;
  }

  async getConnection(): Promise<Database.Database> {
    // Try to get an available connection first
    if (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;
      this.busyConnections.add(conn);
      return conn;
    }

    // Create new connection if under limit
    if (this.connections.length < this.maxConnections) {
      const conn = this.createConnection();
      this.connections.push(conn);
      this.busyConnections.add(conn);
      return conn;
    }

    // Wait for a connection to become available
    return new Promise((resolve) => {
      const checkForConnection = () => {
        if (this.availableConnections.length > 0) {
          const conn = this.availableConnections.pop()!;
          this.busyConnections.add(conn);
          resolve(conn);
        } else {
          setTimeout(checkForConnection, 10);
        }
      };
      checkForConnection();
    });
  }

  releaseConnection(connection: Database.Database): void {
    if (this.busyConnections.has(connection)) {
      this.busyConnections.delete(connection);
      this.availableConnections.push(connection);
    }
  }

  private createConnection(): Database.Database {
    const conn = new Database(this.dbPath, {
      verbose: this.config.verbose ? ((message?: unknown) => this.logger.debug(String(message))) : undefined,
      timeout: this.config.timeout,
      fileMustExist: false,
    });

    this.initializeConnectionPragmas(conn);
    return conn;
  }

  private initializeConnectionPragmas(connection: Database.Database): void {
    try {
      // Enhanced WAL configuration for maximum concurrency
      if (this.config.wal) {
        connection.pragma('journal_mode = WAL');
        connection.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
        connection.pragma('wal_checkpoint_timeout = 10000'); // 10 second timeout
        connection.pragma('wal_synchronous = NORMAL'); // Balance safety and performance
      }
      
      // Critical concurrency settings with optimized values
      connection.pragma(`busy_timeout = ${this.config.busyTimeoutMs || 30000}`);
      connection.pragma('synchronous = NORMAL'); // NORMAL instead of FULL for better performance
      connection.pragma('cache_size = -131072'); // 128MB cache (larger for better performance)
      connection.pragma('temp_store = MEMORY');
      connection.pragma('foreign_keys = ON');
      
      // Enhanced performance optimizations for concurrency
      connection.pragma('mmap_size = 536870912'); // 512MB memory-mapped I/O (increased)
      connection.pragma('page_size = 4096'); // Optimal page size
      connection.pragma('cache_spill = OFF'); // Keep cache in memory
      connection.pragma('locking_mode = NORMAL'); // Allow shared access (crucial for concurrency)
      
      // Additional concurrency improvements
      connection.pragma('read_uncommitted = ON'); // Allow dirty reads for better concurrency
      connection.pragma('recursive_triggers = ON');
      connection.pragma('defer_foreign_keys = ON'); // Defer FK checks to end of transaction
      connection.pragma('optimize'); // Auto-optimize statistics

      this.logger.debug('Connection-level SQLite pragmas configured', {
        connectionId: connection.name || 'unnamed',
        walMode: this.config.wal,
        busyTimeout: this.config.busyTimeoutMs,
        cacheSize: '128MB',
        mmapSize: '512MB'
      });
    } catch (error) {
      this.logger.error('Failed to configure connection pragmas', error);
      throw error;
    }
  }

  close(): void {
    [...this.connections].forEach(conn => {
      try {
        conn.close();
      } catch (error) {
        this.logger.warn('Error closing connection', error);
      }
    });
    this.connections.length = 0;
    this.availableConnections.length = 0;
    this.busyConnections.clear();
  }

  getStats() {
    return {
      total: this.connections.length,
      available: this.availableConnections.length,
      busy: this.busyConnections.size,
      maxConnections: this.maxConnections
    };
  }
}

export class DatabaseManager {
  private sqlite: Database.Database;
  private drizzleDb: BetterSQLite3Database<typeof allTables>;
  private connectionPool?: ConnectionPool;
  private initialized = false;
  private logger: Logger;
  private dbPath: string;
  private config: DatabaseConfig;
  private isMainProcess: boolean;
  private checkpointInterval?: NodeJS.Timeout;

  constructor(config: DatabaseConfig = {}) {
    this.logger = new Logger('drizzle-manager');
    this.config = {
      wal: true,
      timeout: 30000,
      busyTimeoutMs: 30000,
      checkpointIntervalMs: 60000, // 1 minute
      connectionPoolSize: 5,
      enableConnectionPooling: true,
      ...config
    };
    
    this.dbPath = config.path || pathResolver.getDatabasePath();
    this.isMainProcess = process.env.MCP_MAIN_PROCESS === 'true' || !process.env.MCP_AGENT_ID;
    
    // Ensure database directory exists (XDG-compliant)
    const dbDir = dirname(this.dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    try {
      // Initialize connection pool if enabled
      if (this.config.enableConnectionPooling) {
        this.connectionPool = new ConnectionPool(this.dbPath, this.config, this.logger);
        this.logger.info('Connection pooling enabled', { 
          poolSize: this.config.connectionPoolSize,
          isMainProcess: this.isMainProcess
        });
      }

      this.sqlite = new Database(this.dbPath, {
        verbose: config.verbose ? ((message?: unknown) => this.logger.debug(String(message))) : undefined,
        timeout: this.config.timeout,
        fileMustExist: false,
      });

      this.initializePragmas();
      
      // Initialize Drizzle with all table schemas
      this.drizzleDb = drizzle(this.sqlite, { 
        schema: allTables,
        logger: config.verbose ? {
          logQuery: (query: string, params?: unknown[]) => {
            this.logger.debug('SQL Query', { query, params });
          }
        } : false
      });

      this.logger.info('DrizzleManager initialized successfully', { 
        dbPath: this.dbPath,
        isMainProcess: this.isMainProcess,
        walMode: this.config.wal,
        connectionPoolingEnabled: this.config.enableConnectionPooling,
        poolSize: this.config.connectionPoolSize
      });
    } catch (error) {
      this.logger.error('Failed to initialize DrizzleManager', error);
      throw error;
    }
  }


  private initializePragmas(): void {
    try {
      // Enhanced WAL configuration for maximum concurrency
      if (this.config.wal) {
        this.sqlite.pragma('journal_mode = WAL');
        this.logger.debug('Enabled WAL mode');
        
        // WAL-specific optimizations for multi-process access
        this.sqlite.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
        this.sqlite.pragma('wal_checkpoint_timeout = 10000'); // 10 second timeout
        this.sqlite.pragma('wal_synchronous = NORMAL'); // Balance safety and performance
      }
      
      // Critical concurrency settings with optimized values
      this.sqlite.pragma(`busy_timeout = ${this.config.busyTimeoutMs}`);
      this.sqlite.pragma('synchronous = NORMAL'); // NORMAL instead of FULL for better performance
      this.sqlite.pragma('cache_size = -131072'); // 128MB cache (larger for better performance)
      this.sqlite.pragma('temp_store = MEMORY');
      this.sqlite.pragma('foreign_keys = ON');
      
      // Enhanced performance optimizations for concurrency
      this.sqlite.pragma('mmap_size = 536870912'); // 512MB memory-mapped I/O (increased)
      this.sqlite.pragma('page_size = 4096'); // Optimal page size
      this.sqlite.pragma('cache_spill = OFF'); // Keep cache in memory
      this.sqlite.pragma('locking_mode = NORMAL'); // Allow shared access (crucial for concurrency)
      
      // Additional concurrency improvements
      this.sqlite.pragma('read_uncommitted = ON'); // Allow dirty reads for better concurrency
      this.sqlite.pragma('recursive_triggers = ON');
      this.sqlite.pragma('defer_foreign_keys = ON'); // Defer FK checks to end of transaction
      this.sqlite.pragma('optimize'); // Auto-optimize statistics
      
      this.logger.debug('SQLite pragmas configured for enhanced concurrency', {
        walMode: this.config.wal,
        busyTimeout: this.config.busyTimeoutMs,
        cacheSize: '128MB',
        mmapSize: '512MB',
        lockingMode: 'NORMAL'
      });
    } catch (error) {
      this.logger.error('Failed to configure SQLite pragmas', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Verify database connectivity
      await this.verifyConnection();
      
      // Start periodic WAL checkpointing for main process
      if (this.isMainProcess && this.config.wal && this.config.checkpointIntervalMs) {
        this.startPeriodicCheckpointing();
      }
      
      this.initialized = true;
      this.logger.info('DrizzleManager initialization completed', {
        isMainProcess: this.isMainProcess,
        checkpointingEnabled: !!(this.isMainProcess && this.config.wal)
      });
    } catch (error) {
      this.logger.error('Failed to initialize DrizzleManager', error);
      throw error;
    }
  }

  private findDrizzleConfig(): string | null {
    // Use the path resolver to get the correct config path
    const configPath = pathResolver.getDrizzleConfigPath();
    
    if (existsSync(configPath)) {
      this.logger.debug(`Found drizzle config at: ${configPath}`);
      return configPath;
    }
    
    this.logger.debug('No drizzle config found, using default');
    return null;
  }

  private detectPackageManager(): string {
    // Check for package manager lock files first
    const toolRoot = pathResolver.getToolRoot();
    
    if (existsSync(join(toolRoot, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(join(toolRoot, 'bun.lockb'))) {
      return 'bun';
    }
    if (existsSync(join(toolRoot, 'yarn.lock'))) {
      return 'yarn';
    }
    if (existsSync(join(toolRoot, 'package-lock.json'))) {
      return 'npm';
    }
    
    // Check package.json packageManager field
    try {
      const packagePath = join(toolRoot, 'package.json');
      if (existsSync(packagePath)) {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
        if (pkg.packageManager) {
          if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
          if (pkg.packageManager.startsWith('bun')) return 'bun';
          if (pkg.packageManager.startsWith('yarn')) return 'yarn';
        }
      }
    } catch {}
    
    // Check environment variables
    if (process.env.npm_config_user_agent) {
      const userAgent = process.env.npm_config_user_agent;
      if (userAgent.includes('pnpm')) return 'pnpm';
      if (userAgent.includes('bun')) return 'bun';
      if (userAgent.includes('yarn')) return 'yarn';
    }
    
    // Default to npm
    return 'npm';
  }




  // Synchronous transaction wrapper with better retry logic and deadlock prevention
  transaction<T>(fn: (db: BetterSQLite3Database<typeof allTables>) => T, retries = 5): T {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Use immediate transaction for better concurrency
        return this.drizzleDb.transaction((tx) => {
          return fn(tx);
        });
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries && this.isRetryableError(error)) {
          // Exponential backoff with jitter to prevent thundering herd
          const baseDelay = Math.min(50 * Math.pow(2, attempt), 2000);
          const jitter = Math.random() * 100;
          const delay = baseDelay + jitter;
          
          this.logger.warn(`Transaction failed, retrying in ${Math.round(delay)}ms`, { 
            attempt: attempt + 1, 
            totalAttempts: retries + 1,
            error: (error as Error).message,
            errorCode: this.getErrorCode(error)
          });
          
          // Synchronous sleep for better-sqlite3 compatibility
          this.sleep(delay);
          continue;
        }
        break;
      }
    }
    
    this.logger.error('Transaction failed after all retries', {
      attempts: retries + 1,
      finalError: lastError?.message,
      errorCode: lastError ? this.getErrorCode(lastError) : 'unknown'
    });
    throw lastError || new Error('Transaction failed with unknown error');
  }

  // Async transaction wrapper that uses connection pooling
  async transactionAsync<T>(fn: (db: BetterSQLite3Database<typeof allTables>) => T, retries = 5): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Use Promise wrapper to make it properly async
        return await new Promise<T>((resolve, reject) => {
          try {
            const result = this.drizzleDb.transaction((tx) => {
              return fn(tx);
            });
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries && this.isRetryableError(error)) {
          // Exponential backoff with jitter to prevent thundering herd
          const baseDelay = Math.min(50 * Math.pow(2, attempt), 2000);
          const jitter = Math.random() * 100;
          const delay = baseDelay + jitter;
          
          this.logger.warn(`Async transaction failed, retrying in ${Math.round(delay)}ms`, { 
            attempt: attempt + 1, 
            totalAttempts: retries + 1,
            error: (error as Error).message,
            errorCode: this.getErrorCode(error)
          });
          
          // Non-blocking async delay
          await this.asyncSleep(delay);
          continue;
        }
        break;
      }
    }
    
    this.logger.error('Async transaction failed after all retries', {
      attempts: retries + 1,
      finalError: lastError?.message,
      errorCode: lastError ? this.getErrorCode(lastError) : 'unknown'
    });
    throw lastError || new Error('Async transaction failed with unknown error');
  }

  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || '';
    
    // SQLite error codes that are retryable
    const retryableCodes = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_PROTOCOL'];
    
    return retryableCodes.includes(code) ||
           message.includes('database is locked') || 
           message.includes('busy') || 
           message.includes('timeout') ||
           message.includes('deadlock') ||
           message.includes('lock timeout') ||
           message.includes('cannot commit');
  }
  
  private getErrorCode(error: any): string {
    return error.code || error.errno || 'UNKNOWN';
  }
  
  private sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait for synchronous sleep in Node.js
    }
  }

  private async asyncSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private async verifyConnection(): Promise<void> {
    try {
      const result = this.sqlite.prepare('SELECT 1 as test').get() as { test: number };
      if (result.test !== 1) {
        throw new Error('Database connectivity test failed');
      }
      this.logger.debug('Database connection verified');
    } catch (error) {
      this.logger.error('Database connection verification failed', error);
      throw error;
    }
  }
  
  private startPeriodicCheckpointing(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
    
    this.checkpointInterval = setInterval(() => {
      try {
        this.checkpointWal();
      } catch (error) {
        this.logger.warn('Periodic WAL checkpoint failed', error);
      }
    }, this.config.checkpointIntervalMs);
    
    this.logger.debug('Started periodic WAL checkpointing', {
      intervalMs: this.config.checkpointIntervalMs
    });
  }
  
  private checkpointWal(): void {
    try {
      const result = this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      this.logger.debug('WAL checkpoint completed', { result });
    } catch (error) {
      this.logger.warn('WAL checkpoint failed', error);
    }
  }

  // Backward compatibility methods
  get database(): Database.Database {
    return this.sqlite;
  }

  get db(): Database.Database {
    return this.sqlite;
  }

  get drizzle(): BetterSQLite3Database<typeof allTables> {
    return this.drizzleDb;
  }

  get useDrizzle(): boolean {
    return true; // DrizzleManager always uses Drizzle
  }

  getMigrations(): Array<{ version: string; sql: string }> {
    // Return empty array since DrizzleManager handles migrations differently
    return [];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Schema migration helpers
  async runSchemaMigration(migrationSql: string, version: string): Promise<void> {
    try {
      this.logger.info(`Running schema migration: ${version}`);
      
      // Check if migration already applied
      const existingMigration = this.sqlite
        .prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?')
        .get(version);
      
      if (existingMigration) {
        this.logger.info(`Migration ${version} already applied, skipping`);
        return;
      }

      // Run the migration within a transaction
      this.transaction((tx) => {
        tx.run(sql.raw(migrationSql));
        // Mark migration as applied
        this.sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run(version, Date.now());
      });

      this.logger.info(`Schema migration ${version} completed successfully`);
    } catch (error) {
      this.logger.error(`Schema migration ${version} failed`, error);
      throw error;
    }
  }

  async getAppliedMigrations(): Promise<string[]> {
    try {
      const migrations = this.sqlite
        .prepare('SELECT hash FROM __drizzle_migrations ORDER BY created_at')
        .all() as Array<{ hash: string }>;
      
      return migrations.map(m => m.hash);
    } catch (error) {
      this.logger.debug('No migrations table found or error reading migrations', error);
      return [];
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
    try {
      // Test basic connectivity
      const result = this.sqlite.prepare('SELECT 1 as test').get() as { test: number };
      
      if (result.test !== 1) {
        throw new Error('Basic connectivity test failed');
      }

      // Check WAL mode
      const walMode = this.sqlite.pragma('journal_mode', { simple: true }) as string;
      
      // Check foreign keys
      const foreignKeys = this.sqlite.pragma('foreign_keys', { simple: true }) as number;

      return {
        status: 'healthy',
        details: {
          initialized: this.initialized,
          walMode,
          foreignKeysEnabled: foreignKeys === 1,
        }
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
          initialized: this.initialized,
        }
      };
    }
  }

  // Connection pool management methods
  async getPooledConnection(): Promise<Database.Database> {
    if (!this.connectionPool) {
      throw new Error('Connection pooling is not enabled');
    }
    return await this.connectionPool.getConnection();
  }

  releasePooledConnection(connection: Database.Database): void {
    if (!this.connectionPool) {
      this.logger.warn('Attempted to release connection when pooling is not enabled');
      return;
    }
    this.connectionPool.releaseConnection(connection);
  }

  getConnectionPoolStats() {
    if (!this.connectionPool) {
      return { enabled: false };
    }
    return { enabled: true, ...this.connectionPool.getStats() };
  }

  // Enhanced transaction wrapper using connection pooling when available
  async transactionWithPool<T>(fn: (db: BetterSQLite3Database<typeof allTables>) => T | Promise<T>, retries = 5): Promise<T> {
    if (!this.config.enableConnectionPooling || !this.connectionPool) {
      // Fall back to regular transaction if pooling is disabled
      return this.transaction(fn, retries);
    }

    let connection: Database.Database | null = null;
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        connection = await this.connectionPool.getConnection();
        const pooledDrizzle = drizzle(connection, { schema: allTables });
        
        const result = await new Promise<T>((resolve, reject) => {
          try {
            const txResult = pooledDrizzle.transaction((tx) => {
              return fn(tx);
            });
            resolve(txResult);
          } catch (error) {
            reject(error);
          }
        });
        
        this.connectionPool.releaseConnection(connection);
        return result;
      } catch (error) {
        if (connection) {
          this.connectionPool.releaseConnection(connection);
        }
        
        lastError = error as Error;
        
        if (attempt < retries && this.isRetryableError(error)) {
          const baseDelay = Math.min(50 * Math.pow(2, attempt), 2000);
          const jitter = Math.random() * 100;
          const delay = baseDelay + jitter;
          
          this.logger.warn(`Pooled transaction failed, retrying in ${Math.round(delay)}ms`, { 
            attempt: attempt + 1, 
            totalAttempts: retries + 1,
            error: (error as Error).message,
            errorCode: this.getErrorCode(error)
          });
          
          await this.asyncSleep(delay);
          continue;
        }
        break;
      }
    }
    
    this.logger.error('Pooled transaction failed after all retries', {
      attempts: retries + 1,
      finalError: lastError?.message,
      errorCode: lastError ? this.getErrorCode(lastError) : 'unknown'
    });
    throw lastError || new Error('Pooled transaction failed with unknown error');
  }

  close(): void {
    try {
      this.logger.info('Closing DrizzleManager...');
      
      // Stop periodic checkpointing
      if (this.checkpointInterval) {
        clearInterval(this.checkpointInterval);
        this.checkpointInterval = undefined;
      }
      
      // Final WAL checkpoint before closing
      if (this.config.wal && this.isMainProcess) {
        try {
          this.checkpointWal();
        } catch (error) {
          this.logger.warn('Final WAL checkpoint failed during close', error);
        }
      }
      
      // Close connection pool
      if (this.connectionPool) {
        this.connectionPool.close();
        this.logger.info('Connection pool closed');
      }
      
      this.sqlite.close();
      this.initialized = false;
      this.logger.info('DrizzleManager closed successfully');
    } catch (error) {
      this.logger.error('Error closing DrizzleManager', error);
    }
  }
}

// Connection singleton for shared database access
class DatabaseConnectionManager {
  private static instance: DatabaseManager | null = null;
  private static isInitializing = false;
  private static initPromise: Promise<DatabaseManager> | null = null;
  
  static async getInstance(config?: DatabaseConfig): Promise<DatabaseManager> {
    // If we already have an instance, return it
    if (DatabaseConnectionManager.instance && DatabaseConnectionManager.instance.isInitialized()) {
      return DatabaseConnectionManager.instance;
    }
    
    // If we're already initializing, wait for it
    if (DatabaseConnectionManager.isInitializing && DatabaseConnectionManager.initPromise) {
      return await DatabaseConnectionManager.initPromise;
    }
    
    // Initialize new instance
    DatabaseConnectionManager.isInitializing = true;
    DatabaseConnectionManager.initPromise = this.createInstance(config);
    
    try {
      DatabaseConnectionManager.instance = await DatabaseConnectionManager.initPromise;
      return DatabaseConnectionManager.instance;
    } finally {
      DatabaseConnectionManager.isInitializing = false;
      DatabaseConnectionManager.initPromise = null;
    }
  }
  
  private static async createInstance(config?: DatabaseConfig): Promise<DatabaseManager> {
    const instance = new DatabaseManager(config);
    await instance.initialize();
    return instance;
  }
  
  static reset(): void {
    if (DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance.close();
      DatabaseConnectionManager.instance = null;
    }
    DatabaseConnectionManager.isInitializing = false;
    DatabaseConnectionManager.initPromise = null;
  }
}

// Export for shared database access
export { DatabaseConnectionManager };

// Export a default instance for convenience
export default DatabaseManager;