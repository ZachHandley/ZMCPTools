import { z } from "zod";

export const BrowserCreateSessionSchema = z.object({
  browser_type: z.enum(["chromium", "firefox", "webkit"]).optional().describe("Browser engine to use. Chromium offers best compatibility and stealth features, Firefox for privacy, Webkit for Safari-like behavior"),
  headless: z.boolean().default(true).describe("Browser runs in headless mode (no UI) for optimal performance and stealth. Always defaults to true for AI automation"),
  javascript_enabled: z.boolean().default(true).describe("Whether to enable JavaScript execution for proper page rendering. Recommended to keep enabled for modern websites"),
  viewport_width: z.number().default(1920).describe("Browser viewport width in pixels. Affects how pages are rendered and responsive design"),
  viewport_height: z.number().default(1080).describe("Browser viewport height in pixels. Affects how pages are rendered and responsive design"),
  user_agent: z.string().optional().describe("Custom user agent string. If not provided, a realistic Chrome user agent will be generated automatically for better stealth"),
  agent_id: z.string().optional().describe("Agent identifier for tracking which AI agent created this session. Used for memory and knowledge graph integration"),
  auto_close: z.boolean().default(true).describe("Whether to automatically close the session after inactivity. Documentation sessions ignore this setting to prevent data loss"),
  workflow_type: z
    .enum(["documentation", "automation", "testing"])
    .default("automation").describe("Type of workflow this session will be used for. Documentation sessions have special handling to prevent auto-close, automation sessions optimize for speed, testing sessions focus on reliability"),
  session_timeout: z.number().default(30 * 60 * 1000).describe("Maximum session lifetime in milliseconds before auto-close (default: 30 minutes)"), // 30 minutes
  max_idle_time: z.number().default(10 * 60 * 1000).describe("Maximum idle time in milliseconds before session is considered stale (default: 10 minutes)"), // 10 minutes
}).describe("Creates a new browser session with intelligent session management, stealth features, and workflow-aware auto-close behavior. Use this to start browser automation tasks.");

export const BrowserNavigateAndScrapeSchema = z.object({
  session_id: z.string().optional().describe("Browser session ID to use. If not provided and auto_create_session is true, a new session will be created automatically"),
  url: z.string().url().describe("URL to navigate to. Must be a valid HTTP/HTTPS URL"),
  wait_until: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .default("domcontentloaded").describe("Navigation wait condition: 'load' waits for all resources, 'domcontentloaded' waits for DOM (faster), 'networkidle' waits for network activity to stop"),
  timeout: z.number().default(30000).describe("Navigation timeout in milliseconds. Increase for slow-loading pages"),
  extract_text: z.boolean().default(true).describe("Whether to extract text content from the page. Useful for content analysis and AI processing"),
  extract_html: z.boolean().default(false).describe("Whether to extract raw HTML content. Useful for detailed page analysis or when text extraction isn't sufficient"),
  extract_sanitized_html: z.boolean().default(false).describe("Whether to extract sanitized HTML content with scripts and styles removed. Safer for AI processing"),
  extract_markdown: z.boolean().default(false).describe("Whether to convert page content to markdown format. Clean format for AI analysis"),
  extract_dom_json: z.boolean().default(false).describe("Whether to extract DOM structure as navigable JSON with inline styles. Enables AI navigation of page structure"),
  extract_links: z.boolean().default(false).describe("Whether to extract all links from the page. Returns array of {text, href} objects"),
  extract_images: z.boolean().default(false).describe("Whether to extract all images from the page. Returns array of {alt, src} objects"),
  capture_screenshot: z.boolean().default(false).describe("Whether to capture a screenshot of the page and store as base64. Enables AI visual analysis"),
  screenshot_full_page: z.boolean().default(false).describe("Whether to capture full page screenshot or just viewport. Only used if capture_screenshot is true"),
  auto_index_website: z.boolean().default(true).describe("Whether to automatically index this page in the website database for future reference"),
  selector: z.string().optional().describe("CSS selector to limit extraction to specific elements. If provided, only content within matching elements will be extracted"),
  wait_for_selector: z.string().optional().describe("CSS selector to wait for before extracting content. Useful for dynamic content that loads after navigation"),
  auto_create_session: z.boolean().default(true).describe("Whether to automatically create a new session if session_id is not provided. Convenient for one-off operations"),
  browser_type: z.enum(["chromium", "firefox", "webkit"]).optional().describe("Browser engine to use when creating a new session (only used if auto_create_session is true)"),
}).describe("Navigate to a URL and optionally extract content in one operation. Most efficient way to scrape web pages. Can auto-create sessions for convenience.");

