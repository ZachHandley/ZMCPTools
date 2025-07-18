import { z } from "zod";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";

// Zod v4 schemas for validation
export const sourceTypeSchema = z.enum([
  "api",
  "guide",
  "reference",
  "tutorial",
  "documentation",
  "blog",
  "wiki",
]);

export const updateFrequencySchema = z.enum([
  "never",
  "daily",
  "weekly",
  "monthly",
  "on_demand",
]);

export const scrapeJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timeout",
]);

export const documentationStatusSchema = z.enum([
  "not_started",
  "scraping",
  "completed",
  "failed",
  "stale",
]);

// Schema validation helpers
export const selectorsSchema = z.string().optional();
export const allowPatternsSchema = z.array(z.union([z.string(), z.record(z.string(), z.any())])).default([]);
export const ignorePatternsSchema = z.array(z.union([z.string(), z.record(z.string(), z.any())])).default([]);
export const sourceMetadataSchema = z.record(z.string(), z.any()).optional();
export const jobDataSchema = z.record(z.string(), z.any());
export const resultDataSchema = z.record(z.string(), z.any()).optional();


// Drizzle table definitions
export const documentationSources = sqliteTable("documentation_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  sourceType: text("sourceType", {
    enum: [
      "api",
      "guide",
      "reference",
      "tutorial",
      "documentation",
      "blog",
      "wiki",
    ],
  })
    .notNull()
    .default("guide"),
  maxPages: integer("maxPages").notNull().default(200),
  updateFrequency: text("updateFrequency", {
    enum: ["never", "daily", "weekly", "monthly", "on_demand"],
  })
    .notNull()
    .default("daily"),
  selectors: text("selectors"),  // Plain string selector
  allowPatterns: text("allowPatterns", { mode: "json" })
    .$type<(string | Record<string, any>)[]>()
    .default([]),
  ignorePatterns: text("ignorePatterns", { mode: "json" })
    .$type<(string | Record<string, any>)[]>()
    .default([]),
  includeSubdomains: integer("includeSubdomains", { mode: "boolean" }).default(
    false
  ),
  lastScraped: text("lastScraped"), // ISO datetime string
  status: text("status", {
    enum: ["not_started", "scraping", "completed", "failed", "stale"],
  })
    .notNull()
    .default("not_started"),
  createdAt: text("createdAt").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updatedAt").notNull().default(sql`(current_timestamp)`),
  sourceMetadata: text("sourceMetadata", { mode: "json" }).$type<
    Record<string, any>
  >(),
});

export const scrapeJobs = sqliteTable("scrape_jobs", {
  id: text("id").primaryKey(),
  sourceId: text("sourceId").notNull(),
  jobData: text("jobData", { mode: "json" })
    .$type<Record<string, any>>()
    .notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "cancelled", "timeout"],
  })
    .notNull()
    .default("pending"),
  priority: integer("priority").notNull().default(5), // 1-10 scale, 1 = highest priority
  lockedBy: text("lockedBy"),
  lockedAt: text("lockedAt"), // ISO datetime string
  lockTimeout: integer("lockTimeout").notNull().default(3600), // seconds
  createdAt: text("createdAt").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updatedAt").notNull().default(sql`(current_timestamp)`),
  startedAt: text("startedAt"), // ISO datetime string
  completedAt: text("completedAt"), // ISO datetime string
  errorMessage: text("errorMessage"),
  pagesScraped: integer("pagesScraped"),
  resultData: text("resultData", { mode: "json" }).$type<Record<string, any>>(),
});

// Website table - represents a documentation website/domain
export const websites = sqliteTable("websites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // User-friendly name/title
  domain: text("domain").notNull().unique(), // Just domain.tld (unique)
  metaDescription: text("metaDescription"), // Optional or generated description
  sitemapData: text("sitemapData"), // JSON string containing parsed sitemap data
  createdAt: text("createdAt").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updatedAt").notNull().default(sql`(current_timestamp)`),
});

// Website pages table - individual pages within a website
export const websitePages = sqliteTable("website_pages", {
  id: text("id").primaryKey(),
  websiteId: text("websiteId").notNull(), // Foreign key to websites
  url: text("url").notNull(), // Cleaned URL (no fragments, tracking params)
  contentHash: text("contentHash").notNull(), // Unique per domain for change detection
  htmlContent: text("htmlContent"), // Full HTML including JS-rendered content
  sanitizedHtmlContent: text("sanitizedHtmlContent"), // HTML with scripts/styles removed
  markdownContent: text("markdownContent"), // Converted markdown (scripts/styles removed)
  domJsonContent: text("domJsonContent", { mode: "json" }).$type<Record<string, any>>(), // DOM structure as navigable JSON
  screenshotBase64: text("screenshotBase64"), // Base64-encoded screenshot of the page
  screenshotMetadata: text("screenshotMetadata", { mode: "json" }).$type<{
    width: number;
    height: number;
    deviceScaleFactor: number;
    timestamp: string;
    fullPage: boolean;
    quality?: number;
    format: 'png' | 'jpeg';
  }>(), // Screenshot capture metadata
  selector: text("selector"), // Optional CSS selector used for extraction
  title: text("title"), // Page title
  httpStatus: integer("httpStatus"),
  errorMessage: text("errorMessage"),
  javascriptEnabled: integer("javascriptEnabled", { mode: "boolean" }).default(true), // Whether JS was enabled during scraping
  createdAt: text("createdAt").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updatedAt").notNull().default(sql`(current_timestamp)`),
});


// Drizzle relations
export const documentationSourcesRelations = relations(
  documentationSources,
  ({ many }) => ({
    scrapeJobs: many(scrapeJobs),
  })
);

