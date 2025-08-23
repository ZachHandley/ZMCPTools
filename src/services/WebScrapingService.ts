/**
 * Web scraping service using background job queue with enhanced crawling
 * Direct scraping implementation with dropdown expansion and dynamic content loading
 */

import { randomBytes, createHash } from "crypto";
import { pathToFileURL } from "url";
import { performance } from "perf_hooks";
import TurndownService from "turndown";
import type { Page } from "patchright";
import type { DatabaseManager } from "../database/index.js";
import { VectorSearchService } from "./VectorSearchService.js";
import { domainBrowserManager } from "./DomainBrowserManager.js";
import { BrowserManager } from "./BrowserManager.js";
import { Logger } from "../utils/logger.js";
import {
  PatternMatcher,
  type ScrapingPattern,
} from "../utils/patternMatcher.js";
import { ScrapeJobRepository } from "../repositories/ScrapeJobRepository.js";
import { serializeDOMWithPlaywright } from "../utils/domToJson.js";
import { DocumentationRepository } from "../repositories/DocumentationRepository.js";
import { WebsiteRepository } from "../repositories/WebsiteRepository.js";
import { WebsitePagesRepository } from "../repositories/WebsitePagesRepository.js";
import type { DocumentationSource, ScrapeJobUpdate } from "../schemas/index.js";

export interface ScrapeJobParams {
  forceRefresh?: boolean;
  selectors?: string; // Plain string selector - CSS selector or JavaScript code
  maxPages?: number;
  allowPatterns?: (string | ScrapingPattern)[];
  ignorePatterns?: (string | ScrapingPattern)[];
  includeSubdomains?: boolean;
  agentId?: string;
  sourceUrl: string;
  sourceName: string;
}

export interface ScrapeJobResult {
  success: boolean;
  jobId?: string;
  pagesScraped?: number;
  entriesCreated?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface ScrapingWorkerConfig {
  workerId: string;
  maxConcurrentJobs: number;
  browserPoolSize: number;
  jobTimeoutSeconds: number;
  pollIntervalMs: number;
}

export class WebScrapingService {
  private vectorSearchService: VectorSearchService;
  private scrapeJobRepository: ScrapeJobRepository;
  private documentationRepository: DocumentationRepository;
  private websiteRepository: WebsiteRepository;
  private websitePagesRepository: WebsitePagesRepository;
  private isWorkerRunning = false;
  private workerConfig: ScrapingWorkerConfig;
  private logger: Logger;
  private turndownService: TurndownService;

  // Throttled progress tracking
  private progressUpdateThrottlers = new Map<
    string,
    {
      lastUpdateTime: number;
      pagesSinceLastUpdate: number;
    }
  >();

  constructor(private db: DatabaseManager, private repositoryPath: string) {
    this.vectorSearchService = new VectorSearchService(this.db);
    this.scrapeJobRepository = new ScrapeJobRepository(this.db);
    this.documentationRepository = new DocumentationRepository(this.db);
    this.websiteRepository = new WebsiteRepository(this.db);
    this.websitePagesRepository = new WebsitePagesRepository(this.db);
    this.logger = new Logger("webscraping");

    // Initialize Turndown service for HTML to Markdown conversion
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      fence: "```",
      emDelimiter: "_",
      strongDelimiter: "**",
      linkStyle: "inlined",
      linkReferenceStyle: "full",
      bulletListMarker: "-",
      preformattedCode: true,
    });

    // Add custom rules for better content extraction
    this.turndownService.addRule("preserveTableStructure", {
      filter: "table",
      replacement: function (content) {
        return "\n\n" + content + "\n\n";
      },
    });

    this.turndownService.addRule("preserveCodeBlocks", {
      filter: ["pre", "code"],
      replacement: function (content, node) {
        if (node.nodeName === "PRE") {
          return "\n\n```\n" + content + "\n```\n\n";
        }
        return "`" + content + "`";
      },
    });

    this.turndownService.addRule("preserveListItems", {
      filter: "li",
      replacement: function (content, node) {
        content = content.replace(/^\n+/, "").replace(/\n+$/, "\n");
        return "- " + content;
      },
    });

    // Log constructor parameters for debugging
    this.logger.info("WebScrapingService initialized", {
      repositoryPath: this.repositoryPath,
      repositoryPathType: typeof this.repositoryPath,
      repositoryPathLength: this.repositoryPath?.length,
      repositoryPathTruthy: !!this.repositoryPath,
      hasDatabase: !!this.db,
    });