export const BrowserInteractWithPageSchema = z.object({
  session_id: z.string().describe("Browser session ID to perform interactions on. Session must already exist"),
  actions: z
    .array(
      z.object({
        type: z.enum([
          "click",
          "type",
          "hover",
          "select",
          "screenshot",
          "wait",
          "scroll",
        ]).describe("Type of interaction to perform: 'click' for clicking elements, 'type' for entering text, 'hover' for mouse hover, 'select' for dropdown selection, 'screenshot' for capturing page, 'wait' for pausing/waiting, 'scroll' for page scrolling"),
        selector: z.string().optional().describe("CSS selector for the target element. Required for click, type, hover, select actions. Optional for scroll (scrolls to element if provided, otherwise scrolls to bottom)"),
        value: z.union([z.string(), z.array(z.string())]).optional().describe("Value to use for the action. For 'type': text to enter, for 'select': option value(s) to select"),
        filepath: z.string().optional().describe("File path for screenshot action. Must be provided when type is 'screenshot' and return_for_ai is false"), // for screenshots
        return_for_ai: z.boolean().default(false).describe("Whether to return screenshot in AI-consumable format {type: 'image', data: 'base64', mimeType: 'image/png'} instead of saving to file"),
        full_page: z.boolean().default(true).describe("Whether to capture full page screenshot or just viewport (for screenshot actions)"),
        image_format: z.enum(["png", "jpeg"]).default("png").describe("Image format for screenshot (for screenshot actions)"),
        timeout: z.number().default(10000).describe("Timeout for the action in milliseconds. How long to wait for element to be available"),
        scroll_behavior: z.enum(["auto", "smooth"]).default("auto").describe("Scroll behavior for scroll actions: 'auto' for instant scrolling, 'smooth' for animated scrolling"),
      }).describe("Individual browser action to perform. Actions are executed in sequence and will stop on first failure")
    )
    .min(1).describe("Array of actions to perform in sequence. Must contain at least one action"),
  auto_close_after: z.boolean().default(false).describe("Whether to automatically close the browser session after completing all actions. Useful for cleanup after one-time operations"),
}).describe("Perform a sequence of interactions with a web page including clicking, typing, hovering, selecting, taking screenshots, waiting, and scrolling. Actions are executed in order and stop on first failure.");

export const BrowserManageSessionsSchema = z.object({
  action: z.enum(["list", "close", "close_all", "cleanup_idle", "get_status"]).describe("Management action to perform: 'list' shows all sessions, 'close' closes specific session, 'close_all' closes all sessions, 'cleanup_idle' removes idle sessions, 'get_status' provides detailed session statistics"),
  session_id: z.string().optional().describe("Session ID to operate on. Required for 'close' action, ignored for other actions"),
  force_close: z.boolean().default(false).describe("Whether to force close sessions even if they are marked as documentation sessions (which are normally protected from auto-close)"),
  cleanup_criteria: z
    .object({
      max_idle_minutes: z.number().default(10).describe("Maximum idle time in minutes before a session is considered for cleanup"),
      exclude_documentation: z.boolean().default(true).describe("Whether to exclude documentation sessions from cleanup (recommended to prevent data loss)"),
    })
    .optional().describe("Criteria for cleanup_idle action. Defines which sessions should be considered for cleanup"),
}).describe("Manage browser sessions with actions like listing, closing, bulk cleanup, and getting detailed status information. Includes protection for documentation sessions to prevent data loss.");

export const BrowserLegacyNavigateSchema = z.object({
  session_id: z.string().describe("Browser session ID to navigate in. Session must already exist"),
  url: z.string().url().describe("URL to navigate to. Must be a valid HTTP/HTTPS URL"),
  wait_until: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .default("domcontentloaded").describe("Navigation wait condition: 'load' waits for all resources, 'domcontentloaded' waits for DOM (faster), 'networkidle' waits for network activity to stop"),
  timeout: z.number().default(30000).describe("Navigation timeout in milliseconds. Increase for slow-loading pages"),
}).describe("[LEGACY] Navigate to a URL in an existing browser session. Use navigate_and_scrape instead for better functionality and auto-session creation.");

export const BrowserLegacyScrapeSchema = z.object({
  session_id: z.string().describe("Browser session ID to scrape content from. Session must already exist and be on the desired page"),
  selector: z.string().optional().describe("CSS selector to limit extraction to specific elements. If provided, only content within matching elements will be extracted"),
  wait_for_selector: z.string().optional().describe("CSS selector to wait for before extracting content. Useful for dynamic content that loads after navigation"),
  extract_text: z.boolean().default(true).describe("Whether to extract text content from the page. Useful for content analysis and AI processing"),
  extract_html: z.boolean().default(false).describe("Whether to extract raw HTML content. Useful for detailed page analysis or when text extraction isn't sufficient"),
  extract_links: z.boolean().default(false).describe("Whether to extract all links from the page. Returns array of {text, href} objects"),
  extract_images: z.boolean().default(false).describe("Whether to extract all images from the page. Returns array of {alt, src} objects"),
}).describe("[LEGACY] Scrape content from the current page in a browser session. Use navigate_and_scrape instead for combined navigation and scraping in one operation.");

