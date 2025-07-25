import { eq, and, or, lt, gt, isNull, isNotNull, desc, asc } from 'drizzle-orm';
import { BaseRepository, createRepositoryConfig } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  scrapeJobs,
  insertScrapeJobSchema,
  selectScrapeJobSchema,
  updateScrapeJobSchema,
  type ScrapeJob,
  type NewScrapeJob,
  type ScrapeJobUpdate,
  type ScrapeJobStatus,
} from '../schemas/index.js';

/**
 * Repository for managing scrape jobs
 * 
 * Provides type-safe CRUD operations and scraping job management methods
 */
export class ScrapeJobRepository extends BaseRepository<
  typeof scrapeJobs,
  ScrapeJob,
  NewScrapeJob,
  ScrapeJobUpdate
> {
  constructor(drizzleManager: DatabaseManager) {
    super(drizzleManager, createRepositoryConfig(
      scrapeJobs,
      scrapeJobs.id,
      insertScrapeJobSchema,
      selectScrapeJobSchema,
      updateScrapeJobSchema,
      'scrape-job-repository'
    ));
  }

  /**
   * Find jobs by source ID
   */
  async findBySourceId(sourceId: string): Promise<ScrapeJob[]> {
    return this.query()
      .where(eq(scrapeJobs.sourceId, sourceId))
      .orderBy(scrapeJobs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find jobs by status
   */
  async findByStatus(status: ScrapeJobStatus): Promise<ScrapeJob[]> {
    return this.query()
      .where(eq(scrapeJobs.status, status))
      .orderBy(scrapeJobs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find jobs by priority level
   */
  async findByPriority(priority: number): Promise<ScrapeJob[]> {
    return this.query()
      .where(eq(scrapeJobs.priority, priority))
      .orderBy(scrapeJobs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find jobs locked by a specific worker
   */
  async findLockedBy(lockerId: string): Promise<ScrapeJob[]> {
    return this.query()
      .where(eq(scrapeJobs.lockedBy, lockerId))
      .orderBy(scrapeJobs.lockedAt, 'desc')
      .execute();
  }

  /**
   * Find pending jobs that are available to be picked up
   * Orders by priority (1 = highest priority) then by creation time
   */
  async findAvailablePending(): Promise<ScrapeJob[]> {
    return this.query()
      .where(and(
        eq(scrapeJobs.status, 'pending'),
        isNull(scrapeJobs.lockedBy)
      ))
      .orderBy(scrapeJobs.priority, 'asc')
      .orderBy(scrapeJobs.createdAt, 'asc')
      .execute();
  }

  /**
   * Find the next pending job and lock it for processing
   */
  async lockNextPendingJob(lockerId: string, lockTimeoutSeconds = 3600): Promise<ScrapeJob | null> {
    return await this.drizzleManager.transaction((tx) => {
      // Find the next available pending job using synchronous query
      const availableJobs = tx
        .select()
        .from(scrapeJobs)
        .where(and(
          eq(scrapeJobs.status, 'pending'),
          isNull(scrapeJobs.lockedBy)
        ))
        .orderBy(scrapeJobs.priority, scrapeJobs.createdAt)
        .all();

      if (availableJobs.length === 0) {
        return null;
      }

      const job = availableJobs[0];
      const now = new Date().toISOString();

      // Lock the job synchronously
      const result = tx
        .update(scrapeJobs)
        .set({
          status: 'running',
          lockedBy: lockerId,
          lockedAt: now,
          startedAt: now,
          lockTimeout: lockTimeoutSeconds,
        })
        .where(eq(scrapeJobs.id, job.id))
        .run();

      if (result.changes === 0) {
        return null;
      }

      // Return the updated job
      return {
        ...job,
        status: 'running' as const,
        lockedBy: lockerId,
        lockedAt: now,
        startedAt: now,
        lockTimeout: lockTimeoutSeconds,
      };
    });
  }

  /**
   * Release a job lock (usually when job completes or fails)
   */
  async releaseLock(
    jobId: string, 
    status: ScrapeJobStatus, 
    errorMessage?: string,
    resultData?: Record<string, unknown>
  ): Promise<ScrapeJob | null> {
    const updateData: Partial<ScrapeJobUpdate> = {
      status,
      lockedBy: null,
      lockedAt: null,
      completedAt: new Date().toISOString(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (resultData) {
      updateData.resultData = resultData;
    }

    return this.update(jobId, updateData as ScrapeJobUpdate);
  }

  /**
   * Find jobs with expired locks (stuck jobs)
   */
  async findExpiredLocks(): Promise<ScrapeJob[]> {
    const now = new Date();
    
    const lockedJobs = await this.query()
      .where(and(
        eq(scrapeJobs.status, 'running'),
        isNotNull(scrapeJobs.lockedBy),
        isNotNull(scrapeJobs.lockedAt)
      ))
      .execute();

    // Filter in application code for precise timestamp comparison
    return lockedJobs.filter(job => {
      if (!job.lockedAt) return false;
      
      const lockedTime = new Date(job.lockedAt).getTime();
      const timeoutMs = (job.lockTimeout || 3600) * 1000;
      const expiredTime = lockedTime + timeoutMs;
      
      return now.getTime() > expiredTime;
    });
  }

  /**
   * Clean up expired locks (reset them to pending)
   */
  async cleanupExpiredLocks(): Promise<number> {
    const expiredJobs = await this.findExpiredLocks();
    let cleanedCount = 0;

    for (const job of expiredJobs) {
      const cleaned = await this.update(job.id, {
        status: 'pending',
        lockedBy: null,
        lockedAt: null,
        errorMessage: 'Job lock expired and was reset',
      } as ScrapeJobUpdate);

      if (cleaned) {
        cleanedCount++;
        this.logger.warn('Cleaned up expired job lock', { 
          jobId: job.id,
          sourceId: job.sourceId,
          lockedBy: job.lockedBy,
          lockedAt: job.lockedAt
        });
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up expired job locks', { cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Cancel a specific job
   */
  async cancelJob(jobId: string, reason?: string): Promise<ScrapeJob | null> {
    return this.update(jobId, {
      status: 'cancelled',
      lockedBy: null,
      lockedAt: null,
      completedAt: new Date().toISOString(),
      errorMessage: reason || 'Job was cancelled',
    } as ScrapeJobUpdate);
  }

  /**
   * Update job progress (pages scraped)
   */
  async updateProgress(jobId: string, pagesScraped: number): Promise<ScrapeJob | null> {
    return this.update(jobId, {
      pagesScraped,
      updatedAt: new Date().toISOString(),
    } as ScrapeJobUpdate);
  }

  /**
   * Mark job as completed with results
   */
  async markCompleted(
    jobId: string, 
    resultData: Record<string, unknown>,
    pagesScraped?: number
  ): Promise<ScrapeJob | null> {
    const updateData: Partial<ScrapeJobUpdate> = {
      status: 'completed',
      lockedBy: null,
      lockedAt: null,
      completedAt: new Date().toISOString(),
      resultData,
    };

    if (pagesScraped !== undefined) {
      updateData.pagesScraped = pagesScraped;
    }

    return this.update(jobId, updateData as ScrapeJobUpdate);
  }

  /**
   * Mark job as failed with error details
   */
  async markFailed(jobId: string, errorMessage: string): Promise<ScrapeJob | null> {
    return this.update(jobId, {
      status: 'failed',
      lockedBy: null,
      lockedAt: null,
      completedAt: new Date().toISOString(),
      errorMessage,
    } as ScrapeJobUpdate);
  }

  /**
   * Get job statistics
   */
  async getJobStats(): Promise<{
    total: number;
    byStatus: Record<ScrapeJobStatus, number>;
    byPriority: Record<number, number>;
    avgExecutionTime: number;
    totalPagesScraped: number;
  }> {
    const jobs = await this.list();
    
    const stats = {
      total: jobs.data.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<number, number>,
      avgExecutionTime: 0,
      totalPagesScraped: 0,
    };

    const statusValues: ScrapeJobStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'];
    
    // Initialize all statuses with 0
    statusValues.forEach(status => {
      stats.byStatus[status] = 0;
    });

    let totalExecutionTime = 0;
    let completedJobsCount = 0;

    // Calculate statistics
    jobs.data.forEach(job => {
      // Count by status
      stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
      
      // Count by priority
      stats.byPriority[job.priority] = (stats.byPriority[job.priority] || 0) + 1;
      
      // Sum pages scraped
      stats.totalPagesScraped += job.pagesScraped || 0;
      
      // Calculate execution time for completed jobs
      if (job.status === 'completed' && job.startedAt && job.completedAt) {
        const startTime = new Date(job.startedAt).getTime();
        const endTime = new Date(job.completedAt).getTime();
        const executionTime = (endTime - startTime) / 1000; // seconds
        
        totalExecutionTime += executionTime;
        completedJobsCount++;
      }
    });

    stats.avgExecutionTime = completedJobsCount > 0 ? totalExecutionTime / completedJobsCount : 0;

    return stats as {
      total: number;
      byStatus: Record<ScrapeJobStatus, number>;
      byPriority: Record<number, number>;
      avgExecutionTime: number;
      totalPagesScraped: number;
    };
  }

  /**
   * Find recent jobs (last N days)
   */
  async findRecent(days = 7): Promise<ScrapeJob[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const recentJobs = await this.query()
      .where(gt(scrapeJobs.createdAt, cutoffDate))
      .orderBy(scrapeJobs.createdAt, 'desc')
      .execute();

    return recentJobs;
  }

  /**
   * Find failed jobs that can be retried
   */
  async findRetryable(): Promise<ScrapeJob[]> {
    return this.query()
      .where(eq(scrapeJobs.status, 'failed'))
      .orderBy(scrapeJobs.createdAt, 'asc')
      .execute();
  }

  /**
   * Retry a failed job by resetting it to pending
   */
  async retryJob(jobId: string): Promise<ScrapeJob | null> {
    return this.update(jobId, {
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    } as ScrapeJobUpdate);
  }

  /**
   * Force unlock a stuck job - useful for debugging and recovery
   */
  async forceUnlockJob(jobId: string, reason?: string): Promise<ScrapeJob | null> {
    this.logger.warn('Force unlocking job', { jobId, reason });
    
    return this.update(jobId, {
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      errorMessage: reason || 'Job was force unlocked',
    } as ScrapeJobUpdate);
  }

  /**
   * Force unlock all stuck jobs (jobs that are running but haven't been updated recently)
   */
  async forceUnlockStuckJobs(stuckThresholdMinutes = 30): Promise<number> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - stuckThresholdMinutes * 60 * 1000).toISOString();
    
    const potentiallyStuckJobs = await this.query()
      .where(and(
        eq(scrapeJobs.status, 'running'),
        isNotNull(scrapeJobs.lockedBy),
        lt(scrapeJobs.updatedAt, thresholdTime)
      ))
      .execute();

    let unlockedCount = 0;
    
    for (const job of potentiallyStuckJobs) {
      const unlocked = await this.forceUnlockJob(job.id, 
        `Job appeared stuck - no updates for ${stuckThresholdMinutes} minutes`
      );
      
      if (unlocked) {
        unlockedCount++;
        this.logger.warn('Force unlocked stuck job', { 
          jobId: job.id,
          sourceId: job.sourceId,
          lockedBy: job.lockedBy,
          lockedAt: job.lockedAt,
          lastUpdated: job.updatedAt,
          stuckThresholdMinutes
        });
      }
    }

    if (unlockedCount > 0) {
      this.logger.info('Force unlocked stuck jobs', { unlockedCount, stuckThresholdMinutes });
    }

    return unlockedCount;
  }

  /**
   * Cleanup old completed/failed jobs
   */
  async cleanupOldJobs(days = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const oldJobs = await this.query()
      .where(and(
        or(
          eq(scrapeJobs.status, 'completed'),
          eq(scrapeJobs.status, 'failed'),
          eq(scrapeJobs.status, 'cancelled')
        ),
        lt(scrapeJobs.completedAt, cutoffDate)
      ))
      .execute();

    // Filter in application code for precise timestamp comparison
    const toDelete = oldJobs.filter(job => 
      job.completedAt && new Date(job.completedAt).getTime() < new Date(cutoffDate).getTime()
    );

    let deletedCount = 0;
    
    // Delete each job individually to ensure proper logging
    for (const job of toDelete) {
      const deleted = await this.delete(job.id);
      if (deleted) {
        deletedCount++;
      }
    }

    this.logger.info('Cleaned up old scrape jobs', { 
      deletedCount, 
      cutoffDate,
      daysOld: days 
    });
    
    return deletedCount;
  }
}