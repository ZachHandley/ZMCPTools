/**
 * BrowserTools.ts - Consolidated browser automation tools
 * Combines core browser automation (BrowserTools.ts) with MCP protocol integration (BrowserMcpTools.ts)
 * 
 * This class provides:
 * - Core browser automation using Patchright (stealth features, session management)
 * - MCP protocol integration for agent communication
 * - Intelligent session management with workflow-aware auto-close
 * - Consolidated tool interface (5 optimized tools)
 * - Legacy tool support for backward compatibility
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpTool } from '../schemas/tools/index.js';
import { chromium, firefox, webkit } from 'patchright';
import type { Browser, Page, BrowserContext } from 'patchright';
import UserAgent from 'user-agents';
import type { KnowledgeGraphService } from '../services/KnowledgeGraphService.js';
import { MemoryService } from '../services/MemoryService.js';
import { BrowserOperationResponseSchema, createSuccessResponse, createErrorResponse, type BrowserOperationResponse } from '../schemas/toolResponses.js';
import { WebsiteRepository } from '../repositories/WebsiteRepository.js';
import { WebsitePagesRepository } from '../repositories/WebsitePagesRepository.js';
import { DatabaseManager } from '../database/index.js';
import { createHash, randomUUID } from 'crypto';
import { serializeDOMWithPlaywright, sanitizeHTMLContent, convertHTMLToMarkdown, type SerializationOptions, AI_OPTIMIZED_OPTIONS } from '../utils/domToJson.js';
import {
  BrowserCreateSessionSchema,
  BrowserNavigateAndScrapeSchema,
  BrowserInteractWithPageSchema,
  BrowserManageSessionsSchema,
  BrowserLegacyNavigateSchema,
  BrowserLegacyScrapeSchema,
  BrowserScreenshotSchema,
  BrowserExecuteScriptSchema,
  BrowserInteractSchema
} from '../schemas/tools/browser.js';

/**
 * Generate realistic Chrome user agents for better browser fingerprinting
 */
class UserAgentGenerator {
  private static readonly CHROME_VERSIONS = [
    '131.0.0.0', '132.0.0.0', '133.0.0.0', '134.0.0.0', '135.0.0.0', '136.0.0.0', '137.0.0.0'
  ];

  private static readonly WINDOWS_VERSIONS = [
    'Windows NT 10.0; Win64; x64',
    'Windows NT 11.0; Win64; x64'
  ];

  private static readonly ANDROID_VERSIONS = [
    'Android 12', 'Android 13', 'Android 14', 'Android 15'
  ];

  private static readonly MOBILE_DEVICES = [
    'SM-G991B', 'SM-G998B', 'SM-S911B', 'SM-S918B', 'Pixel 6', 'Pixel 7', 'Pixel 8'
  ];

  static generateChromeUserAgent(deviceCategory: 'desktop' | 'mobile' = 'desktop'): string {
    const chromeVersion = this.CHROME_VERSIONS[Math.floor(Math.random() * this.CHROME_VERSIONS.length)];
    
    if (deviceCategory === 'mobile') {
      const androidVersion = this.ANDROID_VERSIONS[Math.floor(Math.random() * this.ANDROID_VERSIONS.length)];
      const device = this.MOBILE_DEVICES[Math.floor(Math.random() * this.MOBILE_DEVICES.length)];
      
      return `Mozilla/5.0 (Linux; ${androidVersion}; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
    } else {
      const windowsVersion = this.WINDOWS_VERSIONS[Math.floor(Math.random() * this.WINDOWS_VERSIONS.length)];
      
      return `Mozilla/5.0 (${windowsVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    }
  }
}

// Core browser session interface
export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  browserType: 'chromium' | 'firefox' | 'webkit';
  createdAt: Date;
  lastUsed: Date;
  repositoryPath: string;
  agentId?: string;
}

// Session management schemas
const SessionConfigSchema = z.object({
  autoClose: z.boolean().optional(),
  sessionTimeout: z.number().optional(),
  workflowType: z.enum(['documentation', 'automation', 'testing']).optional(),
  maxIdleTime: z.number().optional()
});

const SessionMetadataSchema = z.object({
  sessionId: z.string(),
  workflowType: z.enum(['documentation', 'automation', 'testing']),
  autoClose: z.boolean(),
  createdAt: z.date(),
  lastActivity: z.date(),
  taskCompleted: z.boolean().optional()
});

// Export inferred types
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// Core types for browser operations
export interface ScreenshotOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  quality?: number;
  type?: 'png' | 'jpeg';
  returnForAI?: boolean;
}

// Content size limits for MCP token management
interface ContentSizeLimits {
  maxContentLength: number;
  maxDomElements: number;
  truncationMessage: string;
  domGuidanceMessage: string;
}

// DOM analysis results
interface DOMAnalysis {
  elementCount: number;
  maxDepth: number;
  hasNavigation: boolean;
  hasForms: boolean;
  hasInteractiveElements: boolean;
  structure: {
    headings: number;
    links: number;
    buttons: number;
    inputs: number;
    images: number;
  };
}

// AI-compatible image format
export interface AIImageFormat {
  type: 'image';
  data: string; // base64 encoded
  mimeType: 'image/png' | 'image/jpeg';
}

export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface ScrapeOptions {
  selector?: string;
  waitForSelector?: string;
  extractText?: boolean;
  extractHtml?: boolean;
  extractLinks?: boolean;
  extractImages?: boolean;
  followPagination?: boolean;
  maxPages?: number;
}

/**
 * BrowserTools - Consolidated browser automation with MCP integration
 * 
 * This class combines:
 * 1. Core browser automation (BrowserTools functionality)
 * 2. MCP protocol integration (BrowserMcpTools functionality)
 * 3. Intelligent session management
 * 4. Consolidated tool interface
 */
export class BrowserTools {
  // Core browser automation state
  private sessions = new Map<string, BrowserSession>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // MCP integration state
  private sessionMetadata = new Map<string, SessionMetadata>();
  private sessionCleanupInterval: NodeJS.Timeout | null = null;
  private memoryService: MemoryService;

  // Website indexing repositories
  private websiteRepository: WebsiteRepository;
  private websitePagesRepository: WebsitePagesRepository;

  constructor(
    private knowledgeGraphService: KnowledgeGraphService,
    private repositoryPath: string,
    private db: DatabaseManager
  ) {
    this.memoryService = new MemoryService(db);
    this.websiteRepository = new WebsiteRepository(db);
    this.websitePagesRepository = new WebsitePagesRepository(db);
    this.startCleanupServices();
  }

