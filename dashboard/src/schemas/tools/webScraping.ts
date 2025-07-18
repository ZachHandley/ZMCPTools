import { z } from 'zod';
import type { ScrapingPattern, StringPattern, PathPattern, VersionPattern } from '../../utils/patternMatcher.js';

// ===============================================
// Web Scraping Tool Request Schemas
// ===============================================

// Pattern validation function - basic validation to avoid circular dependency
const validatePatternArray = (patterns: (string | ScrapingPattern)[]): boolean => {
  return patterns.every(pattern => {
    if (typeof pattern === 'string') {
      // Basic string validation - detailed validation happens in PatternMatcher
      return pattern.length > 0;
    }
    // For JSON patterns, we assume they're valid if they're objects
    // The PatternMatcher will handle validation during matching
    return typeof pattern === 'object' && pattern !== null;
  });
};

export const ScrapeDocumentationSchema = z.object({
  // Core scraping parameters
  url: z.string().describe('The URL of the website to scrape. Must be a valid HTTP/HTTPS URL. This is the starting point for the scraping process.'),
  name: z.string().optional().describe('Optional human-readable name for this documentation source. If not provided, the hostname from the URL will be used.'),
  source_type: z.enum(['api', 'guide', 'reference', 'tutorial']).default('guide').describe('Type of documentation being scraped. Used for optimization and categorization. Choose "api" for API documentation, "guide" for tutorials/guides, "reference" for reference docs, or "tutorial" for step-by-step tutorials.'),
  max_pages: z.number().int().min(1).max(1000).default(200).describe('Maximum number of pages to scrape from the website. Helps prevent runaway scraping. Range: 1-1000 pages.'),
  selectors: z.string().optional().describe('CSS selectors to target specific content areas on pages. Use standard CSS selector syntax (e.g., "main article", ".content", "#documentation"). If not provided, the entire page content will be extracted.'),
  
  // Pattern-based URL filtering (legacy support)
  allow_patterns: z.array(z.union([z.string(), z.record(z.string(), z.any())])).optional().refine(
    (patterns) => !patterns || validatePatternArray(patterns),
    { message: "Invalid pattern format. Use string patterns (*/docs/*), regex patterns (/api\\/v[0-9]+\\/.*/) or JSON patterns ({\"path_segment\": \"docs\"})." }
  ).describe('Legacy pattern support for URL filtering. Use allow_path_segments, allow_url_contains, or other typed parameters instead. Patterns can be glob patterns (*/docs/*), regex patterns (/api\\/v[0-9]+\\/.*/) or JSON objects with specific matching rules.'),
  ignore_patterns: z.array(z.union([z.string(), z.record(z.string(), z.any())])).optional().refine(
    (patterns) => !patterns || validatePatternArray(patterns),
    { message: "Invalid pattern format. Use string patterns (*/private/*), regex patterns (/login|admin/) or JSON patterns ({\"extension\": [\"js\", \"css\"]})." }
  ).describe('Legacy pattern support for URL exclusion. Use ignore_path_segments, ignore_url_contains, or other typed parameters instead. Patterns can be glob patterns (*/private/*), regex patterns (/login|admin/) or JSON objects with specific matching rules.'),
  
  // Typed pattern parameters (recommended approach)
  allow_path_segments: z.array(z.string()).optional().describe('Array of path segments that URLs must contain to be scraped. For example, ["docs", "api"] will only scrape URLs containing /docs/ or /api/ in their path.'),
  ignore_path_segments: z.array(z.string()).optional().describe('Array of path segments to exclude from scraping. For example, ["admin", "private"] will skip URLs containing /admin/ or /private/ in their path.'),
  allow_file_extensions: z.array(z.string()).optional().describe('Array of file extensions to include in scraping. For example, ["html", "php"] will only scrape URLs ending with .html or .php. Do not include the dot prefix.'),
  ignore_file_extensions: z.array(z.string()).optional().describe('Array of file extensions to exclude from scraping. For example, ["js", "css", "png"] will skip JavaScript, CSS, and image files. Do not include the dot prefix.'),
  allow_url_contains: z.array(z.string()).optional().describe('Array of substrings that URLs must contain to be scraped. For example, ["documentation", "guide"] will only scrape URLs containing these terms anywhere in the URL.'),
  ignore_url_contains: z.array(z.string()).optional().describe('Array of substrings that will exclude URLs from scraping. For example, ["login", "signup", "404"] will skip URLs containing these terms anywhere in the URL.'),
  allow_url_starts_with: z.array(z.string()).optional().describe('Array of URL prefixes that must match for URLs to be scraped. For example, ["https://docs.example.com/v2/"] will only scrape URLs starting with this prefix.'),
  ignore_url_starts_with: z.array(z.string()).optional().describe('Array of URL prefixes that will exclude URLs from scraping. For example, ["https://example.com/legacy/"] will skip URLs starting with this prefix.'),
  allow_version_patterns: z.array(z.object({
    prefix: z.string().describe('URL prefix before version number (e.g., "https://docs.example.com/v")'),
    major: z.number().optional().describe('Required major version number (e.g., 2 for v2.x.x)'),
    minor: z.number().optional().describe('Required minor version number (e.g., 1 for vx.1.x)'),
    patch: z.number().optional().describe('Required patch version number (e.g., 0 for vx.x.0)')
  })).optional().describe('Array of version patterns to include in scraping. Useful for versioned documentation. For example, to scrape only v2.x.x docs, use: [{"prefix": "https://docs.example.com/v", "major": 2}]'),
  ignore_version_patterns: z.array(z.object({
    prefix: z.string().describe('URL prefix before version number (e.g., "https://docs.example.com/v")'),
    major: z.number().optional().describe('Major version number to exclude (e.g., 1 for v1.x.x)'),
    minor: z.number().optional().describe('Minor version number to exclude (e.g., 0 for vx.0.x)'),
    patch: z.number().optional().describe('Patch version number to exclude (e.g., 0 for vx.x.0)')
  })).optional().describe('Array of version patterns to exclude from scraping. Useful for skipping deprecated versions. For example, to skip v1.x.x docs, use: [{"prefix": "https://docs.example.com/v", "major": 1}]'),
  allow_glob_patterns: z.array(z.string()).optional().describe('Array of glob patterns for URLs to include in scraping. Supports wildcards: * (match any characters), ? (match single character), [abc] (match any character in brackets). For example, ["*/docs/*", "*/api/v*"]'),
  ignore_glob_patterns: z.array(z.string()).optional().describe('Array of glob patterns for URLs to exclude from scraping. Supports wildcards: * (match any characters), ? (match single character), [abc] (match any character in brackets). For example, ["*/private/*", "*/admin/*"]'),
  allow_regex_patterns: z.array(z.string()).optional().describe('Array of regular expressions for URLs to include in scraping. Use standard regex syntax. For example, ["/api/v[0-9]+/", "/docs/[a-z]+/"] will match versioned API paths and alphabetic doc paths.'),
  ignore_regex_patterns: z.array(z.string()).optional().describe('Array of regular expressions for URLs to exclude from scraping. Use standard regex syntax. For example, ["/login", "/admin", "/\\\\.(js|css|png|jpg)$"] will skip login, admin, and static asset URLs.'),
  
  // Scraping behavior options
  include_subdomains: z.boolean().default(false).describe('Whether to include subdomains in the scraping process. If true, links to subdomains (e.g., api.example.com when scraping docs.example.com) will be followed.'),
  force_refresh: z.boolean().default(false).describe('Whether to force refresh of previously scraped pages. If true, pages will be re-scraped even if they already exist in the database.'),
  agent_id: z.string().optional().describe('Optional agent ID for tracking and memory storage. If provided, scraping insights and results will be stored in the agent\'s memory for future reference.'),
  enable_sampling: z.boolean().default(true).describe('Whether to enable intelligent parameter optimization through website sampling. When enabled, the scraper will analyze the website structure and optimize filtering parameters automatically.'),
  sampling_timeout: z.number().optional().default(30000).describe('Timeout in milliseconds for the sampling/optimization process. Default is 30 seconds. Only used when enable_sampling is true.')
}).describe('Scrape documentation from a website using intelligent sub-agents. This is the primary tool for collecting documentation content. Jobs are queued and processed automatically by the background worker. Supports advanced URL filtering, content extraction, and intelligent parameter optimization.');