export const BrowserScreenshotSchema = z.object({
  session_id: z.string().describe("Browser session ID to take screenshot from. Session must already exist"),
  filepath: z.string().optional().describe("File path where the screenshot will be saved. Should include file extension (.png or .jpeg). Required when return_for_ai is false"),
  return_for_ai: z.boolean().default(false).describe("Whether to return screenshot in AI-consumable format {type: 'image', data: 'base64', mimeType: 'image/png'} instead of saving to file"),
  full_page: z.boolean().default(false).describe("Whether to capture the full page (including parts below the fold) or just the visible viewport"),
  quality: z.number().min(0).max(100).optional().describe("Image quality for JPEG format (0-100). Higher values mean better quality but larger file size. Not applicable for PNG format"),
  type: z.enum(["png", "jpeg"]).default("png").describe("Image format for the screenshot. PNG provides lossless compression, JPEG provides smaller file sizes"),
}).describe("[LEGACY] Take a screenshot of the current page in a browser session. Use interact_with_page with screenshot action instead for better integration with other actions.");

export const BrowserExecuteScriptSchema = z.object({
  session_id: z.string().describe("Browser session ID to execute script in. Session must already exist"),
  script: z.string().describe("JavaScript code to execute in the browser context. Can access DOM, window object, and browser APIs. Use return statement to return values"),
  args: z.array(z.any()).default([]).describe("Arguments to pass to the script. Will be available as function parameters in the script execution context"),
}).describe("[LEGACY] Execute JavaScript code in the browser context. Powerful for custom interactions, data extraction, and page manipulation not covered by standard actions.");

export const BrowserInteractSchema = z.object({
  session_id: z.string().describe("Browser session ID to interact with. Session must already exist"),
  action: z.enum(["click", "type", "hover", "select"]).describe("Type of interaction: 'click' for clicking elements, 'type' for entering text, 'hover' for mouse hover, 'select' for dropdown selection"),
  selector: z.string().describe("CSS selector for the target element. Must uniquely identify the element to interact with"),
  value: z.union([z.string(), z.array(z.string())]).optional().describe("Value to use for the action. For 'type': text to enter, for 'select': option value(s) to select. Not used for 'click' or 'hover'"),
}).describe("[LEGACY] Interact with a single element on the page. Use interact_with_page instead for multiple actions and better error handling.");

// ===============================================
// AI-Powered DOM Navigation Tools (AIDotNavigation Integration)
// ===============================================

export const BrowserAnalyzeDOMStructureSchema = z.object({
  page_id: z.string().describe("Database ID of the website page to analyze. Must have DOM JSON content available"),
  goal: z.string().describe("What you want to achieve by analyzing this page structure. Guides the AI exploration strategy"),
  max_depth: z.number().default(4).describe("Maximum depth for DOM path traversal during analysis"),
  focus_areas: z.array(z.string()).optional().describe("Specific areas to focus on (e.g., 'navigation', 'forms', 'content', 'buttons')")
}).describe("Analyze a page's DOM structure using AI-guided exploration. Requires page to be indexed with DOM JSON content.");

export const BrowserNavigateDOMPathSchema = z.object({
  page_id: z.string().describe("Database ID of the website page with DOM JSON content"),
  path: z.string().describe("Dot notation path to navigate through DOM structure (e.g., 'body.main.article[0].paragraphs[2]')"),
  extract_keys: z.array(z.string()).optional().describe("Specific keys to extract from the target DOM node (e.g., ['textContent', 'href', 'src'])")
}).describe("Navigate to a specific path in the DOM JSON structure and extract content. Uses dot notation like AIDotNavigation.");

export const BrowserSearchDOMElementsSchema = z.object({
  page_id: z.string().describe("Database ID of the website page with DOM JSON content"),
  search_term: z.string().describe("Term to search for in DOM paths, element types, or content"),
  element_types: z.array(z.string()).optional().describe("Filter by specific element types (e.g., ['button', 'a', 'input', 'form'])"),
  has_content: z.boolean().optional().describe("Whether to only return elements that have text content")
}).describe("Search for specific elements in the DOM JSON structure. Find buttons, links, forms, or content by type or keyword.");

export const BrowserGetPageScreenshotSchema = z.object({
  page_id: z.string().describe("Database ID of the website page to get screenshot from"),
  return_base64: z.boolean().default(false).describe("Whether to return the full base64 screenshot data or just metadata")
}).describe("Retrieve screenshot of an indexed webpage for AI visual analysis. Can return full base64 data or just metadata.");

export const BrowserAnalyzeScreenshotSchema = z.object({
  page_id: z.string().describe("Database ID of the website page with screenshot data"),
  analysis_focus: z.string().describe("What to focus on when analyzing the screenshot (e.g., 'UI layout', 'navigation elements', 'content structure', 'visual design')")
}).describe("Analyze a page screenshot using AI vision capabilities. Requires page to have screenshot data stored.");