    this.workerConfig = {
      workerId: `scraper_worker_${Date.now()}_${randomBytes(4).toString(
        "hex"
      )}`,
      maxConcurrentJobs: 2,
      browserPoolSize: 3,
      jobTimeoutSeconds: 3600,
      pollIntervalMs: 15000,
    };
  }

  /**
   * Queue a scraping job for background processing
   */
  async queueScrapeJob(
    sourceId: string,
    jobParams: ScrapeJobParams,
    priority: number = 5
  ): Promise<ScrapeJobResult> {
    try {
      // Check for existing jobs
      const existingJobs = await this.scrapeJobRepository.findBySourceId(
        sourceId
      );
      const existing = existingJobs.find(
        (job) => job.status === "pending" || job.status === "running"
      );

      if (existing) {
        return {
          success: true,
          jobId: existing.id,
          skipped: true,
          reason: "Job already exists for this source",
        };
      }

      // Create new job
      const jobId = `scrape_job_${Date.now()}_${randomBytes(8).toString(
        "hex"
      )}`;

      const newJob = await this.scrapeJobRepository.create({
        id: jobId,
        sourceId: sourceId,
        jobData: jobParams,
        status: "pending",
        priority: priority,
        lockTimeout: this.workerConfig.jobTimeoutSeconds,
      });

      if (!newJob) {
        throw new Error("Failed to create scrape job");
      }

      // Log job creation
      this.logger.info(`Scraping job queued: ${jobId}`, {
        sourceName: jobParams.sourceName,
        sourceUrl: jobParams.sourceUrl,
        agentId: jobParams.agentId,
      });

      return {
        success: true,
        jobId,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to queue scrape job",
      };
    }
  }

  /**
   * Start background worker to process scraping jobs
   */
  async startScrapingWorker(): Promise<void> {
    if (this.isWorkerRunning) {
      return;
    }

    this.isWorkerRunning = true;
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DEBUG ||
      process.env.VERBOSE_LOGGING
    ) {
      process.stderr.write(
        `🤖 Starting scraping worker: ${this.workerConfig.workerId}\n`
      );
    }

    // Main worker loop
    while (this.isWorkerRunning) {
      try {
        await this.processNextJob();
        await this.sleep(this.workerConfig.pollIntervalMs);
      } catch (error) {
        console.error("Worker error:", error);
        await this.sleep(this.workerConfig.pollIntervalMs * 2); // Back off on error
      }
    }
  }

  /**
   * Stop the background worker
   */
  async stopScrapingWorker(): Promise<void> {
    this.isWorkerRunning = false;
    await domainBrowserManager.cleanupAllDomains(true);
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DEBUG ||
      process.env.VERBOSE_LOGGING
    ) {
      process.stderr.write(
        `🛑 Stopped scraping worker: ${this.workerConfig.workerId}\n`
      );
    }
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    // Find next available job
    const job = await this.scrapeJobRepository.lockNextPendingJob(
      this.workerConfig.workerId,
      this.workerConfig.jobTimeoutSeconds
    );

    if (!job) {
      return; // No jobs available
    }

    const startTime = performance.now();
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DEBUG ||
      process.env.VERBOSE_LOGGING
    ) {
      process.stderr.write(`🔄 Processing scrape job: ${job.id}\n`);
    }

    try {
      // Parse job parameters
      const jobParams: ScrapeJobParams = job.jobData as ScrapeJobParams;

      // Process job directly using enhanced scraping
      await this.processJobDirectly(job, jobParams);

      // Mark job as completed - this will be handled by processJobDirectly method
      // The final page count and status will be updated in a single call

      const duration = performance.now() - startTime;
      if (
        process.env.NODE_ENV === "development" ||
        process.env.DEBUG ||
        process.env.VERBOSE_LOGGING
      ) {
        process.stderr.write(
          `✅ Completed scrape job: ${job.id} (${duration.toFixed(2)}ms)\n`
        );
      }
    } catch (error) {
      console.error(`❌ Failed scrape job: ${job.id}`, error);

      // Mark job as failed
      await this.scrapeJobRepository.markFailed(
        job.id,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Process job directly using domain-aware browser managers with crawling
   */
  private async processJobDirectly(
    job: any,
    jobParams: ScrapeJobParams
  ): Promise<void> {
    if (
      process.env.NODE_ENV === "development" ||
      process.env.DEBUG ||
      process.env.VERBOSE_LOGGING
    ) {
      process.stderr.write(`🔧 Processing scraping job directly: ${job.id}\n`);
    }

    // Get domain-specific browser
    const { browser } = await domainBrowserManager.getBrowserForDomain(
      jobParams.sourceUrl,
      job.sourceId
    );
    let page: Page | null = null;
    let pagesScraped = 0;
    let entriesCreated = 0;

    try {
      // Create a new page for this job
      page = await browser.newPage();

      // Get or create website for this domain
      const domain = this.websiteRepository.extractDomainFromUrl(
        jobParams.sourceUrl
      );
      const website = await this.websiteRepository.findOrCreateByDomain(
        domain,
        {
          name: jobParams.sourceName || domain,
          metaDescription: `Documentation for ${domain}`,
        }
      );

      // Try to fetch and parse sitemap first
      await this.fetchAndParseSitemap(domain, website.id, page);

      // Initialize crawling queue with initial URL
      const crawlQueue: Array<{ url: string; depth: number }> = [
        {
          url: jobParams.sourceUrl,
          depth: 0,
        },
      ];
      const processedUrls = new Set<string>();
      const maxPages = jobParams.maxPages || 200;

      this.logger.info(
        `Starting crawl for ${jobParams.sourceName} with max pages ${maxPages}`
      );

      while (crawlQueue.length > 0 && pagesScraped < maxPages) {
        const { url, depth } = crawlQueue.shift()!;

        // Skip if already processed
        if (processedUrls.has(url)) {
          this.logger.debug(`Skipping already processed URL: ${url}`);
          continue;
        }

        // Skip if depth exceeded (keep depth check for navigation structure)
        const maxDepth = Math.min(10, Math.ceil(Math.log10(maxPages)) + 2); // Dynamic depth based on page limit
        if (depth > maxDepth) {
          this.logger.debug(
            `Skipping URL due to depth limit (${depth} > ${maxDepth}): ${url}`
          );
          continue;
        }

        this.logger.debug(
          `Processing URL (depth ${depth}): ${url} (${crawlQueue.length} URLs remaining in queue)`
        );

        const processingStart = performance.now();

        // Apply URL filtering if patterns are specified
        if (
          jobParams.allowPatterns?.length ||
          jobParams.ignorePatterns?.length
        ) {
          const urlCheck = PatternMatcher.shouldAllowUrl(
            url,
            jobParams.allowPatterns,
            jobParams.ignorePatterns
          );

          if (!urlCheck.allowed) {
            if (
              process.env.NODE_ENV === "development" ||
              process.env.DEBUG ||
              process.env.VERBOSE_LOGGING
            ) {
              process.stderr.write(
                `🚫 URL blocked by pattern: ${url} - ${urlCheck.reason}\n`
              );
            }
            processedUrls.add(url);
            continue;
          } else {
            if (
              process.env.NODE_ENV === "development" ||
              process.env.DEBUG ||
              process.env.VERBOSE_LOGGING
            ) {
              process.stderr.write(
                `✅ URL allowed: ${url} - ${urlCheck.reason}\n`
              );
            }
          }
        }

        try {
          // Navigate to the URL
          const navigationSuccess = await browser.navigateToUrl(page, url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          if (!navigationSuccess) {
            this.logger.warn(`Failed to navigate to ${url}`);
            processedUrls.add(url);
            continue;
          }

          // Get the final URL after any redirects
          const finalUrl = page.url();
          this.logger.debug(`URL after navigation: ${url} -> ${finalUrl}`);

          // If the URL redirected, check if the final URL should be allowed
          if (
            finalUrl !== url &&
            (jobParams.allowPatterns?.length ||
              jobParams.ignorePatterns?.length)
          ) {
            const finalUrlCheck = PatternMatcher.shouldAllowUrl(
              finalUrl,
              jobParams.allowPatterns,
              jobParams.ignorePatterns
            );

            if (!finalUrlCheck.allowed) {
              if (
                process.env.NODE_ENV === "development" ||
                process.env.DEBUG ||
                process.env.VERBOSE_LOGGING
              ) {
                process.stderr.write(
                  `🚫 Final URL blocked by pattern: ${finalUrl} - ${finalUrlCheck.reason}\n`
                );
              }
              processedUrls.add(url);
              processedUrls.add(finalUrl);
              continue;
            }
          }

          // Wait for page to fully load and expand navigation elements
          await this.expandNavigationElements(page, url);

          // Extract page content
          const pageContent = await browser.extractPageContent(page);
          let htmlContent = "";
          let markdownContent = "";
          let usedSelectors = false;

          // Get domain-specific selectors or use provided selectors
          const domainSelectors = this.getDomainSpecificSelectors(finalUrl);
          const providedSelectors = jobParams.selectors;

          // Use provided selector or domain-specific selector
          let selectorToUse: string | null = null;

          if (providedSelectors) {
            selectorToUse = providedSelectors;
          } else if (domainSelectors) {
            // Convert domain-specific Record<string, string> to a single content selector
            selectorToUse =
              domainSelectors.content ||
              Object.values(domainSelectors)[0] ||
              null;
          }

          // Apply selector-based extraction if provided
          if (selectorToUse) {
            const extractedContent = await this.extractTextWithPageEvaluate(
              page,
              selectorToUse
            );

            if (extractedContent && extractedContent.trim().length > 100) {
              htmlContent = `<section data-selector="${selectorToUse}">${extractedContent}</section>`;
              markdownContent = extractedContent.trim();
              usedSelectors = true;

              this.logger.info(
                `Used selector-based extraction for ${url}, content length: ${extractedContent.length}`
              );
            } else {
              this.logger.warn(
                `Selector extraction yielded insufficient content for ${url} (${
                  extractedContent?.length || 0
                } chars), falling back to full page`
              );
            }
          }

          // Fallback to full page content if selectors weren't used or failed
          if (!usedSelectors) {
            htmlContent = await page.evaluate(() => {
              return (
                document.getElementsByName("body")[0]?.outerHTML ||
                document.documentElement.outerHTML ||
                ""
              );
            });

            markdownContent = this.convertHtmlToMarkdown(htmlContent);

            this.logger.info(
              `Used full page extraction for ${url}, markdown length: ${markdownContent.length}`
            );
          }

          // Extract DOM JSON for analysis tools (after JS rendering is complete)
          let domJsonContent: any = null;
          try {
            this.logger.info(`Extracting DOM JSON for ${url}...`);
            
            // Ensure any remaining JS has finished executing
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(500); // Small buffer for dynamic content
            
            // Extract DOM using eval script in browser context
            domJsonContent = await serializeDOMWithPlaywright(
              page,
              selectorToUse || 'html',
              {
                includeAllStyles: false,
                includeBoundingBox: true,
                includeInteractivity: true,
                maxDepth: 20, // Reasonable depth for analysis
                excludeHidden: false
              }
            );
            if (domJsonContent) {
              this.logger.info(`DOM JSON extracted successfully for ${url}, elements: ${JSON.stringify(domJsonContent).length} chars`);
            }
          } catch (error) {
            this.logger.warn(`Failed to extract DOM JSON for ${url}:`, error instanceof Error ? error.message : error);
            // Continue without DOM - don't fail the entire scraping
          }

          // Normalize the final URL (after redirects) for consistent storage
          const normalizedUrl =
            this.websitePagesRepository.normalizeUrl(finalUrl);
          const contentHash =
            this.websitePagesRepository.generateContentHash(markdownContent);

          // Create or update website page
          const pageResult = await this.websitePagesRepository.createOrUpdate({
            id: `page_${Date.now()}_${randomBytes(8).toString("hex")}`,
            websiteId: website.id,
            url: normalizedUrl,
            contentHash,
            htmlContent,
            markdownContent,
            domJsonContent, // Add DOM JSON for analysis tools
            selector: selectorToUse || undefined,
            title: pageContent.title || new URL(url).pathname,
            httpStatus: 200,
            javascriptEnabled: true,
          });

          // Smart vector indexing - handle both new and updated pages
          await this.handleVectorIndexing(
            pageResult.page,
            markdownContent,
            website,
            normalizedUrl,
            pageResult.isNew
          );

          if (pageResult.isNew) {
            this.logger.info(
              `Created new website page with vectorization: ${pageResult.page.id}`
            );
            entriesCreated++;
          } else {
            this.logger.info(
              `Updated existing website page: ${pageResult.page.id}`
            );
          }

          pagesScraped++;

          // Update job progress with throttling (every 5 pages or 60 seconds)
          await this.updateJobProgressThrottled(job.id, pagesScraped);

          processedUrls.add(url);
          // Also add the final URL to avoid reprocessing redirected URLs
          if (finalUrl !== url) {
            processedUrls.add(finalUrl);
          }

          // Add internal links to crawl queue if we haven't reached max depth
          if (depth < maxDepth) {
            const internalLinks = browser.filterInternalLinks(
              pageContent.links,
              jobParams.sourceUrl,
              jobParams.includeSubdomains || false
            );

            // Apply pattern filtering and file extension filtering to discovered links
            const filteredLinks = internalLinks.filter((link) => {
              // Filter out non-content file types
              if (this.isNonContentFile(link)) {
                return false;
              }

              if (
                jobParams.allowPatterns?.length ||
                jobParams.ignorePatterns?.length
              ) {
                const urlCheck = PatternMatcher.shouldAllowUrl(
                  link,
                  jobParams.allowPatterns,
                  jobParams.ignorePatterns
                );
                return urlCheck.allowed;
              }
              return true;
            });

            for (const link of filteredLinks) {
              if (
                !processedUrls.has(link) &&
                !crawlQueue.find((item) => item.url === link)
              ) {
                crawlQueue.push({ url: link, depth: depth + 1 });
              }
            }

            if (filteredLinks.length > 0) {
              this.logger.debug(
                `Discovered ${filteredLinks.length} new links at depth ${depth} for ${url}`
              );
            }
          }
        } catch (error) {
          this.logger.error(`Failed to process page ${url}`, error);
          processedUrls.add(url);
          continue;
        }

        const processingTime = performance.now() - processingStart;
        this.logger.info(
          `Completed processing ${url} in ${processingTime.toFixed(2)}ms`
        );
      }

      // Log final crawl summary
      this.logger.info(`Crawl completed for ${jobParams.sourceName}:`, {
        pagesScraped,
        entriesCreated,
        maxPages,
        processedUrls: Array.from(processedUrls),
        remainingInQueue: crawlQueue.length,
        totalProcessed: processedUrls.size,
      });

      // Final progress update - single update with all completion data
      await this.scrapeJobRepository.update(job.id, {
        pagesScraped: pagesScraped,
        updatedAt: new Date().toISOString(),
        status: "completed",
        lockedBy: null,
        lockedAt: null,
        completedAt: new Date().toISOString(),
        resultData: {
          processing_method: "direct",
          pages_scraped: pagesScraped,
          entries_created: entriesCreated,
          max_pages: maxPages,
          processed_urls: Array.from(processedUrls),
          remaining_in_queue: crawlQueue.length,
          total_discovered: processedUrls.size + crawlQueue.length,
          completed_at: new Date().toISOString(),
        },
      });
    } finally {
      // Clean up progress throttler
      this.progressUpdateThrottlers.delete(job.id);

      // Clean up page
      if (page) {
        try {
          await page.close();
        } catch (error) {
          this.logger.warn("Failed to close page", error);
        }
      }

      // Release browser for this source
      await domainBrowserManager.releaseBrowserForSource(
        jobParams.sourceUrl,
        job.sourceId
      );
    }
  }

  /**
   * Get status of scraping jobs
   */
  async getScrapingStatus(sourceId?: string): Promise<{
    activeJobs: any[];
    pendingJobs: any[];
    completedJobs: any[];
    failedJobs: any[];
    workerStatus: {
      workerId: string;
      isRunning: boolean;
      config: ScrapingWorkerConfig;
    };
  }> {
    const activeJobs = sourceId
      ? await this.scrapeJobRepository
          .findBySourceId(sourceId)
          .then((jobs) => jobs.filter((j) => j.status === "running"))
      : await this.scrapeJobRepository.findByStatus("running");

    const pendingJobs = sourceId
      ? await this.scrapeJobRepository
          .findBySourceId(sourceId)
          .then((jobs) => jobs.filter((j) => j.status === "pending"))
      : await this.scrapeJobRepository.findByStatus("pending");

    const completedJobs = sourceId
      ? await this.scrapeJobRepository
          .findBySourceId(sourceId)
          .then((jobs) =>
            jobs.filter((j) => j.status === "completed").slice(0, 10)
          )
      : await this.scrapeJobRepository.findByStatus("completed");

    const failedJobs = sourceId
      ? await this.scrapeJobRepository
          .findBySourceId(sourceId)
          .then((jobs) =>
            jobs.filter((j) => j.status === "failed").slice(0, 10)
          )
      : await this.scrapeJobRepository.findByStatus("failed");

    return {
      activeJobs,
      pendingJobs,
      completedJobs,
      failedJobs,
      workerStatus: {
        workerId: this.workerConfig.workerId,
        isRunning: this.isWorkerRunning,
        config: this.workerConfig,
      },
    };
  }

  /**
   * Cancel a scraping job
   */
  async cancelScrapeJob(
    jobId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const job = await this.scrapeJobRepository.findById(jobId);
      if (!job) {
        return { success: false, error: "Job not found" };
      }

      if (job.status === "completed" || job.status === "failed") {
        return { success: false, error: "Job already finished" };
      }

      await this.scrapeJobRepository.cancelJob(jobId, "Cancelled by user");

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel job",
      };
    }
  }

  /**
   * Force unlock a stuck job - useful for debugging and recovery
   */
  async forceUnlockJob(
    jobId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const job = await this.scrapeJobRepository.findById(jobId);
      if (!job) {
        return { success: false, error: "Job not found" };
      }

      await this.scrapeJobRepository.forceUnlockJob(jobId, reason);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to force unlock job",
      };
    }
  }

  /**
   * Force unlock all stuck jobs
   */
  async forceUnlockStuckJobs(
    stuckThresholdMinutes = 30
  ): Promise<{ success: boolean; unlockedCount?: number; error?: string }> {
    try {
      const unlockedCount = await this.scrapeJobRepository.forceUnlockStuckJobs(
        stuckThresholdMinutes
      );

      return { success: true, unlockedCount };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to force unlock stuck jobs",
      };
    }
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Normalize URL for consistent storage and deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Remove hash fragments
      urlObj.hash = "";

      // Remove common tracking parameters
      const trackingParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "ref",
      ];
      trackingParams.forEach((param) => {
        urlObj.searchParams.delete(param);
      });

      // Sort search parameters for consistency
      urlObj.searchParams.sort();

      // Remove trailing slash from pathname unless it's the root
      if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      return urlObj.toString();
    } catch (error) {
      this.logger.warn(`Failed to normalize URL: ${url}`, error);
      return url;
    }
  }

  /**
   * Convert HTML content to clean Markdown format
   */
  private convertHtmlToMarkdown(htmlContent: string): string {
    try {
      // Clean up the HTML first - be more selective to preserve content
      const cleanHtml = htmlContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "") // Remove noscript
        .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
        // Only remove navigation if it's clearly marked as such
        .replace(/<nav[^>]*class="[^"]*nav[^"]*"[^>]*>[\s\S]*?<\/nav>/gi, "") // Remove navigation with nav class
        .replace(
          /<div[^>]*class="[^"]*sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
          ""
        ) // Remove sidebars
        .replace(/<div[^>]*class="[^"]*menu[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "") // Remove menus
        // Preserve main content areas
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      // Convert to Markdown with better configuration
      const markdown = this.turndownService.turndown(cleanHtml);

      // Clean up the markdown more carefully
      const cleanMarkdown = markdown
        .replace(/\n\s*\n\s*\n/g, "\n\n") // Remove excessive newlines
        .replace(/^\s+|\s+$/gm, "") // Trim each line
        .replace(/\[([^\]]+)\]\(\)/g, "$1") // Remove empty links
        .replace(/\*\*\s*\*\*/g, "") // Remove empty bold
        .replace(/__\s*__/g, "") // Remove empty italic
        .replace(/\n\n\n+/g, "\n\n") // Ensure max 2 consecutive newlines
        .trim();

      // Ensure we have meaningful content
      if (cleanMarkdown.length < 100) {
        this.logger.warn(
          `Markdown conversion resulted in short content (${cleanMarkdown.length} chars), trying with less aggressive cleaning`
        );

        // Try with less aggressive cleaning
        const lessAggressiveClean = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const fallbackMarkdown =
          this.turndownService.turndown(lessAggressiveClean);
        return fallbackMarkdown.trim();
      }

      return cleanMarkdown;
    } catch (error) {
      this.logger.warn(
        "Failed to convert HTML to Markdown, using original content",
        error
      );
      return htmlContent;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Expand navigation elements and wait for dynamic content to load
   */
  private async expandNavigationElements(
    page: Page,
    url: string
  ): Promise<void> {
    try {
      this.logger.info(`Expanding navigation elements for ${url}`);

      // Set overall timeout for the entire navigation expansion process
      const expansionTimeout = 5000; // 5 seconds max
      const expansionStart = Date.now();

      // Wait for initial page load to complete (reduced from 2000ms to 500ms)
      await page.waitForTimeout(500);

      // Try to expand dropdowns and collapsible menus
      const expandableSelectors = [
        // Common dropdown triggers
        'button[aria-expanded="false"]',
        'button[aria-haspopup="menu"]',
        'button[aria-haspopup="true"]',
        ".dropdown-toggle",
        ".nav-toggle",
        ".menu-toggle",
        ".sidebar-toggle",

        // Common collapsible elements
        ".collapsible",
        ".accordion-trigger",
        ".expand-trigger",
        '[data-toggle="collapse"]',
        '[data-toggle="dropdown"]',

        // Framework-specific patterns
        ".v-expansion-panel-header", // Vuetify
        ".mat-expansion-panel-header", // Angular Material
        ".ant-collapse-header", // Ant Design
        ".bp3-collapse-header", // Blueprint

        // Generic patterns
        '[role="button"][aria-expanded="false"]',
        "details summary",
        ".show-more",
        ".expand-all",
        ".nav-expand",
      ];

      for (const selector of expandableSelectors) {
        try {
          // Find all elements matching this selector
          const elements = await page.$$eval(selector, (elements) => {
            return elements.map((el, index) => ({
              index,
              isVisible:
                (el as HTMLElement).offsetWidth > 0 &&
                (el as HTMLElement).offsetHeight > 0,
              text: el.textContent?.trim() || "",
              ariaExpanded: el.getAttribute("aria-expanded"),
              tagName: el.tagName.toLowerCase(),
            }));
          });

          if (elements.length > 0) {
            this.logger.info(
              `Found ${elements.length} expandable elements for selector: ${selector}`
            );

            // Click each expandable element
            for (const element of elements) {
              if (element.isVisible) {
                try {
                  await page.click(
                    `${selector}:nth-child(${element.index + 1})`,
                    { timeout: 5000 }
                  );
                  this.logger.debug(
                    `Clicked expandable element: ${element.text.substring(
                      0,
                      50
                    )}...`
                  );

                  // Wait for potential animation/loading (reduced from 1000ms to 200ms)
                  await page.waitForTimeout(200);

                  // Check if we've exceeded the overall timeout
                  if (Date.now() - expansionStart > expansionTimeout) {
                    this.logger.debug(
                      `Navigation expansion timeout reached, stopping after ${
                        Date.now() - expansionStart
                      }ms`
                    );
                    return;
                  }
                } catch (clickError) {
                  this.logger.debug(
                    `Failed to click element at index ${element.index}: ${clickError}`
                  );
                }
              }
            }
          }
        } catch (error) {
          // Continue with next selector if this one fails
          this.logger.debug(`Failed to process selector ${selector}: ${error}`);
        }
      }

      // Wait for any dynamically loaded content (reduced from 3000ms to 800ms)
      await page.waitForTimeout(800);

      // Check if we've exceeded the overall timeout
      if (Date.now() - expansionStart > expansionTimeout) {
        this.logger.debug(
          `Navigation expansion timeout reached, skipping load more buttons`
        );
        return;
      }

      // Try to load more content if "Load more" buttons exist
      const loadMoreSelectors = [
        'button:has-text("Load more")',
        'button:has-text("Show more")',
        'button:has-text("View more")',
        'button:has-text("See more")',
        ".load-more",
        ".show-more",
        ".view-more",
        '[data-testid="load-more"]',
        '[data-cy="load-more"]',
      ];

      for (const selector of loadMoreSelectors) {
        try {
          const loadMoreButton = await page.$(selector);
          if (loadMoreButton) {
            const isVisible = await loadMoreButton.isVisible();
            if (isVisible) {
              this.logger.info(
                `Found "Load more" button, clicking: ${selector}`
              );
              await loadMoreButton.click();

              // Wait for content to load (reduced from 2000ms to 500ms)
              await page.waitForTimeout(500);

              // Check if we've exceeded the overall timeout
              if (Date.now() - expansionStart > expansionTimeout) {
                this.logger.debug(
                  `Navigation expansion timeout reached, stopping load more processing`
                );
                return;
              }
            }
          }
        } catch (error) {
          this.logger.debug(
            `Failed to click load more button ${selector}: ${error}`
          );
        }
      }

      // Scroll to bottom to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for lazy-loaded content (reduced from 2000ms to 300ms)
      await page.waitForTimeout(300);

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      this.logger.info(`Completed navigation expansion for ${url}`);
    } catch (error) {
      this.logger.warn(
        `Failed to expand navigation elements for ${url}`,
        error
      );
      // Don't throw - continue with scraping even if expansion fails
    }
  }

  /**
   * Get or create a documentation source
   */
  async getOrCreateDocumentationSource(params: {
    url: string;
    name?: string;
    sourceType?: string;
    maxPages?: number;
    selectors?: string; // Plain string selector - CSS selector or JavaScript code
    allowPatterns?: (string | ScrapingPattern)[];
    ignorePatterns?: (string | ScrapingPattern)[];
    includeSubdomains?: boolean;
    updateFrequency?: DocumentationSource["updateFrequency"];
  }): Promise<string> {
    // Generate a source ID based on URL
    const urlHash = createHash("sha256")
      .update(params.url)
      .digest("hex")
      .substring(0, 16);
    const sourceId = `source_${urlHash}`;

    // Check if source already exists
    const existing = await this.documentationRepository.findById(sourceId);

    if (existing) {
      return sourceId;
    }

    // Create new documentation source
    const newSource = await this.documentationRepository.create({
      id: sourceId,
      name: params.name || new URL(params.url).hostname,
      url: params.url,
      sourceType: (params.sourceType || "guide") as any,
      maxPages: params.maxPages || 200,
      selectors: params.selectors,
      allowPatterns: params.allowPatterns || [],
      ignorePatterns: params.ignorePatterns || [],
      includeSubdomains: params.includeSubdomains || false,
      status: "not_started",
      updateFrequency: params.updateFrequency || "weekly",
    });

    if (!newSource) {
      throw new Error("Failed to create documentation source");
    }

    return sourceId;
  }

  /**
   * Smart vector indexing handler for both new and updated pages
   * Checks for existing vector documents and handles indexing intelligently
   */
  private async handleVectorIndexing(
    page: any,
    content: string,
    website: any,
    url: string,
    isNewPage: boolean
  ): Promise<void> {
    try {
      // Skip empty content
      if (!content || content.trim().length < 50) {
        this.logger.debug(
          `Skipping vectorization for short content: ${page.id}`
        );
        return;
      }

      // Determine collection name based on website
      const collectionName = `website_${website.id}`;

      // Enhanced metadata with all necessary fields for filtering and comparison
      const enhancedMetadata = {
        url: url,
        title: page.title,
        websiteId: website.id,
        websiteName: website.name,
        domain: website.domain,
        pageId: page.id,
        contentHash: page.contentHash,
        scrapedAt: new Date().toISOString(),
        type: 'website_page'
      };

      // Check if vector document already exists for this page
      const existingVectorDocs = await this.vectorSearchService.lanceDBService.findExistingDocuments(
        collectionName,
        website.id,
        page.id
      );

      let shouldIndex = false;
      let indexReason = '';

      if (existingVectorDocs.length === 0) {
        // No vector document exists - must index
        shouldIndex = true;
        indexReason = 'no vector document found';
      } else {
        // Check if content hash has changed
        const existingDoc = existingVectorDocs[0];
        const existingContentHash = existingDoc.metadata?.contentHash;
        
        if (existingContentHash !== page.contentHash) {
          // Content changed - need to re-index
          shouldIndex = true;
          indexReason = `content hash changed (${existingContentHash} -> ${page.contentHash})`;
        } else {
          // Content unchanged - skip indexing
          this.logger.debug(
            `Skipping vector indexing for page ${page.id} - content unchanged`,
            {
              pageId: page.id,
              url: url,
              contentHash: page.contentHash
            }
          );
        }
      }

      if (shouldIndex) {
        this.logger.info(
          `Indexing page ${page.id} to vector collection: ${indexReason}`,
          {
            pageId: page.id,
            url: url,
            isNewPage,
            contentHash: page.contentHash,
            collection: collectionName
          }
        );

        // Use the enhanced vector document replacement method
        const result = await this.vectorSearchService.lanceDBService.replaceDocumentForPage(
          collectionName,
          {
            id: page.id,
            content: content.trim(),
            metadata: enhancedMetadata,
            type: 'text'
          },
          false // Don't force refresh since we already checked content hash
        );

        if (result.success) {
          this.logger.info(
            `Successfully ${result.action} vector document for page ${page.id}`,
            {
              action: result.action,
              collection: collectionName,
              contentLength: content.length
            }
          );
        } else {
          this.logger.warn(
            `Failed to update vector document for page ${page.id}: ${result.error}`,
            {
              collection: collectionName,
              error: result.error
            }
          );
        }
      }

    } catch (error) {
      this.logger.error(
        `Smart vector indexing failed for page ${page.id}`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          pageId: page.id,
          url: url,
          isNewPage
        }
      );
      // Don't throw - vectorization failure shouldn't break scraping
    }
  }

  /**
   * Add scraped content to vector collection for semantic search
   * @deprecated Use handleVectorIndexing instead for smarter indexing
   */
  private async addToVectorCollection(
    entryId: string,
    content: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // Skip empty content
      if (!content || content.trim().length < 50) {
        this.logger.debug(
          `Skipping vectorization for short content: ${entryId}`
        );
        return;
      }

      // Determine collection name based on website
      const collectionName = metadata.websiteId
        ? `website_${metadata.websiteId}`
        : "documentation";

      // Add to vector collection
      const result = await this.vectorSearchService.addDocuments(
        collectionName,
        [
          {
            id: entryId,
            content: content.trim(),
            metadata,
          },
        ]
      );

      if (result.success) {
        this.logger.info(
          `Added document to vector collection ${collectionName}: ${entryId}`
        );
      } else {
        this.logger.warn(
          `Failed to add document to vector collection: ${result.error}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Vector collection addition failed for ${entryId}`,
        error
      );
      // Don't throw - vectorization failure shouldn't break scraping
    }
  }

  /**
   * Search scraped documentation using semantic similarity
   */
  async searchDocumentation(
    query: string,
    options: {
      collection?: string;
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<{
    success: boolean;
    results?: Array<{
      id: string;
      content: string;
      url?: string;
      title?: string;
      similarity: number;
    }>;
    error?: string;
  }> {
    try {
      const {
        collection = "documentation",
        limit = 10,
        threshold = 0.7,
      } = options;

      const results = await this.vectorSearchService.searchSimilar(
        collection,
        query,
        limit,
        threshold
      );

      return {
        success: true,
        results: results.map((result) => ({
          id: result.id,
          content: result.content,
          url: result.metadata?.url,
          title: result.metadata?.title,
          similarity: result.similarity,
        })),
      };
    } catch (error) {
      this.logger.error("Documentation search failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
      };
    }
  }

  /**
   * Get vector collection statistics
   */
  async getVectorStats(): Promise<{
    success: boolean;
    collections?: Array<{
      name: string;
      documentCount: number;
    }>;
    error?: string;
  }> {
    try {
      const collections = await this.vectorSearchService.listCollections();

      return {
        success: true,
        collections: collections.map((col) => ({
          name: col.name,
          documentCount: col.count,
        })),
      };
    } catch (error) {
      this.logger.error("Failed to get vector stats", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Stats failed",
      };
    }
  }

  /**
   * Check if a URL points to a non-content file that should be ignored
   */
  private isNonContentFile(url: string): boolean {
    const nonContentExtensions = [
      ".js",
      ".css",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".ico",
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".json",
      ".xml",
    ];

    try {
      const urlPath = new URL(url).pathname;
      return nonContentExtensions.some((ext) => urlPath.endsWith(ext));
    } catch {
      return false;
    }
  }

  /**
   * Get domain-specific selectors for better content extraction
   */
  private getDomainSpecificSelectors(
    url: string
  ): Record<string, string> | null {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Domain-specific selector mappings
      const domainSelectors: Record<string, Record<string, string>> = {
        "stenciljs.com": {
          content:
            "article, main .markdown-body, .content-wrapper, .main-content",
        },
        "reactjs.org": {
          content: "article, .markdown-body, .content-wrapper",
        },
        "vuejs.org": {
          content: "article, .content, .markdown-body",
        },
        "angular.io": {
          content: "article, .docs-content, .content",
        },
        "docs.github.com": {
          content: "article, .markdown-body",
        },
        "developer.mozilla.org": {
          content: "article, .main-page-content",
        },
        "stackoverflow.com": {
          content: ".question, .answer, .post-text",
        },
        "medium.com": {
          content: "article, .postArticle-content",
        },
      };

      // Check for exact hostname match
      if (domainSelectors[hostname]) {
        this.logger.info(`Using domain-specific selectors for ${hostname}`);
        return domainSelectors[hostname];
      }

      // Check for subdomain matches
      for (const [domain, selectors] of Object.entries(domainSelectors)) {
        if (hostname.endsWith(`.${domain}`)) {
          this.logger.info(
            `Using domain-specific selectors for ${hostname} (matches ${domain})`
          );
          return selectors;
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to get domain-specific selectors for ${url}`,
        error
      );
      return null;
    }
  }

  /**
   * Update job progress with throttling to avoid overwhelming database
   * Updates only when:
   * - Every 5 pages have been processed, OR
   * - 60 seconds have passed since last update, OR
   * - Force update is requested (job completion)
   * Always updates the updatedAt timestamp to show the job is active
   */
  private async updateJobProgressThrottled(
    jobId: string,
    pagesScraped: number,
    forceUpdate: boolean = false
  ): Promise<void> {
    const now = Date.now();
    const PAGE_THRESHOLD = 5;
    const TIME_THRESHOLD_MS = 60000; // 60 seconds

    let throttler = this.progressUpdateThrottlers.get(jobId);
    if (!throttler) {
      throttler = {
        lastUpdateTime: now,
        pagesSinceLastUpdate: 0,
      };
      this.progressUpdateThrottlers.set(jobId, throttler);
    }

    // Only increment if this is not a force update (to avoid double counting on completion)
    if (!forceUpdate) {
      throttler.pagesSinceLastUpdate++;
    }

    const timeSinceLastUpdate = now - throttler.lastUpdateTime;
    const shouldUpdateByPages =
      throttler.pagesSinceLastUpdate >= PAGE_THRESHOLD;
    const shouldUpdateByTime = timeSinceLastUpdate >= TIME_THRESHOLD_MS;

    if (forceUpdate || shouldUpdateByPages || shouldUpdateByTime) {
      try {
        // Always update both pagesScraped and updatedAt to show activity
        await this.scrapeJobRepository.update(jobId, {
          pagesScraped: pagesScraped,
          updatedAt: new Date().toISOString(),
        });

        // Reset throttler
        throttler.lastUpdateTime = now;
        throttler.pagesSinceLastUpdate = 0;

        if (forceUpdate) {
          this.logger.debug(
            `Force updated job progress: ${jobId} (${pagesScraped} pages)`
          );
        } else if (shouldUpdateByPages) {
          this.logger.debug(
            `Updated job progress by page count: ${jobId} (${pagesScraped} pages)`
          );
        } else if (shouldUpdateByTime) {
          this.logger.debug(
            `Updated job progress by time: ${jobId} (${pagesScraped} pages, ${timeSinceLastUpdate}ms elapsed)`
          );
        }
      } catch (error) {
        this.logger.error(`Failed to update job progress for ${jobId}`, error);
      }
    } else {
      // Even if we don't update the page count, at least update the timestamp every 10 seconds
      // to show that the job is still active
      const HEARTBEAT_THRESHOLD_MS = 10000; // 10 seconds
      if (timeSinceLastUpdate >= HEARTBEAT_THRESHOLD_MS) {
        try {
          await this.scrapeJobRepository.update(jobId, {
            updatedAt: new Date().toISOString(),
          });

          throttler.lastUpdateTime = now;
          this.logger.debug(
            `Updated job heartbeat: ${jobId} (${pagesScraped} pages)`
          );
        } catch (error) {
          this.logger.error(
            `Failed to update job heartbeat for ${jobId}`,
            error
          );
        }
      }
    }
  }

  /**
   * Extract text using page.evaluate for better SPA compatibility
   * With improved timeout handling and error recovery
   */
  private async extractTextWithPageEvaluate(
    page: Page,
    selector: string
  ): Promise<string | null> {
    try {
      // Add a timeout to the page.evaluate call to prevent hanging
      const result = await Promise.race([
        page.evaluate(async (sel: string) => {
          // Helper function to wait for element with timeout
          const waitForElement = (
            selector: string,
            timeout: number = 5000
          ): Promise<Element | null> => {
            return new Promise((resolve) => {
              const startTime = Date.now();

              const checkElement = () => {
                try {
                  const element = document.querySelector(selector);
                  if (element) {
                    resolve(element);
                    return;
                  }

                  if (Date.now() - startTime > timeout) {
                    resolve(null);
                    return;
                  }

                  // Use requestAnimationFrame for better performance
                  requestAnimationFrame(checkElement);
                } catch (error) {
                  resolve(null);
                }
              };

              checkElement();
            });
          };

          try {
            // Wait for element to appear (important for SPAs) - reduced timeout
            const element = await waitForElement(sel, 5000);
            if (!element) {
              return null;
            }

            // Check if element is visible
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const isVisible =
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              style.opacity !== "0";

            if (!isVisible) {
              return null;
            }

            // Get text content, trying different methods for better compatibility
            const textContent =
              element.textContent || (element as HTMLElement).innerText || "";

            // If the element is a container, try to get meaningful content
            if (textContent.length < 50 && element.children.length > 0) {
              // Try to get content from immediate children
              const childTexts: string[] = [];
              for (const child of Array.from(element.children)) {
                const childText = (
                  child.textContent ||
                  (child as HTMLElement).innerText ||
                  ""
                ).trim();
                if (childText.length > 0) {
                  childTexts.push(childText);
                }
              }

              if (childTexts.length > 0) {
                return childTexts.join("\n\n");
              }
            }

            return textContent;
          } catch (error) {
            // Return null if there's any error in the evaluation
            return null;
          }
        }, selector),
        // Add a 10 second timeout to prevent hanging
        new Promise<string | null>((resolve) => {
          setTimeout(() => {
            resolve(null);
          }, 10000);
        }),
      ]);

      return result && result.trim().length > 0 ? result.trim() : null;
    } catch (error) {
      this.logger.debug(
        `Failed to extract text with page.evaluate for selector: ${selector}`,
        error
      );
      return null;
    }
  }

  /**
   * Fetch and parse sitemap.xml for the domain
   */
  private async fetchAndParseSitemap(
    domain: string,
    websiteId: string,
    page: Page
  ): Promise<void> {
    try {
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      this.logger.info(`Attempting to fetch sitemap: ${sitemapUrl}`);

      const response = await page.goto(sitemapUrl, {
        waitUntil: "domcontentloaded",
      });
      if (response?.status() === 200) {
        const content = await page.content();

        // Store sitemap content in website metadata
        await this.websiteRepository.update(websiteId, {
          sitemapData: content,
        });

        this.logger.info(
          `Successfully fetched and stored sitemap for ${domain}`
        );
      } else {
        this.logger.debug(
          `No sitemap found at ${sitemapUrl} (status: ${response?.status()})`
        );
      }
    } catch (error) {
      this.logger.debug(`Failed to fetch sitemap for ${domain}`, error);
      // Don't throw - sitemap failure shouldn't break scraping
    }
  }
}
