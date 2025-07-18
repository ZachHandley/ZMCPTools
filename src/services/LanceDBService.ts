/**
 * LanceDB Vector Search Service
 * Modern implementation using @lancedb/lancedb with proper embeddings
 * Based on LanceDB TypeScript API 2024/2025
 */

import * as lancedb from '@lancedb/lancedb';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Logger } from '../utils/logger.js';
import type { DatabaseManager } from '../database/index.js';
import { pipeline, env } from '@xenova/transformers';

export interface LanceDBConfig {
  dataPath?: string;
  embeddingProvider?: 'openai' | 'huggingface' | 'local';
  embeddingModel?: string;
  apiKey?: string;
  vectorDimension?: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  type?: 'text' | 'image' | 'audio' | 'video' | 'multimodal';
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  score: number;
  distance: number;
}

export interface Collection {
  name: string;
  count: number;
  metadata?: Record<string, any>;
}

/**
 * HuggingFace Transformers-based embedding function for semantic embeddings
 * Uses @xenova/transformers for real semantic understanding
 */
class HuggingFaceEmbeddingFunction {
  private model: any = null;
  private modelName: string;
  private logger: Logger;
  private cache = new Map<string, number[]>();
  private maxCacheSize = 1000;
  private initialized = false;

  constructor(modelName: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
    this.logger = new Logger('huggingface-embedding');
    this.configureEnvironment();
  }