// ===============================================
// Browser Tool Response Schemas
// ===============================================

// Create Browser Session Response
export const BrowserCreateSessionResponseSchema = z.object({
  success: z.boolean().describe("Whether the browser session was created successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Unique identifier for the created browser session"),
    browser_type: z.string().describe("Type of browser engine used (chromium, firefox, webkit)"),
    session_config: z.object({
      workflow_type: z.string().describe("Type of workflow this session is configured for (documentation, automation, testing)"),
      auto_close: z.boolean().describe("Whether the session will automatically close after inactivity"),
      session_timeout: z.number().describe("Maximum session lifetime in milliseconds before auto-close"),
      max_idle_time: z.number().describe("Maximum idle time in milliseconds before session is considered stale")
    }).optional().describe("Session configuration details including auto-close behavior and timeout settings"),
    user_agent: z.string().optional().describe("User agent string used by the browser session for web requests")
  }).optional().describe("Session creation data including session ID, browser type, and configuration")
}).describe("Response returned after creating a new browser session with session management configuration");

// Navigate and Scrape Response
export const BrowserNavigateAndScrapeResponseSchema = z.object({
  success: z.boolean().describe("Whether the navigation and scraping operation completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for the operation"),
    session_created: z.boolean().describe("Whether a new session was automatically created for this operation"),
    url: z.string().describe("Final URL after navigation (may differ from requested URL due to redirects)"),
    title: z.string().optional().describe("Page title from the navigated webpage"),
    content: z.object({
      text: z.string().optional().describe("Extracted text content from the page (if extract_text was enabled)"),
      html: z.string().optional().describe("Raw HTML content from the page (if extract_html was enabled)"),
      sanitized_html: z.string().optional().describe("Sanitized HTML content with scripts and styles removed (if extract_sanitized_html was enabled)"),
      markdown: z.string().optional().describe("Page content converted to markdown format (if extract_markdown was enabled)"),
      dom_json: z.record(z.string(), z.any()).optional().describe("DOM structure as navigable JSON with inline styles (if extract_dom_json was enabled)"),
      screenshot_base64: z.string().optional().describe("Base64-encoded screenshot of the page (if capture_screenshot was enabled)"),
      screenshot_metadata: z.object({
        width: z.number().describe("Screenshot width in pixels"),
        height: z.number().describe("Screenshot height in pixels"),
        device_scale_factor: z.number().describe("Device pixel ratio used for screenshot"),
        timestamp: z.string().describe("ISO timestamp when screenshot was captured"),
        full_page: z.boolean().describe("Whether screenshot captured full page or just viewport"),
        format: z.enum(["png", "jpeg"]).describe("Image format of the screenshot")
      }).optional().describe("Screenshot capture metadata (if capture_screenshot was enabled)"),
      links: z.array(z.object({
        text: z.string().describe("Visible text of the link"),
        href: z.string().describe("URL that the link points to")
      })).optional().describe("Array of links found on the page (if extract_links was enabled)"),
      images: z.array(z.object({
        alt: z.string().describe("Alt text of the image"),
        src: z.string().describe("Source URL of the image")
      })).optional().describe("Array of images found on the page (if extract_images was enabled)")
    }).optional().describe("Scraped content from the page based on extraction options specified"),
    website_indexed: z.boolean().optional().describe("Whether the page was automatically indexed in the website database"),
    website_id: z.string().optional().describe("Database ID of the indexed website (if auto_index_website was enabled)"),
    page_id: z.string().optional().describe("Database ID of the indexed page (if auto_index_website was enabled)"),
    navigation: z.object({
      success: z.boolean().describe("Whether the navigation to the URL was successful"),
      url: z.string().describe("URL that was navigated to"),
      title: z.string().optional().describe("Page title retrieved during navigation")
    }).optional().describe("Navigation result details including success status and page metadata")
  }).optional().describe("Combined navigation and scraping results including session info, page content, and navigation status")
}).describe("Response returned after navigating to a URL and optionally scraping content, with details about the operation and extracted data");

// Interact With Page Response
export const BrowserInteractWithPageResponseSchema = z.object({
  success: z.boolean().describe("Whether all page interactions completed successfully (false if any action failed)"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute all interactions in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for the interactions"),
    total_actions: z.number().describe("Total number of actions that were requested to be performed"),
    completed_actions: z.number().describe("Number of actions that were successfully completed before any failure"),
    interactions: z.array(z.object({
      action: z.string().describe("Type of interaction performed (click, type, hover, select, screenshot, wait, scroll)"),
      selector: z.string().optional().describe("CSS selector used for the interaction (if applicable)"),
      result: z.object({
        success: z.boolean().describe("Whether this specific interaction was successful"),
        error: z.string().optional().describe("Error message if the interaction failed"),
        screenshot_path: z.string().optional().describe("File path where screenshot was saved (for screenshot actions)"),
        ai_image: z.object({
          type: z.literal("image").describe("Type identifier for AI-consumable image format"),
          data: z.string().describe("Base64-encoded image data"),
          mimeType: z.enum(["image/png", "image/jpeg"]).describe("MIME type of the image")
        }).optional().describe("AI-consumable image format (when return_for_ai is true for screenshot actions)")
      }).describe("Result details for this specific interaction")
    })).describe("Array of interaction results, executed in sequence until first failure"),
    auto_close_scheduled: z.boolean().optional().describe("Whether the session is scheduled to auto-close after this operation")
  }).optional().describe("Page interaction results including session info, action summary, and detailed interaction outcomes")
}).describe("Response returned after performing a sequence of page interactions (clicks, typing, etc.) with detailed results for each action");