  /**
   * Get optimized browser-related MCP tools (Phase 4)
   * Consolidated from 8 tools to 5 essential tools with smart session management
   */
  getTools(): McpTool[] {
    return [
      {
        name: 'create_browser_session',
        description: 'Create a new browser session with intelligent auto-close and session management',
        inputSchema: zodToJsonSchema(BrowserCreateSessionSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.createBrowserSessionEnhanced(args)
      },
      {
        name: 'navigate_and_scrape',
        description: 'Navigate to a URL and optionally scrape content in one operation. Auto-creates session if needed.',
        inputSchema: zodToJsonSchema(BrowserNavigateAndScrapeSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.navigateAndScrape(args)
      },
      {
        name: 'interact_with_page',
        description: 'Perform multiple interactions with a page: click, type, hover, select, screenshot, wait, scroll',
        inputSchema: zodToJsonSchema(BrowserInteractWithPageSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.interactWithPage(args)
      },
      {
        name: 'manage_browser_sessions',
        description: 'Manage browser sessions: list, close, cleanup idle sessions, get status',
        inputSchema: zodToJsonSchema(BrowserManageSessionsSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.manageBrowserSessions(args)
      },
      // Legacy tools for backward compatibility
      {
        name: 'navigate_to_url',
        description: '[LEGACY] Navigate to a URL in an existing browser session. Use navigate_and_scrape instead.',
        inputSchema: zodToJsonSchema(BrowserLegacyNavigateSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.navigateToUrl(args)
      },
      {
        name: 'scrape_content',
        description: '[LEGACY] Scrape content from the current page. Use navigate_and_scrape instead.',
        inputSchema: zodToJsonSchema(BrowserLegacyScrapeSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.scrapeContent(args)
      },
      {
        name: 'take_screenshot',
        description: '[LEGACY] Take a screenshot of the current page. Use interact_with_page instead.',
        inputSchema: zodToJsonSchema(BrowserScreenshotSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.takeScreenshot(args)
      },
      {
        name: 'execute_browser_script',
        description: '[LEGACY] Execute JavaScript in the browser context. Use interact_with_page instead.',
        inputSchema: zodToJsonSchema(BrowserExecuteScriptSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.executeScript(args)
      },
      {
        name: 'interact_with_element',
        description: '[LEGACY] Interact with a page element. Use interact_with_page instead.',
        inputSchema: zodToJsonSchema(BrowserInteractSchema),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.interactWithElement(args)
      },
      {
        name: 'close_browser_session',
        description: '[LEGACY] Close a browser session. Use manage_browser_sessions instead.',
        inputSchema: zodToJsonSchema(z.object({ session_id: z.string() })),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.closeBrowserSession(args)
      },
      {
        name: 'list_browser_sessions',
        description: '[LEGACY] List all browser sessions. Use manage_browser_sessions instead.',
        inputSchema: zodToJsonSchema(z.object({})),
        outputSchema: zodToJsonSchema(BrowserOperationResponseSchema),
        handler: (args: any) => this.listBrowserSessions()
      }
    ];
  }


  // ===================================
  // Core Browser Automation Methods
  // ===================================

  /**
   * Create a new browser session with specified browser type
   */
  private async createBrowserSessionCore(
    browserType: 'chromium' | 'firefox' | 'webkit' = 'chromium',
    options: {
      headless?: boolean;
      viewport?: { width: number; height: number };
      userAgent?: string;
      agentId?: string;
    } = {}
  ): Promise<{ success: boolean; sessionId: string; error?: string }> {
    try {
      const sessionId = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      // Generate realistic user agent if not provided
      let userAgent = options.userAgent;
      if (!userAgent) {
        const deviceCategory = Math.random() > 0.7 ? 'mobile' : 'desktop';
        
        try {
          // Try to use user-agents package first
          let attempts = 0;
          let generatedAgent: any;
          do {
            generatedAgent = new UserAgent({
              deviceCategory,
              platform: deviceCategory === 'mobile' ? 'mobile' : 'desktop'
            });
            attempts++;
          } while (attempts < 10 && !generatedAgent.toString().includes('Chrome'));
          
          userAgent = generatedAgent.toString();
          process.stderr.write(`Generated user agent via user-agents package for session ${sessionId}: ${userAgent}\n`);
        } catch (error) {
          // Fallback to our custom generator if user-agents package fails
          userAgent = UserAgentGenerator.generateChromeUserAgent(deviceCategory);
          process.stderr.write(`Generated user agent via fallback for session ${sessionId}: ${userAgent}\n`);
        }
      }
      
      // Launch browser
      let browser: Browser;
      switch (browserType) {
        case 'firefox':
          browser = await firefox.launch({
            headless: options.headless ?? true,
            args: ['--disable-blink-features=AutomationControlled']
          });
          break;
        case 'webkit':
          browser = await webkit.launch({
            headless: options.headless ?? true
          });
          break;
        default:
          browser = await chromium.launch({
            headless: options.headless ?? true,
            args: [
              '--disable-blink-features=AutomationControlled',
              '--disable-features=VizDisplayCompositor',
              '--no-sandbox',
              '--disable-dev-shm-usage'
            ]
          });
      }

      // Create context with realistic user agent
      const context = await browser.newContext({
        viewport: options.viewport || { width: 1920, height: 1080 },
        userAgent,
        // Stealth settings to avoid detection
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      // Create page
      const page = await context.newPage();
      
      // Add stealth JavaScript
      await page.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty((globalThis as any).navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Mock plugins and languages
        Object.defineProperty((globalThis as any).navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        
        Object.defineProperty((globalThis as any).navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
      });

      const session: BrowserSession = {
        id: sessionId,
        browser,
        context,
        page,
        browserType,
        createdAt: new Date(),
        lastUsed: new Date(),
        repositoryPath: this.repositoryPath,
        agentId: options.agentId
      };

      this.sessions.set(sessionId, session);

      // Store in knowledge graph for other agents
      try {
        await this.knowledgeGraphService.createEntity({
          id: `browser-session-${Date.now()}`,
          repositoryPath: this.repositoryPath,
          entityType: 'objective',
          name: `Browser session created: ${sessionId}`,
          description: `Created ${browserType} browser session with ID ${sessionId}`,
          properties: { sessionId, browserType },
          discoveredBy: options.agentId || 'system',
          discoveredDuring: 'browser-session-creation',
          importanceScore: 0.3,
          confidenceScore: 1.0,
          relevanceScore: 0.5
        });
      } catch (error) {
        console.warn('Failed to store browser session in knowledge graph:', error);
      }

      return { success: true, sessionId };
    } catch (error) {
      return { 
        success: false, 
        sessionId: '', 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Navigate to a URL in the specified session
   */
  private async navigateToUrlCore(
    sessionId: string,
    url: string,
    options: NavigationOptions = {}
  ): Promise<{ success: boolean; title?: string; url?: string; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      session.lastUsed = new Date();
      this.updateSessionActivity(sessionId);

      const response = await session.page.goto(url, {
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout: options.timeout || 30000
      });

      if (!response || !response.ok()) {
        return { success: false, error: `Failed to load ${url}: ${response?.status()}` };
      }

      const title = await session.page.title();
      const finalUrl = session.page.url();

      return { success: true, title, url: finalUrl };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Navigation failed'
      };
    }
  }

  /**
   * Take a screenshot of the current page
   */
  private async takeScreenshotCore(
    sessionId: string,
    filepath?: string,
    options: ScreenshotOptions = {}
  ): Promise<{ 
    success: boolean; 
    filepath?: string; 
    aiImage?: AIImageFormat;
    error?: string 
  }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      session.lastUsed = new Date();
      this.updateSessionActivity(sessionId);

      const screenshotType = options.type || 'png';
      const mimeType = screenshotType === 'jpeg' ? 'image/jpeg' : 'image/png';

      if (options.returnForAI) {
        // Return AI-compatible image format
        const buffer = await session.page.screenshot({
          fullPage: options.fullPage ?? false,
          clip: options.clip,
          quality: options.quality,
          type: screenshotType
        });
        
        const base64Data = buffer.toString('base64');
        const aiImage: AIImageFormat = {
          type: 'image',
          data: base64Data,
          mimeType: mimeType as 'image/png' | 'image/jpeg'
        };
        
        return { success: true, aiImage };
      } else {
        // Traditional file-based screenshot
        if (!filepath) {
          return { success: false, error: 'Filepath required when returnForAI is false' };
        }
        
        await session.page.screenshot({
          path: filepath,
          fullPage: options.fullPage ?? false,
          clip: options.clip,
          quality: options.quality,
          type: screenshotType
        });

        return { success: true, filepath };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Screenshot failed'
      };
    }
  }

  /**
   * Scrape content from the current page
   */
  private async scrapeContentCore(
    sessionId: string,
    options: ScrapeOptions & { truncateForMcp?: boolean; pageId?: string } = {}
  ): Promise<{ 
    success: boolean; 
    content?: {
      text?: string;
      html?: string;
      links?: Array<{ text: string; href: string }>;
      images?: Array<{ alt: string; src: string }>;
    };
    error?: string;
  }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      session.lastUsed = new Date();
      this.updateSessionActivity(sessionId);

      // Wait for selector if specified
      if (options.waitForSelector) {
        await session.page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      const content: any = {};

      // Extract text content
      if (options.extractText !== false) {
        if (options.selector) {
          const element = await session.page.$(options.selector);
          content.text = element ? await element.textContent() : null;
        } else {
          content.text = await session.page.textContent('body');
        }
      }

      // Extract HTML content
      if (options.extractHtml) {
        if (options.selector) {
          const element = await session.page.$(options.selector);
          content.html = element ? await element.innerHTML() : null;
        } else {
          content.html = await session.page.content();
        }
      }

      // Extract links
      if (options.extractLinks) {
        content.links = await session.page.evaluate(() => {
          const links = Array.from((globalThis as any).document.querySelectorAll('a[href]'));
          return links.map((link: any) => ({
            text: link.textContent?.trim() || '',
            href: link.href
          }));
        });
      }

      // Extract images
      if (options.extractImages) {
        content.images = await session.page.evaluate(() => {
          const images = Array.from((globalThis as any).document.querySelectorAll('img'));
          return images.map((img: any) => ({
            alt: img.alt || '',
            src: img.src
          }));
        });
      }

      // Apply content size limits before returning (only for MCP responses)
      if (options.truncateForMcp !== false) {
        const pageId = options.pageId; // Pass page ID for guidance message
        if (content.text) {
          content.text = this.truncateContent(content.text, 'text', pageId);
        }
        if (content.html) {
          content.html = this.truncateContent(content.html, 'HTML', pageId);
        }
      }

      return { success: true, content };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Scraping failed'
      };
    }
  }

  /**
   * Execute JavaScript in the browser context
   */
  private async executeScriptCore(
    sessionId: string,
    script: string,
    args: any[] = []
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      session.lastUsed = new Date();
      this.updateSessionActivity(sessionId);

      const result = await session.page.evaluate(({ script, args }) => {
        const func = new Function('...args', script);
        return func(...args);
      }, { script, args });

      return { success: true, result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Script execution failed'
      };
    }
  }

  /**
   * Interact with page elements (click, type, etc.)
   */
  private async interactWithElementCore(
    sessionId: string,
    action: 'click' | 'type' | 'hover' | 'select',
    selector: string,
    value?: string | string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      session.lastUsed = new Date();
      this.updateSessionActivity(sessionId);

      // Wait for element to be available
      await session.page.waitForSelector(selector, { timeout: 10000 });

      switch (action) {
        case 'click':
          await session.page.click(selector);
          break;
        case 'type':
          if (typeof value === 'string') {
            await session.page.fill(selector, value);
          }
          break;
        case 'hover':
          await session.page.hover(selector);
          break;
        case 'select':
          if (Array.isArray(value)) {
            await session.page.selectOption(selector, value);
          }
          break;
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Element interaction failed'
      };
    }
  }

  /**
   * Close a browser session
   */
  private async closeBrowserSessionCore(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      await session.context.close();
      await session.browser.close();
      this.sessions.delete(sessionId);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to close session'
      };
    }
  }

  /**
   * List all active browser sessions
   */
  private async listSessionsCore(): Promise<Array<{
    id: string;
    browserType: string;
    createdAt: Date;
    lastUsed: Date;
    agentId?: string;
  }>> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      browserType: session.browserType,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      agentId: session.agentId
    }));
  }