export const GetScrapingStatusSchema = z.object({
  source_id: z.string().optional().describe('Optional source ID to filter status for a specific documentation source. If not provided, returns status for all sources.'),
  include_job_details: z.boolean().default(true).describe('Whether to include detailed job information in the response. If false, returns only summary statistics for better performance.')
}).describe('Get the current status of scraping jobs, including active, pending, completed, and failed jobs. Use this to monitor scraping progress and troubleshoot issues.');

export const CancelScrapeJobSchema = z.object({
  job_id: z.string().describe('The unique identifier of the scraping job to cancel. Get this from the response of scrape_documentation or get_scraping_status.')
}).describe('Cancel an active or pending scraping job. Useful for stopping runaway scraping or when scraping parameters need to be adjusted.');

export const ForceUnlockJobSchema = z.object({
  job_id: z.string().describe('The unique identifier of the stuck scraping job to unlock. Get this from get_scraping_status.'),
  reason: z.string().optional().describe('Optional reason for unlocking the job. This will be logged for debugging purposes.')
}).describe('Force unlock a stuck scraping job that has been locked but is no longer actively processing. Use this for debugging and recovery when jobs become unresponsive.');

export const ForceUnlockStuckJobsSchema = z.object({
  stuck_threshold_minutes: z.number().min(1).max(1440).default(30).describe('Consider jobs stuck if they haven\'t been updated for this many minutes. Range: 1-1440 minutes (24 hours). Default is 30 minutes.')
}).describe('Force unlock all stuck scraping jobs in batch. Jobs are considered stuck if they haven\'t been updated recently. This is useful for system recovery after crashes or network issues.');

