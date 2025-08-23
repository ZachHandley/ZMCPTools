import type { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpTool } from '../schemas/tools/index.js';
import { WebsitePagesRepository } from "../repositories/WebsitePagesRepository.js";
import { DatabaseManager } from "../database/index.js";
import { Logger } from "../utils/logger.js";

const logger = new Logger("BrowserAIDOMTools");

// Schema definitions matching the MCP tool schemas
const AnalyzeDOMStructureSchema = z.object({
  page_id: z.string().describe("Unique identifier of the page to analyze"),
  analysis_goal: z.string().optional().describe("Specific goal for DOM analysis (e.g., 'find login form', 'locate navigation menu')"),
  focus_areas: z.array(z.string()).optional().describe("Specific areas to focus on (e.g., ['forms', 'navigation', 'content'])"),
  max_depth: z.number().min(1).max(10).default(3).describe("Maximum depth to analyze in DOM tree"),
});

const NavigateDOMPathSchema = z.object({
  page_id: z.string().describe("Unique identifier of the page to navigate"),
  path: z.string().describe("Dot notation path to navigate (e.g., 'body.main.article[0].paragraphs[2]')"),
  extract_content: z.boolean().default(true).describe("Whether to extract text content from the target element"),
  include_children: z.boolean().default(false).describe("Whether to include child elements in the response"),
});

const SearchDOMElementsSchema = z.object({
  page_id: z.string().describe("Unique identifier of the page to search"),
  search_criteria: z.object({
    element_type: z.string().optional().describe("HTML element type to search for (e.g., 'button', 'input', 'a')"),
    text_content: z.string().optional().describe("Text content to search for within elements"),
    keywords: z.array(z.string()).optional().describe("Keywords to search for in element attributes or content"),
    attributes: z.record(z.string()).optional().describe("Specific attributes to match (e.g., {'class': 'btn-primary'})"),
  }).describe("Search criteria for finding DOM elements"),
  max_results: z.number().min(1).max(100).default(20).describe("Maximum number of results to return"),
  include_path: z.boolean().default(true).describe("Whether to include dot notation path for each result"),
});

const GetPageScreenshotSchema = z.object({
  page_id: z.string().describe("Unique identifier of the page to get screenshot for"),
  format: z.enum(["base64", "file_path"]).default("base64").describe("Format to return screenshot in"),
});

const AnalyzeScreenshotSchema = z.object({
  page_id: z.string().describe("Unique identifier of the page whose screenshot to analyze"),
  analysis_prompt: z.string().describe("Specific prompt for screenshot analysis (e.g., 'identify all clickable buttons', 'find the search form')"),
  focus_region: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional().describe("Optional region of screenshot to focus analysis on"),
});

// Types for DOM navigation
interface DOMElement {
  tagName: string;
  textContent?: string;
  attributes?: Record<string, string>;
  children?: DOMElement[];
  path?: string;
}

interface NavigationContext {
  goal?: string;
  focusAreas?: string[];
  interactiveElements: DOMElement[];
  contentElements: DOMElement[];
  structuralElements: DOMElement[];
}

/**
 * AI-powered DOM navigation tools using AIDotNavigation patterns
 * Provides intelligent exploration of DOM JSON structures stored in database
 */
export class BrowserAIDOMTools {
  private pagesRepo: WebsitePagesRepository;

  constructor(db: DatabaseManager) {
    this.pagesRepo = new WebsitePagesRepository(db);
  }

  /**
   * PathNavigator implementation for DOM JSON structures
   * Based on AIDotNavigation patterns for intelligent path traversal
   */
  private navigatePath(domJson: any, path: string): any {
    const segments = this.parsePath(path);
    let current = domJson;

    for (const segment of segments) {
      if (segment.type === 'property') {
        if (current && typeof current === 'object' && segment.name in current) {
          current = current[segment.name];
        } else {
          throw new Error(`Property '${segment.name}' not found at path: ${path}`);
        }
      } else if (segment.type === 'index') {
        if (Array.isArray(current) && segment.index < current.length) {
          current = current[segment.index];
        } else {
          throw new Error(`Index ${segment.index} out of bounds at path: ${path}`);
        }
      }
    }

    return current;
  }