// Manage Browser Sessions Response
export const BrowserManageSessionsResponseSchema = z.object({
  success: z.boolean().describe("Whether the session management operation completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the management operation in milliseconds"),
  data: z.object({
    action: z.string().describe("Management action that was performed (list, close, close_all, cleanup_idle, get_status)"),
    sessions: z.array(z.object({
      id: z.string().describe("Unique session identifier"),
      browser_type: z.string().describe("Browser engine type (chromium, firefox, webkit)"),
      created_at: z.string().describe("ISO timestamp when the session was created"),
      last_used: z.string().describe("ISO timestamp when the session was last used for an operation"),
      workflow_type: z.string().describe("Workflow type the session was configured for (documentation, automation, testing)"),
      auto_close: z.boolean().describe("Whether the session has auto-close enabled"),
      agent_id: z.string().optional().describe("ID of the agent that created this session (if applicable)"),
      idle_time_minutes: z.number().optional().describe("Number of minutes the session has been idle (for status queries)")
    })).optional().describe("Array of browser session details (returned for list, get_status actions)"),
    session_id: z.string().optional().describe("Specific session ID that was operated on (for close action)"),
    total_sessions: z.number().optional().describe("Total number of sessions that existed before the operation"),
    closed_sessions: z.number().optional().describe("Number of sessions that were closed (for close_all action)"),
    cleaned_sessions: z.number().optional().describe("Number of idle sessions that were cleaned up (for cleanup_idle action)"),
    metadata: z.object({
      total_sessions: z.number().describe("Total number of active sessions"),
      by_workflow_type: z.record(z.string(), z.number()).describe("Count of sessions grouped by workflow type"),
      by_status: z.object({
        active: z.number().describe("Number of recently active sessions (< 5 minutes idle)"),
        idle: z.number().describe("Number of idle sessions (5-30 minutes idle)"),
        stale: z.number().describe("Number of stale sessions (> 30 minutes idle)")
      }).describe("Session count by activity status"),
      auto_close_enabled: z.number().describe("Number of sessions with auto-close enabled"),
      documentation_sessions: z.number().describe("Number of documentation sessions (protected from auto-close)")
    }).optional().describe("Detailed session statistics and metadata (returned for get_status action)")
  }).optional().describe("Session management operation results including affected sessions and statistics")
}).describe("Response returned after managing browser sessions with details about the operation performed and affected sessions");

// Legacy Navigate To URL Response
export const BrowserLegacyNavigateResponseSchema = z.object({
  success: z.boolean().describe("Whether the navigation operation completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the navigation in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for navigation"),
    url: z.string().describe("Final URL after navigation (may differ from requested URL due to redirects)"),
    title: z.string().optional().describe("Page title retrieved from the navigated webpage"),
    navigation_success: z.boolean().describe("Whether the browser successfully navigated to the URL and loaded the page")
  }).optional().describe("Navigation result data including session info, final URL, and page metadata")
}).describe("[LEGACY] Response returned after navigating to a URL in an existing browser session");

// Legacy Scrape Content Response
export const BrowserLegacyScrapeResponseSchema = z.object({
  success: z.boolean().describe("Whether the content scraping operation completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the scraping operation in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for scraping"),
    content: z.object({
      text: z.string().optional().describe("Extracted text content from the current page (if extract_text was enabled)"),
      html: z.string().optional().describe("Raw HTML content from the current page (if extract_html was enabled)"),
      links: z.array(z.object({
        text: z.string().describe("Visible text of the link"),
        href: z.string().describe("URL that the link points to")
      })).optional().describe("Array of links found on the page (if extract_links was enabled)"),
      images: z.array(z.object({
        alt: z.string().describe("Alt text of the image"),
        src: z.string().describe("Source URL of the image")
      })).optional().describe("Array of images found on the page (if extract_images was enabled)")
    }).optional().describe("Scraped content from the current page based on extraction options specified")
  }).optional().describe("Content scraping results including session info and extracted page data")
}).describe("[LEGACY] Response returned after scraping content from the current page in a browser session");