export const ListDocumentationSourcesSchema = z.object({
  include_stats: z.boolean().default(true).describe('Whether to include page count statistics for each documentation source. If false, returns only basic source information for better performance.')
}).describe('List all configured documentation sources (websites) that have been scraped or are being scraped. Useful for getting an overview of your documentation collection.');

export const DeletePagesByPatternSchema = z.object({
  website_id: z.string().describe('The unique identifier of the website whose pages should be deleted. Get this from list_documentation_sources.'),
  url_patterns: z.array(z.string()).describe('Array of URL patterns to match for deletion. Uses glob patterns (* for wildcards). For example, ["*/v1/*", "*/legacy/*"] will delete pages with /v1/ or /legacy/ in their URLs.'),
  dry_run: z.boolean().default(true).describe('Whether to perform a dry run (preview) without actually deleting pages. Set to false to actually delete pages. Default is true for safety.')
}).describe('Delete website pages that match specific URL patterns. Useful for cleaning up outdated documentation, version-specific pages, or unwanted content. Always run with dry_run=true first to preview what will be deleted.');

export const DeletePagesByIdsSchema = z.object({
  page_ids: z.array(z.string()).min(1).describe('Array of page IDs to delete. Must contain at least one page ID. Get page IDs from search results or database queries.')
}).describe('Delete specific pages by their unique identifiers. Use this when you need precise control over which pages to delete, rather than pattern-based deletion.');

export const DeleteAllWebsitePagesSchema = z.object({
  website_id: z.string().describe('The unique identifier of the website whose pages should be deleted. Get this from list_documentation_sources.'),
  confirm: z.boolean().default(false).describe('Safety confirmation flag. Must be set to true to actually delete all pages. This prevents accidental deletion of entire websites.')
}).describe('Delete all pages for a specific website. This is a destructive operation that removes all scraped content for the website. Useful for starting fresh before re-scraping. Requires explicit confirmation.');

// Export inferred types for requests
export type ScrapeDocumentationInput = z.infer<typeof ScrapeDocumentationSchema>;
export type GetScrapingStatusInput = z.infer<typeof GetScrapingStatusSchema>;
export type CancelScrapeJobInput = z.infer<typeof CancelScrapeJobSchema>;
export type ForceUnlockJobInput = z.infer<typeof ForceUnlockJobSchema>;
export type ForceUnlockStuckJobsInput = z.infer<typeof ForceUnlockStuckJobsSchema>;
export type ListDocumentationSourcesInput = z.infer<typeof ListDocumentationSourcesSchema>;
export type DeletePagesByPatternInput = z.infer<typeof DeletePagesByPatternSchema>;
export type DeletePagesByIdsInput = z.infer<typeof DeletePagesByIdsSchema>;
export type DeleteAllWebsitePagesInput = z.infer<typeof DeleteAllWebsitePagesSchema>;