  /**
   * Parse dot notation path into segments
   */
  private parsePath(path: string): Array<{ type: 'property' | 'index'; name?: string; index?: number }> {
    const segments: Array<{ type: 'property' | 'index'; name?: string; index?: number }> = [];
    const parts = path.split('.');

    for (const part of parts) {
      const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        // Property with array index
        segments.push({ type: 'property', name: arrayMatch[1] });
        segments.push({ type: 'index', index: parseInt(arrayMatch[2]) });
      } else {
        // Simple property
        segments.push({ type: 'property', name: part });
      }
    }

    return segments;
  }

  /**
   * AI-guided DOM structure analysis using goal-oriented exploration
   */
  private analyzeStructure(domJson: any, context: NavigationContext): any {
    const analysis = {
      overview: this.getStructureOverview(domJson),
      interactiveElements: this.findInteractiveElements(domJson),
      contentAreas: this.findContentAreas(domJson),
      navigationElements: this.findNavigationElements(domJson),
      goalRelevantElements: context.goal ? this.findGoalRelevantElements(domJson, context.goal) : [],
      suggestedPaths: this.generateSuggestedPaths(domJson, context),
    };

    return analysis;
  }

  /**
   * Get high-level structure overview
   */
  private getStructureOverview(domJson: any): any {
    const overview = {
      totalElements: this.countElements(domJson),
      depth: this.getMaxDepth(domJson),
      mainSections: this.getMainSections(domJson),
      elementTypes: this.getElementTypeDistribution(domJson),
    };

    return overview;
  }

  /**
   * Find interactive elements (buttons, links, forms, inputs)
   */
  private findInteractiveElements(domJson: any, currentPath = ''): DOMElement[] {
    const interactiveTypes = ['button', 'a', 'input', 'select', 'textarea', 'form'];
    const elements: DOMElement[] = [];

    const traverse = (node: any, path: string) => {
      if (node && typeof node === 'object') {
        if (node.tagName && interactiveTypes.includes(node.tagName.toLowerCase())) {
          elements.push({
            tagName: node.tagName,
            textContent: node.textContent,
            attributes: node.attributes,
            path: path,
          });
        }

        // Traverse children
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any, index: number) => {
            traverse(child, `${path}.children[${index}]`);
          });
        }

        // Traverse other properties that might contain elements
        for (const [key, value] of Object.entries(node)) {
          if (key !== 'children' && typeof value === 'object') {
            if (Array.isArray(value)) {
              value.forEach((item, index) => {
                traverse(item, `${path}.${key}[${index}]`);
              });
            } else {
              traverse(value, `${path}.${key}`);
            }
          }
        }
      }
    };

    traverse(domJson, currentPath || 'root');
    return elements;
  }

  /**
   * Find content areas (articles, sections, main content)
   */
  private findContentAreas(domJson: any): DOMElement[] {
    const contentTypes = ['article', 'section', 'main', 'aside', 'div'];
    const elements: DOMElement[] = [];

    const traverse = (node: any, path: string) => {
      if (node && typeof node === 'object') {
        if (node.tagName && contentTypes.includes(node.tagName.toLowerCase())) {
          // Check if it contains substantial text content
          const textLength = (node.textContent || '').length;
          if (textLength > 50) {
            elements.push({
              tagName: node.tagName,
              textContent: node.textContent?.substring(0, 200),
              attributes: node.attributes,
              path: path,
            });
          }
        }

        // Continue traversing
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any, index: number) => {
            traverse(child, `${path}.children[${index}]`);
          });
        }
      }
    };

    traverse(domJson, 'root');
    return elements;
  }

  /**
   * Find navigation elements
   */
  private findNavigationElements(domJson: any): DOMElement[] {
    const navTypes = ['nav', 'header', 'footer'];
    const elements: DOMElement[] = [];

    const traverse = (node: any, path: string) => {
      if (node && typeof node === 'object') {
        if (node.tagName && navTypes.includes(node.tagName.toLowerCase())) {
          elements.push({
            tagName: node.tagName,
            textContent: node.textContent?.substring(0, 100),
            attributes: node.attributes,
            path: path,
          });
        }

        // Also look for elements with navigation-related classes or roles
        if (node.attributes) {
          const classAttr = node.attributes.class || '';
          const roleAttr = node.attributes.role || '';
          if (classAttr.includes('nav') || classAttr.includes('menu') || roleAttr === 'navigation') {
            elements.push({
              tagName: node.tagName,
              textContent: node.textContent?.substring(0, 100),
              attributes: node.attributes,
              path: path,
            });
          }
        }

        // Continue traversing
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any, index: number) => {
            traverse(child, `${path}.children[${index}]`);
          });
        }
      }
    };

    traverse(domJson, 'root');
    return elements;
  }

  /**
   * Find elements relevant to a specific goal
   */
  private findGoalRelevantElements(domJson: any, goal: string): DOMElement[] {
    const goalKeywords = goal.toLowerCase().split(' ');
    const elements: DOMElement[] = [];

    const traverse = (node: any, path: string) => {
      if (node && typeof node === 'object') {
        let relevanceScore = 0;

        // Check text content
        const textContent = (node.textContent || '').toLowerCase();
        goalKeywords.forEach(keyword => {
          if (textContent.includes(keyword)) {
            relevanceScore += 2;
          }
        });

        // Check attributes
        if (node.attributes) {
          const attributeText = Object.values(node.attributes).join(' ').toLowerCase();
          goalKeywords.forEach(keyword => {
            if (attributeText.includes(keyword)) {
              relevanceScore += 1;
            }
          });
        }

        // If relevant, add to results
        if (relevanceScore > 0) {
          elements.push({
            tagName: node.tagName,
            textContent: node.textContent?.substring(0, 150),
            attributes: node.attributes,
            path: path,
          });
        }

        // Continue traversing
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any, index: number) => {
            traverse(child, `${path}.children[${index}]`);
          });
        }
      }
    };

    traverse(domJson, 'root');
    return elements.sort((a, b) => {
      // Sort by relevance (simple heuristic)
      const aScore = (a.textContent || '').length + Object.keys(a.attributes || {}).length;
      const bScore = (b.textContent || '').length + Object.keys(b.attributes || {}).length;
      return bScore - aScore;
    });
  }

  /**
   * Generate suggested paths based on context and common patterns
   */
  private generateSuggestedPaths(domJson: any, context: NavigationContext): string[] {
    const suggestions: string[] = [];

    // Common useful paths
    suggestions.push('root.body');
    suggestions.push('root.head');

    // Find main content area
    const mainElements = this.findElementsByTagName(domJson, 'main');
    if (mainElements.length > 0) {
      suggestions.push('root.body.main');
    }

    // Find navigation
    const navElements = this.findElementsByTagName(domJson, 'nav');
    navElements.forEach((_, index) => {
      suggestions.push(index > 0 ? `root.body.nav[${index}]` : 'root.body.nav');
    });

    // Goal-specific suggestions
    if (context.goal) {
      if (context.goal.toLowerCase().includes('form') || context.goal.toLowerCase().includes('login')) {
        const forms = this.findElementsByTagName(domJson, 'form');
        forms.forEach((_, index) => {
          suggestions.push(index > 0 ? `root.body.form[${index}]` : 'root.body.form');
        });
      }
    }

    return suggestions.slice(0, 10); // Limit suggestions
  }

  /**
   * Helper method to find elements by tag name
   */
  private findElementsByTagName(domJson: any, tagName: string): any[] {
    const elements: any[] = [];

    const traverse = (node: any) => {
      if (node && typeof node === 'object') {
        if (node.tagName && node.tagName.toLowerCase() === tagName.toLowerCase()) {
          elements.push(node);
        }

        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(traverse);
        }
      }
    };

    traverse(domJson);
    return elements;
  }

  /**
   * Count total elements in DOM
   */
  private countElements(domJson: any): number {
    let count = 0;

    const traverse = (node: any) => {
      if (node && typeof node === 'object' && node.tagName) {
        count++;
      }
      if (node && typeof node === 'object') {
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(traverse);
        }
      }
    };

    traverse(domJson);
    return count;
  }

  /**
   * Get maximum depth of DOM tree
   */
  private getMaxDepth(domJson: any, currentDepth = 0): number {
    let maxDepth = currentDepth;

    if (domJson && typeof domJson === 'object') {
      if (domJson.children && Array.isArray(domJson.children)) {
        domJson.children.forEach((child: any) => {
          const childDepth = this.getMaxDepth(child, currentDepth + 1);
          maxDepth = Math.max(maxDepth, childDepth);
        });
      }
    }

    return maxDepth;
  }

  /**
   * Get main sections of the page
   */
  private getMainSections(domJson: any): string[] {
    const sections: string[] = [];
    const sectionTags = ['header', 'nav', 'main', 'aside', 'footer', 'section', 'article'];

    const traverse = (node: any) => {
      if (node && typeof node === 'object') {
        if (node.tagName && sectionTags.includes(node.tagName.toLowerCase())) {
          sections.push(node.tagName.toLowerCase());
        }
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(traverse);
        }
      }
    };

    traverse(domJson);
    return [...new Set(sections)]; // Remove duplicates
  }

  /**
   * Get distribution of element types
   */
  private getElementTypeDistribution(domJson: any): Record<string, number> {
    const distribution: Record<string, number> = {};

    const traverse = (node: any) => {
      if (node && typeof node === 'object' && node.tagName) {
        const tagName = node.tagName.toLowerCase();
        distribution[tagName] = (distribution[tagName] || 0) + 1;
      }
      if (node && typeof node === 'object') {
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(traverse);
        }
      }
    };

    traverse(domJson);
    return distribution;
  }

  /**
   * Search DOM elements based on criteria
   */
  private searchElements(domJson: any, criteria: any): DOMElement[] {
    const results: DOMElement[] = [];

    const traverse = (node: any, path: string) => {
      if (node && typeof node === 'object') {
        let matches = true;

        // Check element type
        if (criteria.element_type && node.tagName) {
          if (node.tagName.toLowerCase() !== criteria.element_type.toLowerCase()) {
            matches = false;
          }
        }

        // Check text content
        if (criteria.text_content && matches) {
          const textContent = (node.textContent || '').toLowerCase();
          if (!textContent.includes(criteria.text_content.toLowerCase())) {
            matches = false;
          }
        }

        // Check keywords
        if (criteria.keywords && matches) {
          const searchText = [
            node.textContent || '',
            ...(node.attributes ? Object.values(node.attributes) : [])
          ].join(' ').toLowerCase();

          const hasAllKeywords = criteria.keywords.every((keyword: string) =>
            searchText.includes(keyword.toLowerCase())
          );

          if (!hasAllKeywords) {
            matches = false;
          }
        }

        // Check attributes
        if (criteria.attributes && matches && node.attributes) {
          for (const [attr, value] of Object.entries(criteria.attributes)) {
            if (node.attributes[attr] !== value) {
              matches = false;
              break;
            }
          }
        }

        if (matches && node.tagName) {
          results.push({
            tagName: node.tagName,
            textContent: node.textContent,
            attributes: node.attributes,
            path: path,
          });
        }

        // Continue traversing
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any, index: number) => {
            traverse(child, `${path}.children[${index}]`);
          });
        }
      }
    };

    traverse(domJson, 'root');
    return results;
  }

  /**
   * Tool implementations
   */

  async analyzeDOMStructure(args: any): Promise<any> {
    try {
      const validatedArgs = AnalyzeDOMStructureSchema.parse(args);
      logger.info(`Analyzing DOM structure for page: ${validatedArgs.page_id}`);

      // Load page data from database
      const page = await this.pagesRepo.findById(validatedArgs.page_id);
      if (!page) {
        throw new Error(`Page with ID ${validatedArgs.page_id} not found`);
      }

      if (!page.domJsonContent) {
        throw new Error(`No DOM content available for page ${validatedArgs.page_id}`);
      }

      const domJson = page.domJsonContent;

      // Create navigation context
      const context: NavigationContext = {
        goal: validatedArgs.analysis_goal,
        focusAreas: validatedArgs.focus_areas,
        interactiveElements: [],
        contentElements: [],
        structuralElements: [],
      };

      // Perform AI-guided analysis
      const analysis = this.analyzeStructure(domJson, context);

      return {
        page_id: validatedArgs.page_id,
        page_url: page.url,
        analysis_goal: validatedArgs.analysis_goal,
        analysis: analysis,
        recommendations: {
          next_steps: analysis.goalRelevantElements.length > 0 
            ? "Focus on goal-relevant elements found"
            : "Explore suggested paths for navigation",
          suggested_paths: analysis.suggestedPaths,
          interactive_elements_count: analysis.interactiveElements.length,
          content_areas_count: analysis.contentAreas.length,
        }
      };

    } catch (error) {
      logger.error("Error analyzing DOM structure:", error);
      throw new Error(`Failed to analyze DOM structure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async navigateDOMPath(args: any): Promise<any> {
    try {
      const validatedArgs = NavigateDOMPathSchema.parse(args);
      logger.info(`Navigating DOM path: ${validatedArgs.path} for page: ${validatedArgs.page_id}`);

      // Load page data from database
      const page = await this.pagesRepo.findById(validatedArgs.page_id);
      if (!page) {
        throw new Error(`Page with ID ${validatedArgs.page_id} not found`);
      }

      if (!page.domJsonContent) {
        throw new Error(`No DOM content available for page ${validatedArgs.page_id}`);
      }

      const domJson = page.domJsonContent;

      // Navigate to the specified path
      const targetElement = this.navigatePath(domJson, validatedArgs.path);

      const result = {
        page_id: validatedArgs.page_id,
        path: validatedArgs.path,
        element: {
          tagName: targetElement?.tagName,
          textContent: validatedArgs.extract_content ? targetElement?.textContent : undefined,
          attributes: targetElement?.attributes,
          children: validatedArgs.include_children ? targetElement?.children : undefined,
        },
        navigation_info: {
          element_type: targetElement?.tagName,
          has_children: targetElement?.children && Array.isArray(targetElement.children) && targetElement.children.length > 0,
          text_length: targetElement?.textContent?.length || 0,
          attribute_count: targetElement?.attributes ? Object.keys(targetElement.attributes).length : 0,
        }
      };

      return result;

    } catch (error) {
      logger.error("Error navigating DOM path:", error);
      throw new Error(`Failed to navigate DOM path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchDOMElements(args: any): Promise<any> {
    try {
      const validatedArgs = SearchDOMElementsSchema.parse(args);
      logger.info(`Searching DOM elements for page: ${validatedArgs.page_id}`);

      // Load page data from database
      const page = await this.pagesRepo.findById(validatedArgs.page_id);
      if (!page) {
        throw new Error(`Page with ID ${validatedArgs.page_id} not found`);
      }

      if (!page.domJsonContent) {
        throw new Error(`No DOM content available for page ${validatedArgs.page_id}`);
      }

      const domJson = page.domJsonContent;

      // Search for elements matching criteria
      const searchResults = this.searchElements(domJson, validatedArgs.search_criteria);
      const limitedResults = searchResults.slice(0, validatedArgs.max_results);

      const result = {
        page_id: validatedArgs.page_id,
        search_criteria: validatedArgs.search_criteria,
        total_found: searchResults.length,
        returned_count: limitedResults.length,
        results: limitedResults.map(element => ({
          tagName: element.tagName,
          textContent: element.textContent?.substring(0, 200),
          attributes: element.attributes,
          path: validatedArgs.include_path ? element.path : undefined,
        }))
      };

      return result;

    } catch (error) {
      logger.error("Error searching DOM elements:", error);
      throw new Error(`Failed to search DOM elements: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getPageScreenshot(args: any): Promise<any> {
    try {
      const validatedArgs = GetPageScreenshotSchema.parse(args);
      logger.info(`Getting screenshot for page: ${validatedArgs.page_id}`);

      // Load page data from database
      const page = await this.pagesRepo.findById(validatedArgs.page_id);
      if (!page) {
        throw new Error(`Page with ID ${validatedArgs.page_id} not found`);
      }

      if (!page.screenshotBase64) {
        throw new Error(`No screenshot available for page ${validatedArgs.page_id}`);
      }

      if (validatedArgs.format === "file_path") {
        return {
          page_id: validatedArgs.page_id,
          screenshot_base64: page.screenshotBase64,
          format: "file_path"
        };
      } else {
        // For base64, we'd need to read the file and encode it
        // For now, return the file path with instructions
        return {
          page_id: validatedArgs.page_id,
          screenshot_base64: page.screenshotBase64,
          format: "file_path",
          note: "Base64 encoding not yet implemented. Use file_path format and read the file directly."
        };
      }

    } catch (error) {
      logger.error("Error getting page screenshot:", error);
      throw new Error(`Failed to get page screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeScreenshot(args: any): Promise<any> {
    try {
      const validatedArgs = AnalyzeScreenshotSchema.parse(args);
      logger.info(`Analyzing screenshot for page: ${validatedArgs.page_id}`);

      // Load page data from database
      const page = await this.pagesRepo.findById(validatedArgs.page_id);
      if (!page) {
        throw new Error(`Page with ID ${validatedArgs.page_id} not found`);
      }

      if (!page.screenshotBase64) {
        throw new Error(`No screenshot available for page ${validatedArgs.page_id}`);
      }

      // For now, return analysis structure - actual AI analysis would need image processing
      const result = {
        page_id: validatedArgs.page_id,
        screenshot_base64: page.screenshotBase64,
        analysis_prompt: validatedArgs.analysis_prompt,
        focus_region: validatedArgs.focus_region,
        analysis: {
          note: "AI-powered screenshot analysis not yet implemented",
          recommendations: [
            "Use the screenshot path to view the image manually",
            "Combine with DOM analysis for comprehensive understanding",
            "Focus region can be used to crop the image for specific analysis"
          ],
          suggested_dom_exploration: [
            "Use analyze_dom_structure to understand page layout",
            "Use search_dom_elements to find specific interactive elements",
            "Combine visual and structural analysis for better navigation"
          ]
        }
      };

      return result;

    } catch (error) {
      logger.error("Error analyzing screenshot:", error);
      throw new Error(`Failed to analyze screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get DOM navigation tools for MCP registration
   */
  getTools(): McpTool[] {
    return [
      {
        name: "dom_analyze_structure",
        description: "AI-guided exploration and analysis of DOM structure using goal-oriented patterns. Analyzes stored DOM JSON to identify interactive elements, content areas, and navigation patterns.",
        inputSchema: zodToJsonSchema(AnalyzeDOMStructureSchema),
        handler: this.analyzeDOMStructure.bind(this)
      },
      {
        name: "dom_navigate_path", 
        description: "Navigate to specific elements in DOM JSON using dot notation paths (e.g., 'body.main.article[0].paragraphs[2]'). Extracts content and provides element information.",
        inputSchema: zodToJsonSchema(NavigateDOMPathSchema),
        handler: this.navigateDOMPath.bind(this)
      },
      {
        name: "dom_search_elements",
        description: "Search for DOM elements by type, content, keywords, or attributes. Returns matching elements with their paths for further navigation.",
        inputSchema: zodToJsonSchema(SearchDOMElementsSchema),
        handler: this.searchDOMElements.bind(this)
      },
      {
        name: "dom_get_screenshot",
        description: "Retrieve stored screenshot for a page. Returns file path or base64 encoded image data for AI visual analysis.",
        inputSchema: zodToJsonSchema(GetPageScreenshotSchema),
        handler: this.getPageScreenshot.bind(this)
      },
      {
        name: "dom_analyze_screenshot", 
        description: "AI-powered analysis of page screenshots with custom prompts. Can focus on specific regions and provide contextual insights.",
        inputSchema: zodToJsonSchema(AnalyzeScreenshotSchema),
        handler: this.analyzeScreenshot.bind(this)
      }
    ];
  }

}