// Legacy Take Screenshot Response
export const BrowserLegacyTakeScreenshotResponseSchema = z.object({
  success: z.boolean().describe("Whether the screenshot was captured successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to capture the screenshot in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for taking the screenshot"),
    screenshot_path: z.string().optional().describe("File path where the screenshot was saved (when return_for_ai is false)"),
    ai_image: z.object({
      type: z.literal("image").describe("Type identifier for AI-consumable image format"),
      data: z.string().describe("Base64-encoded image data"),
      mimeType: z.enum(["image/png", "image/jpeg"]).describe("MIME type of the image")
    }).optional().describe("AI-consumable image format (when return_for_ai is true)"),
    full_page: z.boolean().describe("Whether the screenshot captured the full page or just the visible viewport"),
    type: z.string().describe("Image format of the screenshot (png or jpeg)"),
    quality: z.number().optional().describe("Quality setting used for JPEG screenshots (0-100, higher is better quality)")
  }).optional().describe("Screenshot capture results including session info, file path or AI image, and image settings")
}).describe("[LEGACY] Response returned after taking a screenshot of the current page in a browser session");

// Legacy Execute Browser Script Response
export const BrowserLegacyExecuteScriptResponseSchema = z.object({
  success: z.boolean().describe("Whether the JavaScript script executed successfully in the browser"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the script in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for script execution"),
    script_result: z.any().describe("Return value from the executed JavaScript code (can be any JSON-serializable type)"),
    script: z.string().optional().describe("The JavaScript code that was executed (for reference)")
  }).optional().describe("Script execution results including session info, return value, and script reference")
}).describe("[LEGACY] Response returned after executing JavaScript code in the browser context");

// Legacy Interact With Element Response
export const BrowserLegacyInteractWithElementResponseSchema = z.object({
  success: z.boolean().describe("Whether the element interaction completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to perform the interaction in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was used for the interaction"),
    action: z.string().describe("Type of interaction performed (click, type, hover, select)"),
    selector: z.string().describe("CSS selector that was used to target the element"),
    value: z.union([z.string(), z.array(z.string())]).optional().describe("Value that was used for the interaction (text for typing, options for selecting)"),
    interaction_success: z.boolean().describe("Whether the interaction with the element was successful")
  }).optional().describe("Element interaction results including session info, action details, and success status")
}).describe("[LEGACY] Response returned after interacting with a single element on the page");

// Legacy Close Browser Session Response
export const BrowserLegacyCloseSessionResponseSchema = z.object({
  success: z.boolean().describe("Whether the browser session was closed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to close the session in milliseconds"),
  data: z.object({
    session_id: z.string().describe("Browser session ID that was closed"),
    session_closed: z.boolean().describe("Whether the session was successfully closed and resources cleaned up")
  }).optional().describe("Session closure results including session info and cleanup status")
}).describe("[LEGACY] Response returned after closing a browser session");

// Legacy List Browser Sessions Response
export const BrowserLegacyListSessionsResponseSchema = z.object({
  success: z.boolean().describe("Whether the session listing operation completed successfully"),
  message: z.string().describe("Human-readable message describing the operation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to retrieve the session list in milliseconds"),
  data: z.object({
    sessions: z.array(z.object({
      id: z.string().describe("Unique session identifier"),
      browser_type: z.string().describe("Browser engine type (chromium, firefox, webkit)"),
      created_at: z.string().describe("ISO timestamp when the session was created"),
      last_used: z.string().describe("ISO timestamp when the session was last used for an operation"),
      workflow_type: z.string().describe("Workflow type the session was configured for (documentation, automation, testing)"),
      auto_close: z.boolean().describe("Whether the session has auto-close enabled"),
      agent_id: z.string().optional().describe("ID of the agent that created this session (if applicable)")
    })).describe("Array of active browser session details"),
    count: z.number().describe("Total number of active browser sessions")
  }).optional().describe("Session listing results including session details and count")
}).describe("[LEGACY] Response returned after listing all active browser sessions");

// ===============================================
// AI-Powered DOM Navigation Response Schemas
// ===============================================

// DOM Structure Analysis Response
export const BrowserAnalyzeDOMStructureResponseSchema = z.object({
  success: z.boolean().describe("Whether the DOM structure analysis completed successfully"),
  message: z.string().describe("Human-readable message describing the analysis result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to complete the analysis in milliseconds"),
  data: z.object({
    page_id: z.string().describe("Database ID of the analyzed page"),
    goal: z.string().describe("The analysis goal that was specified"),
    analysis_results: z.object({
      structure_overview: z.object({
        total_elements: z.number().describe("Total number of DOM elements found"),
        max_depth: z.number().describe("Maximum depth of the DOM tree"),
        element_types: z.record(z.string(), z.number()).describe("Count of elements by type (div, a, button, etc.)")
      }).describe("High-level overview of the DOM structure"),
      navigation_paths: z.array(z.string()).describe("Key navigation paths found in the DOM structure"),
      interactive_elements: z.array(z.object({
        path: z.string().describe("DOM path to the interactive element"),
        type: z.string().describe("Element type (button, link, input, etc.)"),
        description: z.string().describe("Description of what this element does"),
        content: z.string().optional().describe("Text content or label of the element")
      })).describe("Interactive elements that can be acted upon"),
      content_areas: z.array(z.object({
        path: z.string().describe("DOM path to the content area"),
        type: z.string().describe("Type of content (article, navigation, sidebar, etc.)"),
        description: z.string().describe("Description of the content area")
      })).describe("Main content areas identified in the page"),
      ai_insights: z.string().describe("AI-generated insights about the page structure and navigation opportunities")
    }).describe("Comprehensive analysis results from AI exploration of the DOM structure")
  }).optional().describe("DOM structure analysis results including paths, elements, and AI insights")
}).describe("Response returned after AI-powered analysis of a page's DOM structure");