// ===============================================
// Web Scraping Tool Response Schemas
// ===============================================

// Scrape Documentation Response
export const ScrapeDocumentationResponseSchema = z.object({
  success: z.boolean().describe('Whether the scraping job was successfully queued. True if queued or skipped (already exists), false if failed.'),
  message: z.string().describe('Human-readable message describing the result of the scraping request, including optimization details if applicable.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the scraping request and queue the job.'),
  data: z.object({
    job_id: z.string().describe('Unique identifier for the queued scraping job. Use this ID to check status, cancel, or force unlock the job.'),
    source_id: z.string().describe('Unique identifier for the documentation source (website). Multiple jobs can share the same source_id.'),
    pages_scraped: z.number().describe('Number of pages currently scraped for this job. Will be 0 for newly queued jobs.'),
    pages_total: z.number().describe('Maximum number of pages that will be scraped for this job, as specified in the request.'),
    status: z.string().describe('Current status of the scraping job. Values: "queued" (job is waiting to be processed), "skipped" (job already exists), "active" (currently processing), "completed" (finished successfully), "failed" (failed with errors).'),
    websites: z.array(z.object({
      id: z.string().describe('Unique identifier for the website configuration.'),
      name: z.string().describe('Human-readable name for the website, either provided in the request or derived from the URL hostname.'),
      url: z.string().describe('The base URL of the website being scraped.'),
      max_pages: z.number().describe('Maximum number of pages to scrape for this website.'),
      optimization: z.object({
        enabled: z.boolean().describe('Whether parameter optimization was enabled for this scraping job.'),
        confidence: z.number().optional().describe('Confidence score (0-1) for the optimization results. Higher values indicate more reliable optimization.'),
        reasoning: z.string().optional().describe('Explanation of why specific optimization parameters were chosen based on website analysis.'),
        status: z.string().optional().describe('Status of the optimization process. Values: "completed" (optimization succeeded), "fallback_used" (optimization failed, using fallback), "disabled" (optimization was disabled).'),
        optimized_parameters: z.object({
          max_pages: z.number().describe('Optimized maximum number of pages to scrape based on website analysis.'),
          selectors: z.string().optional().describe('Optimized CSS selectors for content extraction based on website structure.'),
          allow_patterns_count: z.number().describe('Number of URL patterns generated to include relevant pages.'),
          ignore_patterns_count: z.number().describe('Number of URL patterns generated to exclude irrelevant pages.'),
          include_subdomains: z.boolean().describe('Whether subdomain scraping was recommended based on website structure.')
        }).optional().describe('Detailed optimization parameters that were automatically generated. Only present if optimization was successful.')
      }).describe('Information about parameter optimization performed on the website to improve scraping efficiency and relevance.')
    })).describe('Array of website configurations affected by this scraping request. Usually contains one website.')
  }).optional().describe('Detailed information about the queued scraping job and website configuration. Only present if the request was successful.')
}).describe('Response from the scrape_documentation tool containing job details and optimization information.');

// Get Scraping Status Response
export const GetScrapingStatusResponseSchema = z.object({
  success: z.boolean().describe('Whether the status request was successful. True if status was retrieved, false if an error occurred.'),
  message: z.string().describe('Human-readable message describing the status query result, including number of jobs found.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the status response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to query and compile the scraping status information.'),
  data: z.object({
    source_id: z.string().optional().describe('The source ID that was queried for status. Only present if a specific source was requested.'),
    status: z.string().describe('Type of status information returned. Values: "summary" (job counts only), "detailed" (full job information).'),
    jobs: z.array(z.any()).describe('Array of job information. For summary status, contains job counts. For detailed status, contains full job objects with progress, errors, and configuration details.'),
    pages_scraped: z.number().describe('Total number of pages scraped across all active jobs. Updated in real-time as jobs progress.'),
    pages_total: z.number().describe('Total number of pages that will be scraped across all active jobs. Sum of max_pages for all jobs.')
  }).optional().describe('Status information for scraping jobs. Only present if the request was successful.')
}).describe('Response from the get_scraping_status tool containing current job status and progress information.');