  private configureEnvironment() {
    // Configure HuggingFace Transformers environment
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    
    // Set cache directory to ~/.mcptools/data/model_cache
    env.cacheDir = join(homedir(), '.mcptools', 'data', 'model_cache');
    
    // Ensure cache directory exists
    if (!existsSync(env.cacheDir)) {
      mkdirSync(env.cacheDir, { recursive: true });
      this.logger.info('Created HuggingFace model cache directory', { path: env.cacheDir });
    }

    // Configure for Node.js environment
    if (typeof window === 'undefined') {
      try {
        const os = require('os');
        env.backends.onnx.wasm.numThreads = Math.min(4, os.cpus().length);
      } catch (error) {
        this.logger.warn('Could not configure thread count', error);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.model) {
      return;
    }

    try {
      this.logger.info('Initializing HuggingFace embedding model', { model: this.modelName });
      
      // Load the model pipeline
      this.model = await pipeline('feature-extraction', this.modelName);
      this.initialized = true;
      
      this.logger.info('HuggingFace embedding model initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize HuggingFace model', error);
      throw new Error(`Failed to load embedding model ${this.modelName}: ${error}`);
    }
  }

  /**
   * Generate semantic embeddings using HuggingFace Transformers
   */
  async embed(texts: string[]): Promise<number[][]> {
    await this.initialize();

    const embeddings: number[][] = [];

    for (const text of texts) {
      // Check cache first
      if (this.cache.has(text)) {
        embeddings.push(this.cache.get(text)!);
        continue;
      }

      try {
        // Generate embedding using the transformer model
        const output = await this.model(text, {
          pooling: 'mean',
          normalize: true
        });

        // Convert to array and cache
        const embedding = Array.from(output.data) as number[];
        
        // Manage cache size
        if (this.cache.size >= this.maxCacheSize) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
        
        this.cache.set(text, embedding);
        embeddings.push(embedding);
        
      } catch (error) {
        this.logger.error('Failed to generate embedding for text', { text: text.substring(0, 100), error });
        
        // Fallback: create a deterministic but simple embedding
        const fallbackEmbedding = this.createFallbackEmbedding(text);
        embeddings.push(fallbackEmbedding);
      }
    }

    return embeddings;
  }

  /**
   * Get the embedding dimension for this model
   */
  getDimension(): number {
    // Return dimensions based on known models
    switch (this.modelName) {
      case 'Xenova/all-MiniLM-L6-v2':
        return 384;
      case 'Xenova/all-mpnet-base-v2':
        return 768;
      case 'Xenova/distiluse-base-multilingual-cased-v2':
        return 512;
      default:
        return 384; // Default dimension
    }
  }

  /**
   * Fallback embedding for error cases
   */
  private createFallbackEmbedding(text: string): number[] {
    const dimension = this.getDimension();
    const vector = new Array(dimension).fill(0);
    
    // Create a deterministic embedding based on text characteristics
    const words = text.toLowerCase().split(/\s+/);
    const chars = text.toLowerCase().split('');
    
    for (let i = 0; i < dimension; i++) {
      let value = 0;
      
      if (i < words.length) {
        const word = words[i];
        value += word.length * 0.1;
        value += word.charCodeAt(0) * 0.01;
      }
      
      if (i < chars.length) {
        value += chars[i].charCodeAt(0) * 0.001;
      }
      
      value += text.length * 0.0001;
      value += Math.sin(i * 0.1) * 0.05;
      
      vector[i] = value;
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRatio?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }
}

export class LanceDBService {
  private connection: lancedb.Connection | null = null;
  private tables: Map<string, lancedb.Table> = new Map();
  private embeddingFunction: HuggingFaceEmbeddingFunction;
  private logger: Logger;
  private config: LanceDBConfig;
  private dataPath: string;
  private initializationPromise: Promise<void> | null = null;
  private operationQueue: Map<string, Promise<any>> = new Map();
  private connectionLock: Promise<void> | null = null;

  constructor(
    private db: DatabaseManager,
    config: LanceDBConfig = {}
  ) {
    this.logger = new Logger('lancedb');
    this.config = {
      embeddingProvider: 'local',
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      vectorDimension: 384,
      ...config
    };

    // Set up data directory
    this.dataPath = config.dataPath || join(homedir(), '.mcptools', 'lancedb');
    this.ensureDataDirectory();

    // Initialize HuggingFace embedding function
    const modelName = this.getModelName();
    this.embeddingFunction = new HuggingFaceEmbeddingFunction(modelName);
    
    // Update vector dimension based on the selected model
    this.config.vectorDimension = this.embeddingFunction.getDimension();

    this.logger.info('LanceDBService initialized', {
      dataPath: this.dataPath,
      embeddingProvider: this.config.embeddingProvider,
      embeddingModel: this.config.embeddingModel,
      vectorDimension: this.config.vectorDimension
    });
  }

  /**
   * Initialize connection to LanceDB with concurrent access protection
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    // If already initializing, wait for the existing initialization
    if (this.initializationPromise) {
      await this.initializationPromise;
      return { success: true };
    }

    // If already initialized, return success
    if (this.connection) {
      return { success: true };
    }

    // Create initialization promise to prevent concurrent initialization
    this.initializationPromise = this._performInitialization();
    
    try {
      await this.initializationPromise;
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    } finally {
      this.initializationPromise = null;
    }
  }

  private async _performInitialization(): Promise<void> {
    const lockFile = join(this.dataPath, '.init.lock');
    const pid = process.pid;
    const startTime = Date.now();
    
    try {
      // Check if another process is initializing
      if (existsSync(lockFile)) {
        const lockData = readFileSync(lockFile, 'utf-8');
        const lockInfo = JSON.parse(lockData);
        const lockAge = Date.now() - lockInfo.timestamp;
        
        // If lock is older than 60 seconds, assume the process died
        if (lockAge > 60000) {
          this.logger.warn(`Removing stale lock file from PID ${lockInfo.pid} (age: ${lockAge}ms)`);
          unlinkSync(lockFile);
        } else {
          // Wait for the other process to finish
          this.logger.info(`Waiting for initialization by PID ${lockInfo.pid}`);
          await this.waitForLockRelease(lockFile, 30000);
        }
      }
      
      // Create lock file
      writeFileSync(lockFile, JSON.stringify({ pid, timestamp: Date.now() }));
      
      // Add timeout to prevent indefinite hanging
      const timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('LanceDB connection timeout after 30 seconds')), 30000)
      );

      // Connect to LanceDB with timeout
      this.connection = await Promise.race([
        lancedb.connect(this.dataPath),
        timeout
      ]);
      
      this.logger.info('Connected to LanceDB', { path: this.dataPath });

      // Pre-initialize the embedding function to avoid delays during first use
      await this.embeddingFunction.initialize();
      this.logger.info('HuggingFace embedding function pre-initialized');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to initialize LanceDB', { error: errorMsg });
      throw error;
    } finally {
      // Always remove lock file
      try {
        if (existsSync(lockFile)) {
          const lockData = readFileSync(lockFile, 'utf-8');
          const lockInfo = JSON.parse(lockData);
          if (lockInfo.pid === pid) {
            unlinkSync(lockFile);
          }
        }
      } catch (e) {
        this.logger.warn('Failed to remove lock file', e);
      }
    }
  }

  private async waitForLockRelease(lockFile: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    while (existsSync(lockFile)) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for initialization lock release');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Create or get a collection (table)
   */
  async createCollection(
    name: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult;
      }

      // Check if table already exists
      if (this.tables.has(name)) {
        this.logger.info(`Collection ${name} already exists`);
        return { success: true };
      }

      try {
        // Try to open existing table
        const existingTable = await this.connection!.openTable(name);
        this.tables.set(name, existingTable);
        this.logger.info(`Opened existing collection: ${name}`);
        return { success: true };
      } catch (error) {
        // Table doesn't exist, create it with explicit schema
        const sampleEmbedding = await this.embeddingFunction.embed(['initialization']);
        const sampleData = [{
          id: 'init',
          content: 'Initialization document',
          vector: sampleEmbedding[0],
          metadata: JSON.stringify({ init: true, collection: name, ...metadata })
        }];

        // Create table with explicit schema
        const table = await this.connection!.createTable(name, sampleData, {
          mode: 'overwrite'
        });
        this.tables.set(name, table);
        this.logger.info(`Created new collection: ${name}`);
        return { success: true };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create collection ${name}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Add documents to a collection with automatic embedding
   */
  async addDocuments(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<{ success: boolean; addedCount: number; error?: string }> {
    return this.withOperation(`add-${collectionName}`, async () => {
      try {
        // Ensure collection exists
        const createResult = await this.createCollection(collectionName);
        if (!createResult.success) {
          return { success: false, addedCount: 0, error: createResult.error };
        }

        const table = this.tables.get(collectionName)!;

        // Generate embeddings for all documents with timeout
        const embedTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Embedding generation timeout after ${documents.length * 2000}ms`)), documents.length * 2000)
        );
        
        const contents = documents.map(doc => doc.content);
        const embeddings = await Promise.race([
          this.embeddingFunction.embed(contents),
          embedTimeout
        ]);

        // Convert to LanceDB format
        const lanceData = documents.map((doc, index) => ({
          id: doc.id,
          content: doc.content,
          vector: embeddings[index],
          metadata: JSON.stringify({
            type: doc.type || 'text',
            collection: collectionName,
            addedAt: new Date().toISOString(),
            ...doc.metadata
          })
        }));

        // Add to table with timeout
        const addTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Document addition timeout after 20 seconds')), 20000)
        );
        
        await Promise.race([
          table.add(lanceData),
          addTimeout
        ]);
        
        this.logger.info(`Added ${documents.length} documents to collection ${collectionName}`);
        return {
          success: true,
          addedCount: documents.length
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to add documents to ${collectionName}`, { error: errorMsg });
        return {
          success: false,
          addedCount: 0,
          error: errorMsg
        };
      }
    });
  }

  /**
   * Remove documents from a collection by ID using LanceDB delete
   */
  async removeDocuments(
    collectionName: string,
    documentIds: string[]
  ): Promise<{ success: boolean; removedCount: number; error?: string }> {
    try {
      if (documentIds.length === 0) {
        return { success: true, removedCount: 0 };
      }

      const table = this.tables.get(collectionName);
      if (!table) {
        return { success: false, removedCount: 0, error: `Collection ${collectionName} not found` };
      }

      // Build SQL WHERE clause for deletion
      const deleteConditions = documentIds.map(id => `id = '${id.replace(/'/g, "''")}'`);
      const deleteWhereClause = deleteConditions.join(' OR ');
      
      // Delete documents using LanceDB's delete method
      await table.delete(deleteWhereClause);
      
      this.logger.info(`Removed ${documentIds.length} documents from collection ${collectionName}`, {
        documentIds,
        whereClause: deleteWhereClause
      });
      
      return {
        success: true,
        removedCount: documentIds.length
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to remove documents from ${collectionName}`, { 
        error: errorMsg,
        documentIds 
      });
      return {
        success: false,
        removedCount: 0,
        error: errorMsg
      };
    }
  }

  /**
   * Find documents by metadata criteria using LanceDB SQL filtering
   */
  async findDocumentsByMetadata(
    collectionName: string,
    metadataFilter: Record<string, any>
  ): Promise<VectorSearchResult[]> {
    try {
      const table = this.tables.get(collectionName);
      if (!table) {
        throw new Error(`Collection ${collectionName} not found`);
      }

      // Build SQL WHERE clause for metadata filtering
      const whereConditions: string[] = [];
      for (const [key, value] of Object.entries(metadataFilter)) {
        if (typeof value === 'string') {
          // String values need to be properly escaped and quoted
          const escapedValue = value.replace(/'/g, "''");
          whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = '${escapedValue}'`);
        } else if (typeof value === 'number') {
          whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = ${value}`);
        } else if (typeof value === 'boolean') {
          whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = ${value}`);
        } else {
          // For complex values, convert to JSON string
          const jsonValue = JSON.stringify(value).replace(/'/g, "''");
          whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = '${jsonValue}'`);
        }
      }

      const whereClause = whereConditions.join(' AND ');

      // Use LanceDB's SQL filtering without vector search (pure metadata query)
      const results = await table
        .query()
        .where(whereClause)
        .limit(10000)
        .toArray();

      // Convert to standard format
      const filteredResults: VectorSearchResult[] = results.map((result: any) => {
        let metadata = {};
        try {
          metadata = JSON.parse(result.metadata || '{}');
        } catch (error) {
          this.logger.warn('Failed to parse metadata for document', { id: result.id });
        }

        return {
          id: result.id,
          content: result.content,
          metadata,
          score: 1.0, // Not a similarity search
          distance: 0
        };
      });

      this.logger.info(`Found ${filteredResults.length} documents matching metadata filter in ${collectionName}`, {
        whereClause,
        filterKeys: Object.keys(metadataFilter)
      });
      return filteredResults;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to find documents by metadata in ${collectionName}`, { 
        error: errorMsg,
        metadataFilter 
      });
      throw new Error(`Metadata search failed: ${errorMsg}`);
    }
  }

  /**
   * Update documents by replacing existing ones with matching metadata
   */
  async updateDocuments(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<{ success: boolean; updatedCount: number; deletedCount: number; error?: string }> {
    try {
      const table = this.tables.get(collectionName);
      if (!table) {
        return { 
          success: false, 
          updatedCount: 0, 
          deletedCount: 0, 
          error: `Collection ${collectionName} not found` 
        };
      }

      let totalDeleted = 0;
      let totalUpdated = 0;

      // Process each document individually for precise replacement
      for (const document of documents) {
        try {
          // Build filter based on document's unique identifiers
          // Priority: id > websiteId+pageId > websiteId+url
          let metadataFilter: Record<string, any> = {};
          
          if (document.id) {
            // First try to find by exact ID
            metadataFilter = { id: document.id };
          } else if (document.metadata?.websiteId && document.metadata?.pageId) {
            // Find by website + page combination
            metadataFilter = { 
              websiteId: document.metadata.websiteId, 
              pageId: document.metadata.pageId 
            };
          } else if (document.metadata?.websiteId && document.metadata?.url) {
            // Find by website + URL combination
            metadataFilter = { 
              websiteId: document.metadata.websiteId, 
              url: document.metadata.url 
            };
          } else {
            this.logger.warn(`Document ${document.id} has insufficient metadata for unique identification, skipping update`);
            continue;
          }

          // Find existing documents to replace
          const existingDocs = await this.findDocumentsByMetadata(collectionName, metadataFilter);
          
          if (existingDocs.length > 0) {
            // Delete existing documents by ID
            const idsToDelete = existingDocs.map(doc => doc.id);
            
            // Build SQL WHERE clause for deletion
            const deleteConditions = idsToDelete.map(id => `id = '${id.replace(/'/g, "''")}'`);
            const deleteWhereClause = deleteConditions.join(' OR ');
            
            // Delete existing documents
            await table.delete(deleteWhereClause);
            totalDeleted += idsToDelete.length;
            
            this.logger.debug(`Deleted ${idsToDelete.length} existing documents for update`, {
              collectionName,
              documentId: document.id,
              deletedIds: idsToDelete
            });
          }

          // Add the new document
          const addResult = await this.addDocuments(collectionName, [document]);
          if (addResult.success) {
            totalUpdated += 1;
          } else {
            this.logger.error(`Failed to add updated document ${document.id}`, { error: addResult.error });
          }

        } catch (error) {
          this.logger.error(`Failed to update individual document ${document.id}`, { error });
          // Continue with other documents even if one fails
        }
      }

      this.logger.info(`Updated ${totalUpdated} documents in collection ${collectionName}`, {
        totalDocuments: documents.length,
        deletedCount: totalDeleted,
        updatedCount: totalUpdated
      });

      return {
        success: true,
        updatedCount: totalUpdated,
        deletedCount: totalDeleted
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update documents in ${collectionName}`, { error: errorMsg });
      return {
        success: false,
        updatedCount: 0,
        deletedCount: 0,
        error: errorMsg
      };
    }
  }

  /**
   * Check if documents exist for a specific website and page combination
   */
  async findExistingDocuments(
    collectionName: string,
    websiteId: string,
    pageId?: string
  ): Promise<VectorSearchResult[]> {
    try {
      const table = this.tables.get(collectionName);
      if (!table) {
        this.logger.debug(`Collection ${collectionName} not found when checking for existing documents`);
        return [];
      }

      // Search for documents with matching website_id and optionally page_id
      const filter = pageId 
        ? { websiteId, pageId }
        : { websiteId };

      const existingDocs = await this.findDocumentsByMetadata(collectionName, filter);
      
      this.logger.info(`Found ${existingDocs.length} existing documents for website ${websiteId}${pageId ? ` page ${pageId}` : ''}`);
      return existingDocs;

    } catch (error) {
      this.logger.error(`Failed to find existing documents for website ${websiteId}`, error);
      return [];
    }
  }

  /**
   * Replace or add document, handling existing documents with same website/page
   */
  async replaceDocumentForPage(
    collectionName: string,
    document: VectorDocument,
    forceRefresh: boolean = false
  ): Promise<{ success: boolean; action: 'added' | 'updated' | 'skipped'; error?: string }> {
    try {
      const websiteId = document.metadata?.websiteId;
      const pageId = document.metadata?.pageId;
      const contentHash = document.metadata?.contentHash;

      if (!websiteId || !pageId) {
        return {
          success: false,
          action: 'skipped',
          error: 'Missing websiteId or pageId in document metadata'
        };
      }

      // Check for existing documents for this page
      const existingDocs = await this.findExistingDocuments(collectionName, websiteId, pageId);
      
      if (existingDocs.length > 0) {
        const existingDoc = existingDocs[0]; // Should only be one per page
        const existingContentHash = existingDoc.metadata?.contentHash;

        // If content hash matches and not forcing refresh, skip
        if (!forceRefresh && existingContentHash === contentHash) {
          this.logger.debug(`Skipping vector update for page ${pageId} - content unchanged`);
          return {
            success: true,
            action: 'skipped'
          };
        }

        // Content changed or force refresh - warn about LanceDB limitation
        if (existingDocs.length > 0) {
          this.logger.warn(
            `Updating vector document for page ${pageId}. Note: LanceDB doesn't support efficient deletion, ` +
            `so old documents may remain. Consider periodic cleanup.`,
            {
              websiteId,
              pageId,
              existingCount: existingDocs.length,
              forceRefresh,
              contentChanged: existingContentHash !== contentHash
            }
          );
        }
      }

      // Add the new/updated document
      const addResult = await this.addDocuments(collectionName, [document]);
      
      if (addResult.success) {
        const action = existingDocs.length > 0 ? 'updated' : 'added';
        return {
          success: true,
          action
        };
      } else {
        return {
          success: false,
          action: 'skipped',
          error: addResult.error
        };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to replace document for page`, { error: errorMsg, document: document.id });
      return {
        success: false,
        action: 'skipped',
        error: errorMsg
      };
    }
  }

  /**
   * Clean up stale documents for a website (documents that don't match current content hashes)
   * This is a heavy operation due to LanceDB limitations - use sparingly
   */
  async cleanupStaleDocuments(
    collectionName: string,
    websiteId: string,
    currentPageHashes: Record<string, string> // pageId -> contentHash
  ): Promise<{ success: boolean; staleCount: number; error?: string }> {
    try {
      const existingDocs = await this.findExistingDocuments(collectionName, websiteId);
      
      let staleCount = 0;
      const staleDocIds: string[] = [];

      for (const doc of existingDocs) {
        const pageId = doc.metadata?.pageId;
        const contentHash = doc.metadata?.contentHash;
        
        if (pageId && contentHash) {
          const currentHash = currentPageHashes[pageId];
          
          // If page doesn't exist anymore or content hash doesn't match
          if (!currentHash || currentHash !== contentHash) {
            staleCount++;
            staleDocIds.push(doc.id);
          }
        }
      }

      if (staleCount > 0) {
        this.logger.warn(
          `Found ${staleCount} stale documents for website ${websiteId}. ` +
          `Due to LanceDB limitations, they will remain until collection recreation.`,
          { staleDocIds }
        );
      }

      return {
        success: true,
        staleCount
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cleanup stale documents for website ${websiteId}`, { error: errorMsg });
      return {
        success: false,
        staleCount: 0,
        error: errorMsg
      };
    }
  }

  /**
   * Wrap operations to prevent concurrent access issues
   */
  private async withOperation<T>(
    operationKey: string, 
    operation: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    // Check if operation is already in progress
    const existingOperation = this.operationQueue.get(operationKey);
    if (existingOperation) {
      this.logger.debug(`Waiting for existing operation: ${operationKey}`);
      try {
        await existingOperation;
      } catch {
        // Previous operation failed, continue with new one
      }
    }

    // Create operation promise with timeout
    const operationPromise = Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation ${operationKey} timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    // Store in queue
    this.operationQueue.set(operationKey, operationPromise);

    try {
      const result = await operationPromise;
      return result;
    } finally {
      // Clean up
      this.operationQueue.delete(operationKey);
    }
  }

  /**
   * Search for similar documents using vector similarity with optional metadata filtering
   */
  async searchSimilar(
    collectionName: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.7,
    metadataFilter?: Record<string, any>
  ): Promise<VectorSearchResult[]> {
    return this.withOperation(`search-${collectionName}-${query}`, async () => {
      try {
        // Ensure collection exists
        const createResult = await this.createCollection(collectionName);
        if (!createResult.success) {
          throw new Error(`Collection access failed: ${createResult.error}`);
        }

        const table = this.tables.get(collectionName)!;

        // Generate embedding for query with timeout
        const embedTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Embedding generation timeout after 10 seconds')), 10000)
        );
        
        const queryEmbedding = await Promise.race([
          this.embeddingFunction.embed([query]),
          embedTimeout
        ]);
        const queryVector = queryEmbedding[0];

        // Build search query with optional metadata filtering
        let searchQuery = table.search(queryVector).limit(limit);

        // Add metadata filtering if provided
        if (metadataFilter && Object.keys(metadataFilter).length > 0) {
          const whereConditions: string[] = [];
          for (const [key, value] of Object.entries(metadataFilter)) {
            if (typeof value === 'string') {
              const escapedValue = value.replace(/'/g, "''");
              whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = '${escapedValue}'`);
            } else if (typeof value === 'number') {
              whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = ${value}`);
            } else if (typeof value === 'boolean') {
              whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = ${value}`);
            } else {
              const jsonValue = JSON.stringify(value).replace(/'/g, "''");
              whereConditions.push(`JSON_EXTRACT(metadata, '$.${key}') = '${jsonValue}'`);
            }
          }
          const whereClause = whereConditions.join(' AND ');
          searchQuery = searchQuery.where(whereClause);
        }

        // Perform vector similarity search with timeout
        const searchTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Vector search timeout after 15 seconds')), 15000)
        );
        
        const results = await Promise.race([
          searchQuery.toArray(),
          searchTimeout
        ]);

        // Convert to standard format and apply threshold
        const searchResults: VectorSearchResult[] = results
          .map((result: any) => {
            let metadata = {};
            try {
              metadata = JSON.parse(result.metadata || '{}');
            } catch (error) {
              this.logger.warn('Failed to parse metadata', { metadata: result.metadata });
            }

            // LanceDB returns distance, convert to similarity score
            const distance = result._distance || 0;
            const score = Math.max(0, 1 - distance); // Convert distance to similarity

            return {
              id: result.id,
              content: result.content,
              metadata,
              score,
              distance
            };
          })
          .filter(result => result.score >= threshold)
          .sort((a, b) => b.score - a.score); // Sort by highest similarity

        this.logger.info(`Found ${searchResults.length} similar documents in ${collectionName}`);
        return searchResults;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Search failed in collection ${collectionName}`, { error: errorMsg });
        throw new Error(`Search operation failed: ${errorMsg}`);
      }
    });
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<Collection[]> {
    try {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(`Initialization failed: ${initResult.error}`);
      }

      const tableNames = await this.connection!.tableNames();
      
      const collections: Collection[] = [];
      for (const name of tableNames) {
        try {
          const table = await this.connection!.openTable(name);
          // Get approximate count (LanceDB doesn't expose direct count)
          const sampleResults = await table.search([0]).limit(1).toArray();
          
          collections.push({
            name,
            count: sampleResults.length > 0 ? -1 : 0, // -1 indicates "has data"
            metadata: {
              hasData: sampleResults.length > 0
            }
          });
        } catch (error) {
          this.logger.warn(`Failed to get stats for collection ${name}`, error);
        }
      }

      return collections;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to list collections', { error: errorMsg });
      throw new Error(`List collections failed: ${errorMsg}`);
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult;
      }

      await this.connection!.dropTable(name);
      this.tables.delete(name);
      
      this.logger.info(`Deleted collection: ${name}`);
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete collection ${name}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Test connection and functionality
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          connected: false,
          error: initResult.error
        };
      }

      // Test by creating a temporary collection and searching
      const testCollection = 'test_' + Date.now();
      const createResult = await this.createCollection(testCollection);
      if (!createResult.success) {
        return {
          connected: false,
          error: `Test collection creation failed: ${createResult.error}`
        };
      }

      // Test adding and searching
      const testDoc: VectorDocument = {
        id: 'test_doc',
        content: 'This is a test document for connection verification.',
        metadata: { test: true }
      };

      const addResult = await this.addDocuments(testCollection, [testDoc]);
      if (!addResult.success) {
        return {
          connected: false,
          error: `Test document add failed: ${addResult.error}`
        };
      }

      const searchResults = await this.searchSimilar(testCollection, 'test document', 1);
      
      // Clean up test collection
      await this.deleteCollection(testCollection);

      this.logger.info('LanceDB connection test successful', {
        searchResultsFound: searchResults.length
      });

      return { connected: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection test failed';
      this.logger.error('LanceDB connection test failed', { error: errorMsg });
      return {
        connected: false,
        error: errorMsg
      };
    }
  }