// DOM Path Navigation Response
export const BrowserNavigateDOMPathResponseSchema = z.object({
  success: z.boolean().describe("Whether the DOM path navigation completed successfully"),
  message: z.string().describe("Human-readable message describing the navigation result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to navigate the DOM path in milliseconds"),
  data: z.object({
    page_id: z.string().describe("Database ID of the page that was navigated"),
    path: z.string().describe("The DOM path that was navigated"),
    path_exists: z.boolean().describe("Whether the specified path exists in the DOM structure"),
    extracted_data: z.record(z.string(), z.any()).optional().describe("Data extracted from the target DOM node"),
    element_info: z.object({
      tag_name: z.string().describe("HTML tag name of the target element"),
      attributes: z.record(z.string(), z.any()).describe("HTML attributes of the target element"),
      text_content: z.string().optional().describe("Text content of the target element"),
      children_count: z.number().describe("Number of child elements"),
      has_children: z.boolean().describe("Whether the element has child elements")
    }).optional().describe("Detailed information about the target DOM element"),
    suggestions: z.array(z.string()).optional().describe("Suggested similar paths if the specified path was not found")
  }).optional().describe("DOM path navigation results including extracted data and element information")
}).describe("Response returned after navigating to a specific path in the DOM JSON structure");

// DOM Elements Search Response
export const BrowserSearchDOMElementsResponseSchema = z.object({
  success: z.boolean().describe("Whether the DOM elements search completed successfully"),
  message: z.string().describe("Human-readable message describing the search result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to search DOM elements in milliseconds"),
  data: z.object({
    page_id: z.string().describe("Database ID of the page that was searched"),
    search_term: z.string().describe("The search term that was used"),
    total_matches: z.number().describe("Total number of matching elements found"),
    matching_elements: z.array(z.object({
      path: z.string().describe("DOM path to the matching element"),
      element_type: z.string().describe("HTML tag name of the element"),
      content_preview: z.string().optional().describe("Preview of the element's text content"),
      attributes: z.record(z.string(), z.any()).optional().describe("Relevant HTML attributes of the element"),
      match_reason: z.string().describe("Why this element matched the search criteria")
    })).describe("Array of elements that matched the search criteria"),
    element_type_summary: z.record(z.string(), z.number()).optional().describe("Count of matching elements by type")
  }).optional().describe("DOM elements search results including matching paths and element details")
}).describe("Response returned after searching for specific elements in the DOM JSON structure");

// Page Screenshot Retrieval Response
export const BrowserGetPageScreenshotResponseSchema = z.object({
  success: z.boolean().describe("Whether the screenshot retrieval completed successfully"),
  message: z.string().describe("Human-readable message describing the retrieval result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to retrieve the screenshot in milliseconds"),
  data: z.object({
    page_id: z.string().describe("Database ID of the page"),
    has_screenshot: z.boolean().describe("Whether the page has screenshot data available"),
    screenshot_base64: z.string().optional().describe("Base64-encoded screenshot data (if return_base64 was true)"),
    screenshot_metadata: z.object({
      width: z.number().describe("Screenshot width in pixels"),
      height: z.number().describe("Screenshot height in pixels"),
      device_scale_factor: z.number().describe("Device pixel ratio used for screenshot"),
      timestamp: z.string().describe("ISO timestamp when screenshot was captured"),
      full_page: z.boolean().describe("Whether screenshot captured full page or just viewport"),
      format: z.enum(["png", "jpeg"]).describe("Image format of the screenshot"),
      size_bytes: z.number().optional().describe("Size of the screenshot data in bytes")
    }).optional().describe("Screenshot capture and storage metadata")
  }).optional().describe("Screenshot retrieval results including data and metadata")
}).describe("Response returned after retrieving a screenshot from an indexed webpage");