  // ===================================
  // Content Size Management Helpers
  // ===================================

  /**
   * Get content size limits for different content types
   */
  private getContentSizeLimits(): ContentSizeLimits {
    return {
      maxContentLength: 6000,
      maxDomElements: 500, // Threshold for providing DOM overview instead of full content
      truncationMessage: '\n\n[Content truncated due to size limits. Full content stored in database. Use DOM navigation tools for detailed exploration:]\n- analyze_dom_structure: Get page structure overview\n- navigate_dom_path: Navigate to specific elements\n- search_dom_elements: Find elements by criteria',
      domGuidanceMessage: 'DOM structure indexed in database. Use DOM navigation tools to explore specific paths: analyze_dom_structure, navigate_dom_path, search_dom_elements'
    };
  }

  /**
   * Truncate content to size limits with helpful message including page_id
   */
  private truncateContent(content: string, contentType: string, pageId?: string): string {
    if (!content || typeof content !== 'string') {
      return content;
    }
    
    const limits = this.getContentSizeLimits();
    
    if (content.length <= limits.maxContentLength) {
      return content;
    }
    
    const truncated = content.substring(0, limits.maxContentLength);
    const pageInfo = pageId ? ` Use page_id: ${pageId} with DOM navigation tools.` : '';
    const message = `${limits.truncationMessage}${pageInfo}\n\nTruncated ${contentType} content (${content.length} chars -> ${limits.maxContentLength} chars)`;
    
    return truncated + message;
  }

  /**
   * Count total elements in DOM JSON structure
   */
  private countDOMElements(domJson: any): number {
    if (!domJson || typeof domJson !== 'object') {
      return 0;
    }
    
    let count = 1; // Count current element
    
    // Count children recursively
    if (domJson.children && Array.isArray(domJson.children)) {
      for (const child of domJson.children) {
        count += this.countDOMElements(child);
      }
    }
    
    return count;
  }