// Cancel Scrape Job Response
export const CancelScrapeJobResponseSchema = z.object({
  success: z.boolean().describe('Whether the job cancellation was successful. True if the job was cancelled, false if cancellation failed.'),
  message: z.string().describe('Human-readable message describing the result of the cancellation request, including any error details.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the cancellation response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the cancellation request.'),
  data: z.object({
    job_id: z.string().describe('The unique identifier of the job that was cancelled.'),
    status: z.string().describe('Updated status of the cancelled job. Usually "cancelled" for successfully cancelled jobs.')
  }).optional().describe('Information about the cancelled job. Only present if the cancellation was successful.')
}).describe('Response from the cancel_scrape_job tool indicating whether the job was successfully cancelled.');

// Force Unlock Job Response
export const ForceUnlockJobResponseSchema = z.object({
  success: z.boolean().describe('Whether the job unlock was successful. True if the job was unlocked, false if the unlock failed.'),
  message: z.string().describe('Human-readable message describing the result of the unlock request, including any error details.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the unlock response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the unlock request.'),
  data: z.object({
    job_id: z.string().describe('The unique identifier of the job that was unlocked.'),
    status: z.string().describe('Updated status of the unlocked job. Usually "unlocked" for successfully unlocked jobs.'),
    reason: z.string().optional().describe('Optional reason for unlocking that was provided in the request. Used for debugging and logging.')
  }).optional().describe('Information about the unlocked job. Only present if the unlock was successful.')
}).describe('Response from the force_unlock_job tool indicating whether the stuck job was successfully unlocked.');

// Force Unlock Stuck Jobs Response
export const ForceUnlockStuckJobsResponseSchema = z.object({
  success: z.boolean().describe('Whether the batch unlock operation was successful. True if stuck jobs were unlocked, false if the operation failed.'),
  message: z.string().describe('Human-readable message describing the result of the batch unlock operation, including the number of jobs affected.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the batch unlock response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the batch unlock request.'),
  data: z.object({
    job_id: z.string().describe('Identifier for the batch unlock operation. Usually "batch_unlock" to indicate this was a batch operation.'),
    status: z.string().describe('Status of the batch unlock operation. Usually "batch_unlocked" for successful operations.'),
    jobs: z.array(z.any()).describe('Array of job information for the unlocked jobs. May be empty if no jobs were unlocked.'),
    deleted_count: z.number().describe('Number of stuck jobs that were successfully unlocked during the batch operation.')
  }).optional().describe('Information about the batch unlock operation. Only present if the operation was successful.')
}).describe('Response from the force_unlock_stuck_jobs tool indicating how many stuck jobs were unlocked.');

// List Documentation Sources Response
export const ListDocumentationSourcesResponseSchema = z.object({
  success: z.boolean().describe('Whether the sources listing was successful. True if sources were retrieved, false if an error occurred.'),
  message: z.string().describe('Human-readable message describing the result of the sources listing, including the number of sources found.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the sources listing response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to query and compile the documentation sources information.'),
  data: z.object({
    sources: z.array(z.object({
      id: z.string().describe('Unique identifier for the documentation source.'),
      name: z.string().describe('Human-readable name of the documentation source, either provided during scraping or derived from the URL.'),
      domain: z.string().describe('Domain name of the documentation website (e.g., "docs.example.com").'),
      metaDescription: z.string().optional().describe('Meta description from the website, if available. Provides a brief summary of the documentation content.'),
      createdAt: z.string().describe('ISO 8601 timestamp when the documentation source was first created in the system.'),
      updatedAt: z.string().describe('ISO 8601 timestamp when the documentation source was last updated (e.g., when pages were last scraped).'),
      pageCount: z.number().optional().describe('Number of pages scraped for this documentation source. Only present if include_stats was true in the request.')
    })).describe('Array of documentation sources that have been configured and scraped in the system.'),
    total_sources: z.number().describe('Total number of documentation sources found in the system.')
  }).optional().describe('Documentation sources information. Only present if the request was successful.')
}).describe('Response from the list_documentation_sources tool containing information about all configured documentation websites.');