// Screenshot Analysis Response
export const BrowserAnalyzeScreenshotResponseSchema = z.object({
  success: z.boolean().describe("Whether the screenshot analysis completed successfully"),
  message: z.string().describe("Human-readable message describing the analysis result"),
  timestamp: z.string().describe("ISO timestamp when the response was generated"),
  execution_time_ms: z.number().optional().describe("Time taken to analyze the screenshot in milliseconds"),
  data: z.object({
    page_id: z.string().describe("Database ID of the analyzed page"),
    analysis_focus: z.string().describe("The analysis focus that was specified"),
    visual_analysis: z.object({
      layout_description: z.string().describe("AI description of the overall page layout and structure"),
      ui_elements: z.array(z.object({
        type: z.string().describe("Type of UI element (button, menu, form, etc.)"),
        description: z.string().describe("Description of the UI element and its purpose"),
        location: z.string().describe("Approximate location on the page (top, center, sidebar, etc.)")
      })).describe("UI elements identified through visual analysis"),
      color_scheme: z.string().optional().describe("Description of the page's color scheme and visual style"),
      accessibility_notes: z.string().optional().describe("Observations about accessibility and usability"),
      mobile_responsiveness: z.string().optional().describe("Assessment of mobile responsiveness from the screenshot")
    }).describe("Visual analysis results from AI examination of the screenshot"),
    ai_insights: z.string().describe("AI-generated insights about the page design, usability, and visual structure")
  }).optional().describe("Screenshot analysis results including visual elements and AI insights")
}).describe("Response returned after AI-powered analysis of a page screenshot");

// ===============================================
// Export Types
// ===============================================

// Request Types
export type BrowserCreateSessionInput = z.infer<
  typeof BrowserCreateSessionSchema
>;
export type BrowserNavigateAndScrapeInput = z.infer<
  typeof BrowserNavigateAndScrapeSchema
>;
export type BrowserInteractWithPageInput = z.infer<
  typeof BrowserInteractWithPageSchema
>;
export type BrowserManageSessionsInput = z.infer<
  typeof BrowserManageSessionsSchema
>;
export type BrowserLegacyNavigateInput = z.infer<
  typeof BrowserLegacyNavigateSchema
>;
export type BrowserLegacyScrapeInput = z.infer<
  typeof BrowserLegacyScrapeSchema
>;
export type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotSchema>;
export type BrowserExecuteScriptInput = z.infer<
  typeof BrowserExecuteScriptSchema
>;
export type BrowserInteractInput = z.infer<typeof BrowserInteractSchema>;

// AI-Powered DOM Navigation Input Types
export type BrowserAnalyzeDOMStructureInput = z.infer<
  typeof BrowserAnalyzeDOMStructureSchema
>;
export type BrowserNavigateDOMPathInput = z.infer<
  typeof BrowserNavigateDOMPathSchema
>;
export type BrowserSearchDOMElementsInput = z.infer<
  typeof BrowserSearchDOMElementsSchema
>;
export type BrowserGetPageScreenshotInput = z.infer<
  typeof BrowserGetPageScreenshotSchema
>;
export type BrowserAnalyzeScreenshotInput = z.infer<
  typeof BrowserAnalyzeScreenshotSchema
>;

// Response Types
export type BrowserCreateSessionResponse = z.infer<typeof BrowserCreateSessionResponseSchema>;
export type BrowserNavigateAndScrapeResponse = z.infer<typeof BrowserNavigateAndScrapeResponseSchema>;
export type BrowserInteractWithPageResponse = z.infer<typeof BrowserInteractWithPageResponseSchema>;
export type BrowserManageSessionsResponse = z.infer<typeof BrowserManageSessionsResponseSchema>;
export type BrowserLegacyNavigateResponse = z.infer<typeof BrowserLegacyNavigateResponseSchema>;
export type BrowserLegacyScrapeResponse = z.infer<typeof BrowserLegacyScrapeResponseSchema>;
export type BrowserLegacyTakeScreenshotResponse = z.infer<typeof BrowserLegacyTakeScreenshotResponseSchema>;
export type BrowserLegacyExecuteScriptResponse = z.infer<typeof BrowserLegacyExecuteScriptResponseSchema>;
export type BrowserLegacyInteractWithElementResponse = z.infer<typeof BrowserLegacyInteractWithElementResponseSchema>;
export type BrowserLegacyCloseSessionResponse = z.infer<typeof BrowserLegacyCloseSessionResponseSchema>;
export type BrowserLegacyListSessionsResponse = z.infer<typeof BrowserLegacyListSessionsResponseSchema>;

// AI-Powered DOM Navigation Response Types
export type BrowserAnalyzeDOMStructureResponse = z.infer<typeof BrowserAnalyzeDOMStructureResponseSchema>;
export type BrowserNavigateDOMPathResponse = z.infer<typeof BrowserNavigateDOMPathResponseSchema>;
export type BrowserSearchDOMElementsResponse = z.infer<typeof BrowserSearchDOMElementsResponseSchema>;
export type BrowserGetPageScreenshotResponse = z.infer<typeof BrowserGetPageScreenshotResponseSchema>;
export type BrowserAnalyzeScreenshotResponse = z.infer<typeof BrowserAnalyzeScreenshotResponseSchema>;