export const scrapeJobsRelations = relations(scrapeJobs, ({ one }) => ({
  source: one(documentationSources, {
    fields: [scrapeJobs.sourceId],
    references: [documentationSources.id],
  }),
}));

export const websitesRelations = relations(websites, ({ many }) => ({
  pages: many(websitePages),
}));

export const websitePagesRelations = relations(websitePages, ({ one }) => ({
  website: one(websites, {
    fields: [websitePages.websiteId],
    references: [websites.id],
  }),
}));


// Generated Zod schemas using drizzle-zod with validation rules
export const insertDocumentationSourceSchema = createInsertSchema(documentationSources, {
  name: (schema) => schema.min(1).max(200),
  url: (schema) => schema.min(1),
  maxPages: (schema) => schema.int().min(1).max(1000),
});

export const selectDocumentationSourceSchema = createSelectSchema(documentationSources);
export const updateDocumentationSourceSchema = createUpdateSchema(documentationSources);

export const insertScrapeJobSchema = createInsertSchema(scrapeJobs, {
  sourceId: (schema) => schema.min(1),
  lockTimeout: (schema) => schema.min(1),
});

export const selectScrapeJobSchema = createSelectSchema(scrapeJobs);
export const updateScrapeJobSchema = createUpdateSchema(scrapeJobs);

export const insertWebsiteSchema = createInsertSchema(websites, {
  name: (schema) => schema.min(1).max(200),
  domain: (schema) => schema.min(1).max(255),
});

export const selectWebsiteSchema = createSelectSchema(websites);
export const updateWebsiteSchema = createUpdateSchema(websites);

export const insertWebsitePageSchema = createInsertSchema(websitePages, {
  websiteId: (schema) => schema.min(1),
  url: (schema) => schema.min(1),
  contentHash: (schema) => schema.min(1),
});

export const selectWebsitePageSchema = createSelectSchema(websitePages);
export const updateWebsitePageSchema = createUpdateSchema(websitePages);

// TypeScript type exports - explicit types matching camelCase table fields
export type DocumentationSource = {
  id: string;
  name: string;
  url: string;
  sourceType: 'api' | 'guide' | 'reference' | 'tutorial' | 'documentation' | 'blog' | 'wiki';
  maxPages: number;
  updateFrequency: 'never' | 'daily' | 'weekly' | 'monthly' | 'on_demand';
  selectors?: string;
  allowPatterns: (string | Record<string, any>)[];
  ignorePatterns: (string | Record<string, any>)[];
  includeSubdomains: boolean;
  lastScraped?: string;
  status: 'not_started' | 'scraping' | 'completed' | 'failed' | 'stale';
  createdAt: string;
  updatedAt: string;
  sourceMetadata?: Record<string, any>;
};

export type NewDocumentationSource = Omit<DocumentationSource, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type DocumentationSourceUpdate = Partial<Omit<DocumentationSource, 'id' | 'createdAt'>>;

export type ScrapeJob = {
  id: string;
  sourceId: string;
  jobData: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  priority: number;
  lockedBy?: string;
  lockedAt?: string;
  lockTimeout: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  pagesScraped?: number;
  resultData?: Record<string, any>;
};

export type NewScrapeJob = Omit<ScrapeJob, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type ScrapeJobUpdate = Partial<Omit<ScrapeJob, 'id' | 'createdAt'>>;

export type Website = {
  id: string;
  name: string;
  domain: string;
  metaDescription?: string;
  sitemapData?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewWebsite = Omit<Website, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type WebsiteUpdate = Partial<Omit<Website, 'id' | 'createdAt'>>;

export type WebsitePage = {
  id: string;
  websiteId: string;
  url: string;
  contentHash: string;
  htmlContent?: string;
  sanitizedHtmlContent?: string;
  markdownContent?: string;
  domJsonContent?: Record<string, any>;
  screenshotBase64?: string;
  screenshotMetadata?: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    timestamp: string;
    fullPage: boolean;
    quality?: number;
    format: 'png' | 'jpeg';
  };
  selector?: string;
  title?: string;
  httpStatus?: number;
  errorMessage?: string;
  javascriptEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewWebsitePage = Omit<WebsitePage, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type WebsitePageUpdate = Partial<Omit<WebsitePage, 'id' | 'createdAt'>>;

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type UpdateFrequency = z.infer<typeof updateFrequencySchema>;
export type ScrapeJobStatus = z.infer<typeof scrapeJobStatusSchema>;
export type DocumentationStatus = z.infer<typeof documentationStatusSchema>;

// API request schemas (manual - not table schemas)
export const scrapeDocumentationRequestSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200).optional(),
  sourceType: sourceTypeSchema.default("guide"),
  maxPages: z.number().int().min(1).max(1000).default(200),
  updateFrequency: updateFrequencySchema.default("weekly"),
  allowPatterns: allowPatternsSchema,
  ignorePatterns: ignorePatternsSchema,
  includeSubdomains: z.boolean().default(false),
  selectors: selectorsSchema,
  forceRefresh: z.boolean().default(false),
  agentId: z.string().optional(),
});

export const searchDocumentationRequestSchema = z.object({
  query: z.string().min(1),
  sourceId: z.string().optional(),
  sourceType: sourceTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(10),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  includeContent: z.boolean().default(false),
});

export const scrapeJobFilterSchema = z.object({
  sourceId: z.string().optional(),
  status: scrapeJobStatusSchema.optional(),
  lockedBy: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ScrapeDocumentationRequest = z.infer<
  typeof scrapeDocumentationRequestSchema
>;
export type SearchDocumentationRequest = z.infer<
  typeof searchDocumentationRequestSchema
>;
export type ScrapeJobFilter = z.infer<typeof scrapeJobFilterSchema>;