  /**
   * Calculate maximum depth of DOM tree
   */
  private calculateDOMDepth(domJson: any, currentDepth: number = 0): number {
    if (!domJson || typeof domJson !== 'object') {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    
    if (domJson.children && Array.isArray(domJson.children)) {
      for (const child of domJson.children) {
        const childDepth = this.calculateDOMDepth(child, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }
    
    return maxDepth;
  }

  /**
   * Detect navigation elements in DOM JSON
   */
  private hasNavigation(domJson: any): boolean {
    if (!domJson || typeof domJson !== 'object') {
      return false;
    }
    
    // Check current element
    if (domJson.tagName) {
      const tag = domJson.tagName.toLowerCase();
      if (tag === 'nav') return true;
      
      // Check for navigation-related classes/IDs
      const navKeywords = ['nav', 'menu', 'header', 'sidebar', 'breadcrumb'];
      const className = domJson.attributes?.class || '';
      const id = domJson.attributes?.id || '';
      
      if (navKeywords.some(keyword => 
        className.toLowerCase().includes(keyword) || 
        id.toLowerCase().includes(keyword)
      )) {
        return true;
      }
    }
    
    // Check children recursively
    if (domJson.children && Array.isArray(domJson.children)) {
      return domJson.children.some((child: any) => this.hasNavigation(child));
    }
    
    return false;
  }

  /**
   * Detect form elements in DOM JSON
   */
  private hasForms(domJson: any): boolean {
    if (!domJson || typeof domJson !== 'object') {
      return false;
    }
    
    // Check current element
    if (domJson.tagName) {
      const tag = domJson.tagName.toLowerCase();
      if (['form', 'input', 'textarea', 'select', 'button'].includes(tag)) {
        return true;
      }
    }
    
    // Check children recursively
    if (domJson.children && Array.isArray(domJson.children)) {
      return domJson.children.some((child: any) => this.hasForms(child));
    }
    
    return false;
  }

  /**
   * Detect interactive elements in DOM JSON
   */
  private hasInteractiveElements(domJson: any): boolean {
    if (!domJson || typeof domJson !== 'object') {
      return false;
    }
    
    // Check current element
    if (domJson.tagName) {
      const tag = domJson.tagName.toLowerCase();
      const interactiveTags = ['button', 'input', 'select', 'textarea', 'a', 'details', 'summary'];
      
      if (interactiveTags.includes(tag)) {
        return true;
      }
      
      // Check for click handlers or interactive attributes
      const attributes = domJson.attributes || {};
      if (attributes.onclick || attributes.href || attributes.tabindex) {
        return true;
      }
    }
    
    // Check children recursively
    if (domJson.children && Array.isArray(domJson.children)) {
      return domJson.children.some((child: any) => this.hasInteractiveElements(child));
    }
    
    return false;
  }

  /**
   * Analyze DOM JSON structure and provide overview
   */
  private analyzeDOMStructure(domJson: any): DOMAnalysis {
    const analysis: DOMAnalysis = {
      elementCount: this.countDOMElements(domJson),
      maxDepth: this.calculateDOMDepth(domJson),
      hasNavigation: this.hasNavigation(domJson),
      hasForms: this.hasForms(domJson),
      hasInteractiveElements: this.hasInteractiveElements(domJson),
      structure: {
        headings: 0,
        links: 0,
        buttons: 0,
        inputs: 0,
        images: 0
      }
    };
    
    // Count specific element types
    this.countElementTypes(domJson, analysis.structure);
    
    return analysis;
  }

  /**
   * Recursively count specific element types
   */
  private countElementTypes(domJson: any, counts: DOMAnalysis['structure']): void {
    if (!domJson || typeof domJson !== 'object') {
      return;
    }
    
    if (domJson.tagName) {
      const tag = domJson.tagName.toLowerCase();
      
      switch (tag) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          counts.headings++;
          break;
        case 'a':
          counts.links++;
          break;
        case 'button':
          counts.buttons++;
          break;
        case 'input':
        case 'textarea':
        case 'select':
          counts.inputs++;
          break;
        case 'img':
          counts.images++;
          break;
      }
    }
    
    // Process children
    if (domJson.children && Array.isArray(domJson.children)) {
      for (const child of domJson.children) {
        this.countElementTypes(child, counts);
      }
    }
  }

  /**
   * Get simple DOM overview stats
   */
  private getDOMOverview(domJson: any): any {
    const analysis = this.analyzeDOMStructure(domJson);
    const limits = this.getContentSizeLimits();
    
    return {
      elementCount: analysis.elementCount,
      maxDepth: analysis.maxDepth,
      hasNavigation: analysis.hasNavigation,
      hasForms: analysis.hasForms,
      hasInteractiveElements: analysis.hasInteractiveElements,
      structure: analysis.structure,
      guidance: limits.domGuidanceMessage
    };
  }

  /**
   * Create DOM overview for large structures with page_id guidance
   */
  private createDOMOverview(domJson: any, pageId?: string): any {
    const analysis = this.analyzeDOMStructure(domJson);
    const limits = this.getContentSizeLimits();
    const pageInfo = pageId ? ` Use page_id: ${pageId} with DOM navigation tools.` : '';
    
    return {
      overview: {
        message: `DOM structure is large (${analysis.elementCount} elements). Providing overview instead of full content. Full DOM stored in database.${pageInfo}`,
        guidance: limits.domGuidanceMessage,
        toolRecommendations: [
          "Use 'analyze_dom_structure' for detailed structure analysis",
          "Use 'navigate_dom_path' to explore specific element paths",
          "Use 'search_dom_elements' to find elements by criteria"
        ],
        analysis: {
          elementCount: analysis.elementCount,
          maxDepth: analysis.maxDepth,
          hasNavigation: analysis.hasNavigation,
          hasForms: analysis.hasForms,
          hasInteractiveElements: analysis.hasInteractiveElements,
          structure: analysis.structure
        }
      },
      rootElement: {
        tagName: domJson.tagName || 'unknown',
        attributes: domJson.attributes || {},
        childrenCount: domJson.children ? domJson.children.length : 0
      },
      topLevelChildren: domJson.children ? domJson.children.slice(0, 5).map((child: any) => ({
        tagName: child.tagName || 'unknown',
        attributes: child.attributes || {},
        childrenCount: child.children ? child.children.length : 0,
        textContent: child.textContent ? child.textContent.substring(0, 100) + (child.textContent.length > 100 ? '...' : '') : undefined
      })) : []
    };
  }

  /**
   * Index a website page in the database with all content types
   */
  private async indexWebsitePage(
    sessionId: string,
    url: string,
    options: {
      extractHtml?: boolean;
      extractSanitizedHtml?: boolean;
      extractMarkdown?: boolean;
      extractDomJson?: boolean;
      captureScreenshot?: boolean;
      screenshotFullPage?: boolean;
      selector?: string;
      httpStatus?: number;
      title?: string;
      errorMessage?: string;
    }
  ): Promise<{
    success: boolean;
    websiteId?: string;
    pageId?: string;
    error?: string;
  }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }

      // Extract domain from URL
      const domain = this.websiteRepository.extractDomainFromUrl(url);
      
      // Find or create website entry
      const website = await this.websiteRepository.findOrCreateByDomain(domain, {
        name: domain,
        metaDescription: `Website at ${domain}`
      });

      // Normalize URL for consistent storage
      const normalizedUrl = this.websitePagesRepository.normalizeUrl(url);

      // Initialize content variables
      let htmlContent: string | undefined;
      let sanitizedHtmlContent: string | undefined;
      let markdownContent: string | undefined;
      let domJsonContent: Record<string, any> | undefined;
      let screenshotBase64: string | undefined;
      let screenshotMetadata: any | undefined;

      // Extract HTML content if requested
      if (options.extractHtml) {
        const htmlResult = await this.scrapeContentCore(sessionId, {
          extractHtml: true,
          selector: options.selector,
          truncateForMcp: false // Store full content in database
        });
        
        if (htmlResult.success && htmlResult.content?.html) {
          htmlContent = htmlResult.content.html;
        }
      }

      // Extract sanitized HTML if requested
      if (options.extractSanitizedHtml) {
        if (!htmlContent) {
          // Get HTML first if we don't have it
          const htmlResult = await this.scrapeContentCore(sessionId, {
            extractHtml: true,
            selector: options.selector,
            truncateForMcp: false // Store full content in database
          });
          
          if (htmlResult.success && htmlResult.content?.html) {
            htmlContent = htmlResult.content.html;
          }
        }
        
        if (htmlContent) {
          sanitizedHtmlContent = sanitizeHTMLContent(htmlContent, {
            removeScripts: true,
            removeStyles: true,
            removeComments: true,
            removeEventHandlers: true
          });
        }
      }

      // Extract markdown if requested
      if (options.extractMarkdown) {
        if (!sanitizedHtmlContent) {
          if (!htmlContent) {
            // Get HTML first if we don't have it
            const htmlResult = await this.scrapeContentCore(sessionId, {
              extractHtml: true,
              selector: options.selector,
              truncateForMcp: false // Store full content in database
            });
            
            if (htmlResult.success && htmlResult.content?.html) {
              htmlContent = htmlResult.content.html;
            }
          }
          
          if (htmlContent) {
            sanitizedHtmlContent = sanitizeHTMLContent(htmlContent, {
              removeScripts: true,
              removeStyles: true,
              removeComments: true,
              removeEventHandlers: true
            });
          }
        }
        
        if (sanitizedHtmlContent) {
          markdownContent = convertHTMLToMarkdown(sanitizedHtmlContent);
        }
      }

      // Extract DOM JSON if requested
      if (options.extractDomJson) {
        try {
          const domOptions: SerializationOptions = {
            ...AI_OPTIMIZED_OPTIONS,
            scope: options.selector || 'html',
            maxDepth: 25
          };
          
          domJsonContent = await serializeDOMWithPlaywright(
            session.page,
            options.selector || 'html',
            domOptions
          );
        } catch (error) {
          console.warn('Failed to extract DOM JSON:', error);
          // Don't fail the entire indexing operation for DOM JSON extraction failure
        }
      }

      // Capture screenshot if requested
      if (options.captureScreenshot) {
        const screenshotResult = await this.takeScreenshotCore(
          sessionId,
          undefined, // no filepath
          {
            fullPage: options.screenshotFullPage ?? true,
            type: 'png',
            returnForAI: true
          }
        );
        
        if (screenshotResult.success && screenshotResult.aiImage) {
          screenshotBase64 = screenshotResult.aiImage.data;
          screenshotMetadata = {
            width: 1920, // These would ideally come from the actual screenshot
            height: 1080,
            deviceScaleFactor: 1.0,
            timestamp: new Date().toISOString(),
            fullPage: options.screenshotFullPage ?? true,
            format: 'png' as const
          };
        }
      }

      // Generate content hash for change detection
      const contentForHash = [
        htmlContent || '',
        sanitizedHtmlContent || '',
        markdownContent || '',
        JSON.stringify(domJsonContent) || '',
        screenshotBase64 || ''
      ].join('|');
      
      const contentHash = this.websitePagesRepository.generateContentHash(contentForHash);

      // Create or update page entry
      const pageData = {
        id: randomUUID(),
        websiteId: website.id,
        url: normalizedUrl,
        contentHash,
        htmlContent,
        sanitizedHtmlContent,
        markdownContent,
        domJsonContent,
        screenshotBase64,
        screenshotMetadata,
        selector: options.selector,
        title: options.title,
        httpStatus: options.httpStatus,
        errorMessage: options.errorMessage,
        javascriptEnabled: true
      };

      const { page, isNew } = await this.websitePagesRepository.createOrUpdate(pageData);

      return {
        success: true,
        websiteId: website.id,
        pageId: page.id
      };

    } catch (error) {
      console.error('Failed to index website page:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown indexing error'
      };
    }
  }

  // ===================================
  // MCP Enhanced Methods
  // ===================================

  private async createBrowserSessionEnhanced(args: z.infer<typeof BrowserCreateSessionSchema>) {
    const params = BrowserCreateSessionSchema.parse(args);
    
    const result = await this.createBrowserSessionCore(
      params.browser_type,
      {
        headless: params.headless,
        viewport: { width: params.viewport_width, height: params.viewport_height },
        userAgent: params.user_agent,
        agentId: params.agent_id
      }
    );

    if (result.success) {
      // Store session metadata for intelligent management
      this.sessionMetadata.set(result.sessionId, {
        sessionId: result.sessionId,
        workflowType: params.workflow_type,
        autoClose: params.auto_close,
        createdAt: new Date(),
        lastActivity: new Date(),
        taskCompleted: false
      });

      // Store in memory for other agents
      if (params.agent_id) {
        await this.memoryService.storeInsight(
          this.repositoryPath,
          params.agent_id,
          'Browser session created',
          `Created ${params.browser_type} session ${result.sessionId} for ${params.workflow_type} workflow (auto-close: ${params.auto_close})`,
          ['browser', 'session', 'created', params.workflow_type, params.browser_type]
        );
      }

      // Set up auto-close timer for non-documentation workflows
      if (params.auto_close && params.workflow_type !== 'documentation') {
        setTimeout(() => {
          this.autoCloseSession(result.sessionId);
        }, params.session_timeout);
      }
    }

    const enhancedResult = {
      ...result,
      sessionConfig: {
        workflowType: params.workflow_type,
        autoClose: params.auto_close,
        sessionTimeout: params.session_timeout,
        maxIdleTime: params.max_idle_time
      }
    };

    return this.transformResultData(enhancedResult, 'create_browser_session');
  }

  private async navigateAndScrape(args: z.infer<typeof BrowserNavigateAndScrapeSchema>) {
    const params = BrowserNavigateAndScrapeSchema.parse(args);
    
    let sessionId = params.session_id;
    let sessionCreated = false;

    // Auto-create session if needed
    if (!sessionId && params.auto_create_session) {
      const createResult = await this.createBrowserSessionEnhanced({
        browser_type: params.browser_type,
        workflow_type: 'automation',
        auto_close: true
      });
      
      if (!createResult.success) {
        return createResult;
      }
      
      // Extract session_id from transformed result
      sessionId = createResult.data?.session_id || createResult.sessionId;
      sessionCreated = true;
    }

    if (!sessionId) {
      return { success: false, error: 'No session ID provided and auto-create disabled' };
    }

    // Update session activity
    this.updateSessionActivity(sessionId);

    // Navigate to URL
    const navResult = await this.navigateToUrlCore(
      sessionId,
      params.url,
      {
        waitUntil: params.wait_until,
        timeout: params.timeout
      }
    );

    if (!navResult.success) {
      // Clean up auto-created session on failure
      if (sessionCreated) {
        await this.closeBrowserSessionCore(sessionId);
        this.sessionMetadata.delete(sessionId);
      }
      return navResult;
    }

    // Auto-index website first if enabled (store full content)
    let indexingResult: { success: boolean; websiteId?: string; pageId?: string; error?: string } | null = null;
    if (params.auto_index_website) {
      try {
        indexingResult = await this.indexWebsitePage(
          sessionId,
          navResult.url || params.url,
          {
            extractHtml: params.extract_html || params.extract_sanitized_html || params.extract_markdown,
            extractSanitizedHtml: params.extract_sanitized_html,
            extractMarkdown: params.extract_markdown,
            extractDomJson: params.extract_dom_json,
            captureScreenshot: params.capture_screenshot,
            screenshotFullPage: params.screenshot_full_page,
            selector: params.selector,
            httpStatus: 200, // Assume success since navigation succeeded
            title: navResult.title,
            errorMessage: undefined
          }
        );
      } catch (error) {
        console.warn('Failed to index website page:', error);
        // Don't fail the navigation for indexing failure
        indexingResult = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown indexing error'
        };
      }
    }

    // Scrape content if any extraction options are enabled (for MCP response with truncation)
    let scrapeResult = null;
    if (params.extract_text || params.extract_html || params.extract_links || params.extract_images) {
      scrapeResult = await this.scrapeContentCore(
        sessionId,
        {
          selector: params.selector,
          waitForSelector: params.wait_for_selector,
          extractText: params.extract_text,
          extractHtml: params.extract_html,
          extractLinks: params.extract_links,
          extractImages: params.extract_images,
          truncateForMcp: true, // Truncate for MCP response
          pageId: indexingResult?.pageId
        }
      );
    }

    // Prepare enhanced content extraction for MCP response
    let enhancedContent: any = scrapeResult?.content || {};

    // Extract additional content types if requested
    if (params.extract_sanitized_html || params.extract_markdown || params.extract_dom_json || params.capture_screenshot) {
      try {
        // Get HTML content if we need it for sanitization/markdown
        if ((params.extract_sanitized_html || params.extract_markdown) && !enhancedContent.html) {
          const htmlResult = await this.scrapeContentCore(sessionId, {
            extractHtml: true,
            selector: params.selector,
            truncateForMcp: true, // This is for MCP response, so truncate
            pageId: indexingResult?.pageId
          });
          if (htmlResult.success && htmlResult.content?.html) {
            enhancedContent.html = htmlResult.content.html; // Already truncated
          }
        }

        // Extract sanitized HTML
        if (params.extract_sanitized_html && enhancedContent.html) {
          // Use full HTML content for sanitization
          const fullHtmlResult = await this.scrapeContentCore(sessionId, {
            extractHtml: true,
            selector: params.selector,
            truncateForMcp: false, // Get full content for processing
            pageId: indexingResult?.pageId
          });
          
          const htmlToSanitize = fullHtmlResult.success && fullHtmlResult.content?.html 
            ? fullHtmlResult.content.html 
            : enhancedContent.html;
            
          const sanitizedHtml = sanitizeHTMLContent(htmlToSanitize, {
            removeScripts: true,
            removeStyles: true,
            removeComments: true,
            removeEventHandlers: true
          });
          // Truncate for MCP response only
          enhancedContent.sanitized_html = this.truncateContent(sanitizedHtml, 'sanitized HTML', indexingResult?.pageId);
        }

        // Extract markdown
        if (params.extract_markdown) {
          // Get full HTML for markdown conversion
          const fullHtmlResult = await this.scrapeContentCore(sessionId, {
            extractHtml: true,
            selector: params.selector,
            truncateForMcp: false, // Get full content for processing
            pageId: indexingResult?.pageId
          });
          
          const htmlForMarkdown = fullHtmlResult.success && fullHtmlResult.content?.html 
            ? fullHtmlResult.content.html 
            : enhancedContent.html;
            
          if (htmlForMarkdown) {
            const sanitized = sanitizeHTMLContent(htmlForMarkdown, {
              removeScripts: true,
              removeStyles: true,
              removeComments: true,
              removeEventHandlers: true
            });
            const markdown = convertHTMLToMarkdown(sanitized);
            // Truncate for MCP response only
            enhancedContent.markdown = this.truncateContent(markdown, 'Markdown', indexingResult?.pageId);
          }
        }

        // Extract DOM JSON
        if (params.extract_dom_json) {
          try {
            const session = this.sessions.get(sessionId);
            if (session) {
              const domOptions: SerializationOptions = {
                ...AI_OPTIMIZED_OPTIONS,
                scope: params.selector || 'html',
                maxDepth: 25 // No limits on DOM processing - store everything
              };
              
              const rawDomJson = await serializeDOMWithPlaywright(
                session.page,
                params.selector || 'html',
                domOptions
              );
              
              // Always provide overview for MCP response - full DOM stored in database during indexing
              enhancedContent.dom_json = this.createDOMOverview(rawDomJson, indexingResult?.pageId);
              
              // Note: Full DOM is still stored in database during indexing regardless of response size
            }
          } catch (error) {
            console.warn('Failed to extract DOM JSON:', error);
            // Don't fail the operation for DOM JSON extraction failure
          }
        }

        // Capture screenshot - store in database, provide reference in MCP response
        if (params.capture_screenshot) {
          const screenshotResult = await this.takeScreenshotCore(
            sessionId,
            undefined, // no filepath
            {
              fullPage: params.screenshot_full_page ?? true,
              type: 'png',
              returnForAI: true
            }
          );
          
          if (screenshotResult.success && screenshotResult.aiImage) {
            // Store metadata but not full base64 in MCP response
            enhancedContent.screenshot_captured = true;
            enhancedContent.screenshot_metadata = {
              size_bytes: Math.round(screenshotResult.aiImage.data.length * 0.75), // Estimate from base64
              width: 1920, // These would ideally come from the actual screenshot
              height: 1080,
              device_scale_factor: 1.0,
              timestamp: new Date().toISOString(),
              full_page: params.screenshot_full_page ?? true,
              format: 'png' as const,
              page_id: indexingResult?.pageId,
              usage_note: indexingResult?.pageId 
                ? `Screenshot stored in database. Use get_page_screenshot with page_id: ${indexingResult?.pageId}` 
                : 'Screenshot stored in database. Use DOM navigation tools to access.'
            };
          }
        }
      } catch (error) {
        console.warn('Failed to extract enhanced content:', error);
        // Don't fail the operation for enhanced content extraction failure
      }
    }

    // Indexing was already performed above before content extraction

    // Auto-close session if it was created for this operation
    if (sessionCreated) {
      setTimeout(() => {
        this.autoCloseSession(sessionId!);
      }, 5000); // 5 second delay to allow for immediate follow-up operations
    }

    const result = {
      success: true,
      sessionId,
      sessionCreated,
      navigation: navResult,
      content: enhancedContent,
      url: navResult.url,
      title: navResult.title,
      website_indexed: indexingResult?.success || false,
      website_id: indexingResult?.websiteId,
      page_id: indexingResult?.pageId,
      indexing_error: indexingResult?.error
    };

    return this.transformResultData(result, 'navigate_and_scrape');
  }

  private async interactWithPage(args: z.infer<typeof BrowserInteractWithPageSchema>) {
    const params = BrowserInteractWithPageSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const results = [];
    
    for (const action of params.actions) {
      let result;
      
      switch (action.type) {
        case 'click':
        case 'type':
        case 'hover':
        case 'select':
          result = await this.interactWithElementCore(
            params.session_id,
            action.type,
            action.selector!,
            action.value
          );
          break;
          
        case 'screenshot':
          result = await this.takeScreenshotCore(
            params.session_id,
            action.filepath,
            {
              fullPage: action.full_page ?? true,
              type: (action.image_format as 'png' | 'jpeg') || 'png',
              returnForAI: action.return_for_ai ?? false
            }
          );
          break;
          
        case 'wait':
          if (action.selector) {
            // Wait for selector
            result = await this.waitForSelector(params.session_id, action.selector, action.timeout || 10000);
          } else {
            // Wait for time
            await new Promise(resolve => setTimeout(resolve, action.timeout || 1000));
            result = { success: true, action: 'wait', duration: action.timeout || 1000 };
          }
          break;
          
        case 'scroll':
          result = await this.scrollPage(params.session_id, action.selector, action.scroll_behavior || 'auto');
          break;
          
        default:
          result = { success: false, error: `Unknown action type: ${action.type}` };
      }
      
      results.push({
        action: action.type,
        selector: action.selector,
        result
      });
      
      // Stop on first failure
      if (!result.success) {
        break;
      }
    }
    
    // Auto-close session if requested
    if (params.auto_close_after) {
      setTimeout(() => {
        this.autoCloseSession(params.session_id);
      }, 2000); // 2 second delay
    }
    
    const pageResult = {
      success: results.every(r => r.result.success),
      sessionId: params.session_id,
      results,
      totalActions: params.actions.length,
      completedActions: results.length
    };
    
    return this.transformResultData(pageResult, 'interact_with_page');
  }

  private async manageBrowserSessions(args: z.infer<typeof BrowserManageSessionsSchema>) {
    const params = BrowserManageSessionsSchema.parse(args);
    
    let result;
    switch (params.action) {
      case 'list':
        result = await this.listBrowserSessionsEnhanced();
        break;
        
      case 'close':
        if (!params.session_id) {
          return { success: false, error: 'session_id required for close action' };
        }
        result = await this.closeBrowserSessionEnhanced(params.session_id, params.force_close);
        break;
        
      case 'close_all':
        result = await this.closeAllSessions(params.force_close);
        break;
        
      case 'cleanup_idle':
        result = await this.cleanupIdleSessions(params.cleanup_criteria);
        break;
        
      case 'get_status':
        result = await this.getSessionsStatus();
        break;
        
      default:
        return { success: false, error: `Unknown action: ${params.action}` };
    }
    
    return this.transformResultData(result, 'manage_browser_sessions');
  }

  // Enhanced session management methods
  private async listBrowserSessionsEnhanced() {
    const sessions = await this.listSessionsCore();
    
    return {
      success: true,
      sessions: sessions.map(session => {
        const metadata = this.sessionMetadata.get(session.id);
        return {
          ...session,
          workflowType: metadata?.workflowType || 'unknown',
          autoClose: metadata?.autoClose || false,
          lastActivity: metadata?.lastActivity || session.lastUsed,
          taskCompleted: metadata?.taskCompleted || false
        };
      })
    };
  }

  private async closeBrowserSessionEnhanced(sessionId: string, forceClose: boolean = false) {
    const metadata = this.sessionMetadata.get(sessionId);
    
    // Don't close documentation sessions unless forced
    if (!forceClose && metadata?.workflowType === 'documentation') {
      return {
        success: false,
        error: 'Cannot close documentation session without force_close=true'
      };
    }
    
    const result = await this.closeBrowserSessionCore(sessionId);
    
    if (result.success) {
      this.sessionMetadata.delete(sessionId);
    }
    
    return result;
  }

  private async closeAllSessions(forceClose: boolean = false) {
    const sessions = await this.listSessionsCore();
    const results = [];
    
    for (const session of sessions) {
      const result = await this.closeBrowserSessionEnhanced(session.id, forceClose);
      results.push({
        sessionId: session.id,
        result
      });
    }
    
    return {
      success: true,
      results,
      totalSessions: sessions.length,
      closedSessions: results.filter(r => r.result.success).length
    };
  }

  private async cleanupIdleSessions(criteria: any = {}) {
    const sessions = await this.listSessionsCore();
    const now = new Date();
    const maxIdleMs = (criteria.max_idle_minutes || 10) * 60 * 1000;
    const excludeDocumentation = criteria.exclude_documentation !== false;
    
    const idleSessions = sessions.filter(session => {
      const metadata = this.sessionMetadata.get(session.id);
      const lastActivity = metadata?.lastActivity || session.lastUsed;
      const isIdle = (now.getTime() - lastActivity.getTime()) > maxIdleMs;
      
      // Skip documentation sessions if excluded
      if (excludeDocumentation && metadata?.workflowType === 'documentation') {
        return false;
      }
      
      return isIdle;
    });
    
    const results = [];
    for (const session of idleSessions) {
      const result = await this.closeBrowserSessionCore(session.id);
      this.sessionMetadata.delete(session.id);
      results.push({
        sessionId: session.id,
        result
      });
    }
    
    return {
      success: true,
      cleanedSessions: results.length,
      criteria,
      results
    };
  }
  
  private async getSessionsStatus() {
    const sessions = await this.listSessionsCore();
    const now = new Date();
    
    const status = {
      totalSessions: sessions.length,
      byWorkflowType: {} as Record<string, number>,
      byStatus: {
        active: 0,
        idle: 0,
        stale: 0
      },
      autoCloseEnabled: 0,
      documentationSessions: 0
    };
    
    sessions.forEach(session => {
      const metadata = this.sessionMetadata.get(session.id);
      const workflowType = metadata?.workflowType || 'unknown';
      const lastActivity = metadata?.lastActivity || session.lastUsed;
      const idleTime = now.getTime() - lastActivity.getTime();
      
      // Count by workflow type
      status.byWorkflowType[workflowType] = (status.byWorkflowType[workflowType] || 0) + 1;
      
      // Count by status
      if (idleTime < 5 * 60 * 1000) { // 5 minutes
        status.byStatus.active++;
      } else if (idleTime < 30 * 60 * 1000) { // 30 minutes
        status.byStatus.idle++;
      } else {
        status.byStatus.stale++;
      }
      
      // Count special types
      if (metadata?.autoClose) {
        status.autoCloseEnabled++;
      }
      if (workflowType === 'documentation') {
        status.documentationSessions++;
      }
    });
    
    return {
      success: true,
      status,
      sessions: sessions.map(session => {
        const metadata = this.sessionMetadata.get(session.id);
        return {
          ...session,
          workflowType: metadata?.workflowType || 'unknown',
          autoClose: metadata?.autoClose || false,
          lastActivity: metadata?.lastActivity || session.lastUsed,
          idleTimeMinutes: Math.floor((now.getTime() - (metadata?.lastActivity || session.lastUsed).getTime()) / (60 * 1000))
        };
      })
    };
  }

  // Session management utility methods
  private updateSessionActivity(sessionId: string) {
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.lastActivity = new Date();
    }
  }
  
  private async autoCloseSession(sessionId: string) {
    const metadata = this.sessionMetadata.get(sessionId);
    
    // Don't auto-close documentation sessions
    if (metadata?.workflowType === 'documentation') {
      return;
    }
    
    // Don't auto-close if disabled
    if (!metadata?.autoClose) {
      return;
    }
    
    await this.closeBrowserSessionCore(sessionId);
    this.sessionMetadata.delete(sessionId);
  }
  
  private async waitForSelector(sessionId: string, selector: string, timeout: number = 10000) {
    try {
      const sessions = await this.listSessionsCore();
      const sessionExists = sessions.some(s => s.id === sessionId);
      
      if (!sessionExists) {
        return { success: false, error: `Session ${sessionId} not found` };
      }
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: `Session ${sessionId} not found` };
      }
      
      await session.page.waitForSelector(selector, { timeout });
      
      return { success: true, selector, timeout };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Wait failed'
      };
    }
  }
  
  private async scrollPage(sessionId: string, selector?: string, behavior: 'auto' | 'smooth' = 'auto') {
    try {
      const script = selector 
        ? `document.querySelector('${selector}')?.scrollIntoView({ behavior: '${behavior}' })`
        : `window.scrollTo({ top: document.body.scrollHeight, behavior: '${behavior}' })`;
      
      const result = await this.executeScriptCore(sessionId, script);
      
      return {
        success: true,
        action: 'scroll',
        selector,
        behavior,
        scriptResult: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scroll failed'
      };
    }
  }
  
  private startCleanupServices() {
    // Original cleanup service from BrowserTools
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const maxAge = 30 * 60 * 1000; // 30 minutes

      for (const [sessionId, session] of this.sessions.entries()) {
        if (now.getTime() - session.lastUsed.getTime() > maxAge) {
          this.closeBrowserSessionCore(sessionId).catch(console.error);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Enhanced cleanup service from BrowserMcpTools
    this.sessionCleanupInterval = setInterval(async () => {
      try {
        await this.cleanupIdleSessions({
          max_idle_minutes: 15,
          exclude_documentation: true
        });
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    }, 5 * 60 * 1000);
  }
  
  /**
   * Transform result data to match BrowserOperationResponse schema
   */
  private transformResultData(result: any, toolName: string): any {
    if (!result || typeof result !== 'object') {
      return { 
        success: false,
        message: 'Invalid result data',
        timestamp: new Date().toISOString(),
        data: { script_result: result }
      };
    }
    
    const data: any = {};
    
    // Map common fields from camelCase to snake_case
    if (result.sessionId) data.session_id = result.sessionId;
    if (result.url) data.url = result.url;
    if (result.content) data.content = result.content;
    if (result.html) data.html = result.html;
    if (result.sessions) data.sessions = result.sessions;
    if (result.results) data.interactions = result.results;
    
    // Handle screenshot paths (multiple possible field names)
    if (result.screenshot_path) {
      data.screenshot_path = result.screenshot_path;
    } else if (result.filepath) {
      data.screenshot_path = result.filepath;
    }
    
    // Handle AI image format
    if (result.aiImage) {
      data.ai_image = result.aiImage;
    }
    
    // Handle navigation results
    if (result.navigation) {
      data.url = result.navigation.url;
      if (!data.metadata) data.metadata = {};
      data.metadata.title = result.navigation.title;
      data.metadata.navigation_success = result.navigation.success;
    }
    
    // Handle script execution results
    if (result.scriptResult !== undefined) {
      data.script_result = result.scriptResult;
    } else if (result.result !== undefined) {
      data.script_result = result.result;
    }
    
    // Handle session management results
    if (toolName === 'manage_browser_sessions') {
      if (result.status) {
        if (!data.metadata) data.metadata = {};
        data.metadata = { ...data.metadata, ...result.status };
      }
      if (result.cleanedSessions !== undefined) {
        if (!data.metadata) data.metadata = {};
        data.metadata.cleaned_sessions = result.cleanedSessions;
      }
    }
    
    // Handle website indexing results
    if (result.website_indexed !== undefined) {
      data.website_indexed = result.website_indexed;
    }
    if (result.website_id) {
      data.website_id = result.website_id;
    }
    if (result.page_id) {
      data.page_id = result.page_id;
    }
    if (result.indexing_error) {
      if (!data.metadata) data.metadata = {};
      data.metadata.indexing_error = result.indexing_error;
    }
    
    // Handle session configuration (for create_browser_session)
    if (result.sessionConfig) {
      if (!data.metadata) data.metadata = {};
      data.metadata.session_config = {
        workflow_type: result.sessionConfig.workflowType,
        auto_close: result.sessionConfig.autoClose,
        session_timeout: result.sessionConfig.sessionTimeout,
        max_idle_time: result.sessionConfig.maxIdleTime
      };
    }
    
    // Handle browser type and other session info
    if (result.browserType) {
      if (!data.metadata) data.metadata = {};
      data.metadata.browser_type = result.browserType;
    }
    
    // Handle interaction-specific fields
    if (result.action) {
      if (!data.metadata) data.metadata = {};
      data.metadata.action = result.action;
    }
    if (result.selector) {
      if (!data.metadata) data.metadata = {};
      data.metadata.selector = result.selector;
    }
    if (result.value !== undefined) {
      if (!data.metadata) data.metadata = {};
      data.metadata.value = result.value;
    }
    
    // Handle pagination/counting fields
    if (result.totalActions !== undefined) {
      if (!data.metadata) data.metadata = {};
      data.metadata.total_actions = result.totalActions;
    }
    if (result.completedActions !== undefined) {
      if (!data.metadata) data.metadata = {};
      data.metadata.completed_actions = result.completedActions;
    }
    if (result.sessionCreated !== undefined) {
      if (!data.metadata) data.metadata = {};
      data.metadata.session_created = result.sessionCreated;
    }
    
    // Include any additional data that doesn't match standard fields
    const standardFields = [
      'sessionId', 'url', 'content', 'html', 'sessions', 'results', 'screenshot_path', 
      'filepath', 'navigation', 'scriptResult', 'result', 'status', 'cleanedSessions',
      'sessionConfig', 'browserType', 'action', 'selector', 'value', 'totalActions',
      'completedActions', 'sessionCreated', 'success', 'error', 'message', 'timestamp'
    ];
    
    Object.keys(result).forEach(key => {
      if (!standardFields.includes(key) && !data.hasOwnProperty(key)) {
        // Convert camelCase to snake_case for metadata
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        if (!data.metadata) data.metadata = {};
        data.metadata[snakeKey] = result[key];
      }
    });
    
    // Return the full response structure
    return {
      success: result.success !== false, // default to true unless explicitly false
      message: result.message || `${toolName} completed successfully`,
      timestamp: new Date().toISOString(),
      execution_time_ms: result.execution_time_ms,
      error: result.error,
      data: Object.keys(data).length > 0 ? data : undefined
    };
  }
  
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
    }
    
    // Close all sessions
    await this.closeAllSessions(true);
  }
  
  // Legacy method implementations for backward compatibility
  private async navigateToUrl(args: z.infer<typeof BrowserLegacyNavigateSchema>) {
    const params = BrowserLegacyNavigateSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const result = await this.navigateToUrlCore(
      params.session_id,
      params.url,
      {
        waitUntil: params.wait_until,
        timeout: params.timeout
      }
    );

    const enhancedResult = {
      ...result,
      sessionId: params.session_id
    };

    return this.transformResultData(enhancedResult, 'navigate_to_url');
  }
  
  private async scrapeContent(args: z.infer<typeof BrowserLegacyScrapeSchema>) {
    const params = BrowserLegacyScrapeSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const result = await this.scrapeContentCore(
      params.session_id,
      {
        selector: params.selector,
        waitForSelector: params.wait_for_selector,
        extractText: params.extract_text,
        extractHtml: params.extract_html,
        extractLinks: params.extract_links,
        extractImages: params.extract_images
      }
    );

    const enhancedResult = {
      ...result,
      sessionId: params.session_id
    };

    return this.transformResultData(enhancedResult, 'scrape_content');
  }
  
  private async takeScreenshot(args: z.infer<typeof BrowserScreenshotSchema>) {
    const params = BrowserScreenshotSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const result = await this.takeScreenshotCore(
      params.session_id,
      params.filepath,
      {
        fullPage: params.full_page,
        quality: params.quality,
        type: params.type,
        returnForAI: params.return_for_ai ?? false
      }
    );

    const enhancedResult = {
      ...result,
      sessionId: params.session_id
    };

    return this.transformResultData(enhancedResult, 'take_screenshot');
  }
  
  private async executeScript(args: z.infer<typeof BrowserExecuteScriptSchema>) {
    const params = BrowserExecuteScriptSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const result = await this.executeScriptCore(
      params.session_id,
      params.script,
      params.args
    );

    const enhancedResult = {
      ...result,
      sessionId: params.session_id,
      scriptResult: result.result
    };

    return this.transformResultData(enhancedResult, 'execute_browser_script');
  }
  
  private async interactWithElement(args: z.infer<typeof BrowserInteractSchema>) {
    const params = BrowserInteractSchema.parse(args);
    
    this.updateSessionActivity(params.session_id);
    
    const result = await this.interactWithElementCore(
      params.session_id,
      params.action,
      params.selector,
      params.value
    );

    const enhancedResult = {
      ...result,
      sessionId: params.session_id,
      action: params.action,
      selector: params.selector,
      value: params.value
    };

    return this.transformResultData(enhancedResult, 'interact_with_element');
  }
  
  private async closeBrowserSession(args: any) {
    const { session_id } = z.object({ session_id: z.string() }).parse(args);
    
    const result = await this.closeBrowserSessionEnhanced(session_id, false);
    
    const enhancedResult = {
      ...result,
      sessionId: session_id
    };
    
    return this.transformResultData(enhancedResult, 'close_browser_session');
  }
  
  private async listBrowserSessions() {
    const result = await this.listBrowserSessionsEnhanced();
    return this.transformResultData(result, 'list_browser_sessions');
  }
}

// Export schemas for MCP server registration
export {
  SessionConfigSchema,
  SessionMetadataSchema
};