  /**
   * Get the appropriate model name based on configuration
   */
  private getModelName(): string {
    const provider = this.config.embeddingProvider;
    const customModel = this.config.embeddingModel;

    // If a specific model is provided, use it
    if (customModel && customModel !== 'simple-text-embeddings') {
      return customModel;
    }

    // Default models based on provider
    switch (provider) {
      case 'huggingface':
        return 'Xenova/all-MiniLM-L6-v2';
      case 'local':
      default:
        return 'Xenova/all-MiniLM-L6-v2';
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    totalCollections: number;
    embeddingProvider: string;
    embeddingModel: string;
    dataPath: string;
    isInitialized: boolean;
    cacheStats?: { size: number; maxSize: number };
  }> {
    try {
      const isInitialized = this.connection !== null;
      let totalCollections = 0;

      if (isInitialized) {
        const collections = await this.listCollections();
        totalCollections = collections.length;
      }
      
      return {
        totalCollections,
        embeddingProvider: this.config.embeddingProvider!,
        embeddingModel: this.getModelName(),
        dataPath: this.dataPath,
        isInitialized,
        cacheStats: this.embeddingFunction.getCacheStats()
      };

    } catch (error) {
      this.logger.error('Failed to get LanceDB stats', error);
      return {
        totalCollections: 0,
        embeddingProvider: this.config.embeddingProvider!,
        embeddingModel: this.getModelName(),
        dataPath: this.dataPath,
        isInitialized: false
      };
    }
  }

  /**
   * Check if connected to LanceDB
   */
  isConnected(): boolean {
    return this.connection !== null;
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.connection = null;
    this.tables.clear();
    this.logger.info('LanceDBService shutdown complete');
  }

  private ensureDataDirectory(): void {
    if (!existsSync(this.dataPath)) {
      mkdirSync(this.dataPath, { recursive: true });
      this.logger.info('Created LanceDB data directory', { path: this.dataPath });
    }
  }
}