// Delete Pages By Pattern Response
export const DeletePagesByPatternResponseSchema = z.object({
  success: z.boolean().describe('Whether the page deletion operation was successful. True if pages were deleted or dry run completed, false if an error occurred.'),
  message: z.string().describe('Human-readable message describing the result of the deletion operation, including the number of pages affected.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the deletion response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the deletion request.'),
  data: z.object({
    pages_matched: z.number().describe('Number of pages that matched the deletion patterns. These are the pages that would be or were deleted.'),
    pages_deleted: z.number().describe('Number of pages that were actually deleted. Will be 0 for dry runs.'),
    dry_run: z.boolean().describe('Whether this was a dry run (preview) or actual deletion. True means no pages were actually deleted.'),
    matched_urls: z.array(z.object({
      id: z.string().describe('Unique identifier of the matched page.'),
      url: z.string().describe('URL of the matched page that would be or was deleted.')
    })).optional().describe('Array of matched page URLs for preview. Only present for dry runs, and limited to first 20 results for performance.'),
    patterns_used: z.array(z.string()).describe('Array of URL patterns that were used to match pages for deletion. These are the patterns provided in the request.'),
    total_pages_scanned: z.number().describe('Total number of pages that were scanned for pattern matching in the website.')
  }).optional().describe('Detailed information about the page deletion operation. Only present if the operation was successful.')
}).describe('Response from the delete_pages_by_pattern tool indicating how many pages were matched and deleted.');

// Delete Pages By Ids Response
export const DeletePagesByIdsResponseSchema = z.object({
  success: z.boolean().describe('Whether the page deletion operation was successful. True if the operation completed, false if a critical error occurred.'),
  message: z.string().describe('Human-readable message describing the result of the deletion operation, including the number of pages successfully deleted.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the deletion response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the deletion request.'),
  data: z.object({
    pages_deleted: z.number().describe('Number of pages that were successfully deleted from the system.'),
    total_requested: z.number().describe('Total number of page IDs that were requested to be deleted.'),
    results: z.array(z.object({
      page_id: z.string().describe('The page ID that was requested to be deleted.'),
      deleted: z.boolean().describe('Whether this specific page was successfully deleted. True if deleted, false if not found or error occurred.'),
      error: z.string().optional().describe('Error message if the page could not be deleted. Only present if deleted is false.')
    })).describe('Array of results for each page ID that was requested to be deleted, showing success/failure status for each page.')
  }).optional().describe('Detailed information about the page deletion operation. Only present if the operation was successful.')
}).describe('Response from the delete_pages_by_ids tool indicating how many specific pages were successfully deleted.');

// Delete All Website Pages Response
export const DeleteAllWebsitePagesResponseSchema = z.object({
  success: z.boolean().describe('Whether the website page deletion operation was successful. True if pages were deleted, false if an error occurred.'),
  message: z.string().describe('Human-readable message describing the result of the deletion operation, including the number of pages deleted.'),
  timestamp: z.string().describe('ISO 8601 timestamp when the deletion response was generated.'),
  execution_time_ms: z.number().optional().describe('Time in milliseconds taken to process the deletion request.'),
  data: z.object({
    pages_deleted: z.number().describe('Number of pages that were successfully deleted from the website. This represents all pages that were previously scraped for this website.'),
    website_id: z.string().describe('The unique identifier of the website whose pages were deleted.')
  }).optional().describe('Information about the website page deletion operation. Only present if the operation was successful.')
}).describe('Response from the delete_all_website_pages tool indicating how many pages were deleted for the entire website.');

// Export response types
export type ScrapeDocumentationResponse = z.infer<typeof ScrapeDocumentationResponseSchema>;
export type GetScrapingStatusResponse = z.infer<typeof GetScrapingStatusResponseSchema>;
export type CancelScrapeJobResponse = z.infer<typeof CancelScrapeJobResponseSchema>;
export type ForceUnlockJobResponse = z.infer<typeof ForceUnlockJobResponseSchema>;
export type ForceUnlockStuckJobsResponse = z.infer<typeof ForceUnlockStuckJobsResponseSchema>;
export type ListDocumentationSourcesResponse = z.infer<typeof ListDocumentationSourcesResponseSchema>;
export type DeletePagesByPatternResponse = z.infer<typeof DeletePagesByPatternResponseSchema>;
export type DeletePagesByIdsResponse = z.infer<typeof DeletePagesByIdsResponseSchema>;
export type DeleteAllWebsitePagesResponse = z.infer<typeof DeleteAllWebsitePagesResponseSchema>;