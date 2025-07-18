/**
 * MCP Tools for project analysis and file operations
 * Exposes analysis functionality through the MCP protocol for agent use
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpTool } from '../schemas/tools/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { createHash } from 'crypto';
import type { KnowledgeGraphService } from '../services/KnowledgeGraphService.js';
import { LezerParserService } from '../services/LezerParserService.js';
import { FileOperationsService, type ListFilesOptions, type FindFilesOptions, type ReplaceOptions } from '../services/FileOperationsService.js';
import { FoundationCacheService } from '../services/FoundationCacheService.js';
import { TreeSummaryService, type DirectoryNode } from '../services/TreeSummaryService.js';
import { AnalysisResponseSchema, createSuccessResponse, createErrorResponse, type AnalysisResponse, ProjectStructureInfoSchema, ProjectSummarySchema, FileSymbolsSchema, type ProjectStructureInfo, type ProjectSummary, type FileSymbols } from '../schemas/toolResponses.js';
import { PatternMatcher } from '../utils/patternMatcher.js';
import { Logger } from '../utils/logger.js';

// Import centralized request schemas
import {
  AnalyzeProjectStructureSchema,
  GenerateProjectSummarySchema,
  AnalyzeFileSymbolsSchema,
  ListFilesSchema,
  FindFilesSchema,
  EasyReplaceSchema,
  CleanupOrphanedProjectsSchema,
  // Import individual response schemas
  AnalyzeProjectStructureResponseSchema,
  GenerateProjectSummaryResponseSchema,
  AnalyzeFileSymbolsResponseSchema,
  ListFilesResponseSchema,
  FindFilesResponseSchema,
  EasyReplaceResponseSchema,
  CleanupOrphanedProjectsResponseSchema,
  // Import response types
  type AnalyzeProjectStructureResponse,
  type GenerateProjectSummaryResponse,
  type AnalyzeFileSymbolsResponse,
  type ListFilesResponse,
  type FindFilesResponse,
  type EasyReplaceResponse,
  type CleanupOrphanedProjectsResponse
} from '../schemas/tools/analysis.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

// Union type for all analysis tool responses
type AnalysisToolResponse = 
  | AnalyzeProjectStructureResponse
  | GenerateProjectSummaryResponse
  | AnalyzeFileSymbolsResponse
  | ListFilesResponse
  | FindFilesResponse
  | EasyReplaceResponse
  | CleanupOrphanedProjectsResponse;

// Promisified fs operations for legacy compatibility
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const lstat = promisify(fs.lstat);
const access = promisify(fs.access);

export class AnalysisMcpTools {
  private fileOpsService: FileOperationsService;
  private treeSummaryService: TreeSummaryService;
  private lezerParserService: LezerParserService;
  private logger: Logger;

  constructor(
    private knowledgeGraphService: KnowledgeGraphService,
    private repositoryPath: string,
    private foundationCache?: FoundationCacheService
  ) {
    this.fileOpsService = new FileOperationsService();
    this.treeSummaryService = new TreeSummaryService(foundationCache);
    this.lezerParserService = new LezerParserService();
    this.logger = new Logger('analysis-mcp-tools');
  }

  /**
   * Get all analysis-related MCP tools
   */
  getTools(): McpTool[] {
    return [
      {
        name: 'analyze_project_structure',
        description: 'Analyze project structure and generate a comprehensive overview',
        inputSchema: zodToJsonSchema(AnalyzeProjectStructureSchema),
        outputSchema: zodToJsonSchema(AnalyzeProjectStructureResponseSchema),
        handler: this.analyzeProjectStructure.bind(this)
      },
      {
        name: 'generate_project_summary',
        description: 'Generate AI-optimized project overview and analysis',
        inputSchema: zodToJsonSchema(GenerateProjectSummarySchema),
        outputSchema: zodToJsonSchema(GenerateProjectSummaryResponseSchema),
        handler: this.generateProjectSummary.bind(this)
      },
      {
        name: 'analyze_file_symbols',
        description: 'Extract and analyze symbols (functions, classes, etc.) from code files',
        inputSchema: zodToJsonSchema(AnalyzeFileSymbolsSchema),
        outputSchema: zodToJsonSchema(AnalyzeFileSymbolsResponseSchema),
        handler: this.analyzeFileSymbols.bind(this)
      },
      {
        name: 'list_files',
        description: 'List files in a directory with smart ignore patterns',
        inputSchema: zodToJsonSchema(ListFilesSchema),
        outputSchema: zodToJsonSchema(ListFilesResponseSchema),
        handler: this.listFiles.bind(this)
      },
      {
        name: 'find_files',
        description: 'Search for files by pattern with optional content matching',
        inputSchema: zodToJsonSchema(FindFilesSchema),
        outputSchema: zodToJsonSchema(FindFilesResponseSchema),
        handler: this.findFiles.bind(this)
      },
      {
        name: 'easy_replace',
        description: 'Fuzzy string replacement in files with smart matching',
        inputSchema: zodToJsonSchema(EasyReplaceSchema),
        outputSchema: zodToJsonSchema(EasyReplaceResponseSchema),
        handler: this.easyReplace.bind(this)
      },
      {
        name: 'cleanup_orphaned_projects',
        description: 'Clean up orphaned or unused project directories',
        inputSchema: zodToJsonSchema(CleanupOrphanedProjectsSchema),
        outputSchema: zodToJsonSchema(CleanupOrphanedProjectsResponseSchema),
        handler: this.cleanupOrphanedProjects.bind(this)
      }
    ];
  }


  private async analyzeProjectStructure(args: any): Promise<AnalyzeProjectStructureResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      projectPath: args.projectPath || args.project_path,
      includePatterns: args.includePatterns || args.include_patterns,
      excludePatterns: args.excludePatterns || args.exclude_patterns,
      maxDepth: args.maxDepth || args.max_depth,
      generateSummary: args.generateSummary || args.generate_summary
    };
    
    const params = AnalyzeProjectStructureSchema.parse({
      project_path: normalizedArgs.projectPath,
      include_patterns: normalizedArgs.includePatterns,
      exclude_patterns: normalizedArgs.excludePatterns,
      max_depth: normalizedArgs.maxDepth,
      generate_summary: normalizedArgs.generateSummary
    });
    
    const projectPath = path.resolve(params.project_path || this.repositoryPath);
    
    // Try to get cached analysis first if foundation cache is available
    if (this.foundationCache) {
      const cacheKey = `structure_${projectPath}_${params.max_depth}_${JSON.stringify(params.include_patterns)}_${JSON.stringify(params.exclude_patterns)}`;
      const cachedStructure = await this.foundationCache.getCachedAnalysis(
        projectPath,
        cacheKey,
        'project_structure'
      );
      
      if (cachedStructure) {
        const executionTime = Date.now() - startTime;
        const stats = this.calculateProjectStats(cachedStructure.structure);
        
        return createSuccessResponse(
          `Successfully analyzed ${stats.totalFiles} files and ${stats.totalDirectories} directories (cached). Full structure written to .treesummary/structure.txt - search this file for specific details.`,
          {
            stats,
            summary_generated: params.generate_summary,
            summary_path: params.generate_summary ? path.join(projectPath, '.treesummary', 'structure.txt') : null,
            cached: true
          },
          executionTime
        ) as AnalyzeProjectStructureResponse;
      }
    }
    
    const combinedExcludePatterns = await this.getCombinedExcludePatterns(projectPath, params.exclude_patterns);
    const structure = await this.buildProjectStructure(
      projectPath, 
      params.max_depth, 
      combinedExcludePatterns,
      0, // currentDepth
      params.include_patterns // Pass include patterns
    );
    
    // Cache the result if foundation cache is available
    if (this.foundationCache) {
      const cacheKey = `structure_${projectPath}_${params.max_depth}_${JSON.stringify(params.include_patterns)}_${JSON.stringify(params.exclude_patterns)}`;
      await this.foundationCache.cacheAnalysisResult(
        projectPath,
        cacheKey,
        'project_structure',
        { structure, params }
      );
    }
    
    if (params.generate_summary) {
      // Use TreeSummaryService for better integration
      await this.treeSummaryService.updateProjectMetadata(projectPath);
      
      // Write tree summary inside the .treesummary directory structure
      const summaryPath = path.join(projectPath, '.treesummary', 'structure.txt');
      const summaryContent = this.generateTreeSummary(structure);
      await writeFile(summaryPath, summaryContent, 'utf8');
      
      // Generate file analyses for all source files
      await this.generateFileAnalyses(projectPath, structure as DirectoryNode);
    }

    const executionTime = Date.now() - startTime;
    const stats = this.calculateProjectStats(structure);
    
    return createSuccessResponse(
      `Successfully analyzed ${stats.totalFiles} files and ${stats.totalDirectories} directories. Full structure written to .treesummary/structure.txt - search this file for specific details.`,
      {
        stats,
        summary_generated: params.generate_summary,
        summary_path: params.generate_summary ? path.join(projectPath, '.treesummary', 'structure.txt') : null,
        cached: false
      },
      executionTime
    ) as AnalyzeProjectStructureResponse;
  }

  private async generateProjectSummary(args: any): Promise<GenerateProjectSummaryResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      projectPath: args.projectPath || args.project_path,
      includeReadme: args.includeReadme || args.include_readme,
      includePackageInfo: args.includePackageInfo || args.include_package_info,
      includeGitInfo: args.includeGitInfo || args.include_git_info,
      outputPath: args.outputPath || args.output_path
    };
    
    const params = GenerateProjectSummarySchema.parse({
      project_path: normalizedArgs.projectPath,
      include_readme: normalizedArgs.includeReadme,
      include_package_info: normalizedArgs.includePackageInfo,
      include_git_info: normalizedArgs.includeGitInfo,
      output_path: normalizedArgs.outputPath
    });
    
    const projectPath = path.resolve(params.project_path || this.repositoryPath);
    
    // Try to get cached summary first if foundation cache is available
    if (this.foundationCache) {
      const cacheKey = `summary_${projectPath}_${JSON.stringify(params)}`;
      const cachedSummary = await this.foundationCache.getCachedAnalysis(
        projectPath,
        cacheKey,
        'project_summary'
      );
      
      if (cachedSummary) {
        const executionTime = Date.now() - startTime;
        
        return createSuccessResponse(
          `Successfully retrieved cached project summary for ${projectPath}`,
          {
            summary: cachedSummary,
            cached: true
          },
          executionTime
        ) as GenerateProjectSummaryResponse;
      }
    }
    
    const projectName = path.basename(projectPath);
    
    // Use TreeSummaryService for enhanced analysis
    const overview = await this.treeSummaryService.getProjectOverview(projectPath);
    
    // Build basic structure if not available from overview
    let structure: DirectoryNode | ProjectStructureInfo = overview.structure;
    if (!structure) {
      const defaultExcludePatterns = ['node_modules/**', '.git/**'];
      const combinedExcludePatterns = await this.getCombinedExcludePatterns(projectPath, defaultExcludePatterns);
      structure = await this.buildProjectStructure(projectPath, 5, combinedExcludePatterns, 0, ['**/*']);
    }
    
    // Calculate stats
    const stats = this.calculateProjectStats(structure);
    
    // Get package info
    let dependencies: Record<string, string> = {};
    let framework = 'Unknown';
    let language = 'Unknown';
    
    if (params.include_package_info) {
      const packageInfo = await this.getPackageInfo(projectPath);
      dependencies = packageInfo.dependencies;
      framework = packageInfo.framework;
      language = packageInfo.language;
    }

    // Get git info
    let gitInfo;
    if (params.include_git_info) {
      gitInfo = await this.getGitInfo(projectPath);
    }

    // Get description from README
    let description;
    if (params.include_readme) {
      description = await this.getReadmeDescription(projectPath);
    }

    const summary: ProjectSummary = {
      name: projectName,
      path: projectPath,
      description,
      framework,
      language,
      dependencies,
      structure,
      gitInfo,
      stats
    };
    
    // Cache the result if foundation cache is available
    if (this.foundationCache) {
      const cacheKey = `summary_${projectPath}_${JSON.stringify(params)}`;
      await this.foundationCache.cacheAnalysisResult(
        projectPath,
        cacheKey,
        'project_summary',
        summary
      );
    }

    // Save summary if output path provided
    if (params.output_path) {
      await writeFile(params.output_path, JSON.stringify(summary, null, 2), 'utf8');
    }

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully generated project summary for ${projectName}`,
      {
        summary,
        cached: false
      },
      executionTime
    ) as GenerateProjectSummaryResponse;
  }

  private async analyzeFileSymbols(args: any): Promise<AnalyzeFileSymbolsResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      filePath: args.filePath || args.file_path,
      symbolTypes: args.symbolTypes || args.symbol_types
    };
    
    const params = AnalyzeFileSymbolsSchema.parse({
      file_path: normalizedArgs.filePath,
      symbol_types: normalizedArgs.symbolTypes
    });
    
    const filePath = path.resolve(params.file_path);
    
    // Use LezerParserService for robust symbol extraction
    const content = await readFile(filePath, 'utf8');
    const parseResult = await this.lezerParserService.parseFile(filePath, content);
    
    if (!parseResult.parseSuccess) {
      // Fallback to regex-based parsing for unsupported files
      const content = await readFile(filePath, 'utf8');
      const symbols = this.extractSymbolsFallback(content, params.symbol_types);
      
      const executionTime = Date.now() - startTime;
      
      return createSuccessResponse(
        `Successfully analyzed symbols in ${filePath} (fallback parsing)`,
        {
          symbols: {
            file_path: filePath,
            symbols
          }
        },
        executionTime
      ) as AnalyzeFileSymbolsResponse;
    }

    // Filter symbols by requested types
    const requestedTypes = new Set(params.symbol_types);
    const typeMapping: Record<string, string> = {
      'function': 'functions',
      'class': 'classes', 
      'interface': 'interfaces',
      'type': 'types',
      'variable': 'variables',
      'method': 'functions' // Treat methods as functions
    };
    
    const filteredSymbols = parseResult.symbols.filter(symbol => {
      const mappedType = typeMapping[symbol.type] || symbol.type;
      return requestedTypes.has(mappedType as any);
    });

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully analyzed symbols in ${filePath} using Tree-sitter (${parseResult.language})`,
      {
        symbols: {
          file_path: filePath,
          symbols: filteredSymbols
        }
      },
      executionTime
    ) as AnalyzeFileSymbolsResponse;
  }

  /**
   * Generate file analyses for all source files in a project structure
   */
  private async generateFileAnalyses(projectPath: string, structure: DirectoryNode): Promise<void> {
    // Get supported extensions from LezerParserService
    const supportedExtensions = new Set(this.lezerParserService.getSupportedExtensions());
    
    const processNode = async (node: DirectoryNode, currentPath: string): Promise<void> => {
      for (const child of node.children || []) {
        const childPath = path.join(currentPath, child.name);
        
        if (child.type === 'file') {
          const ext = path.extname(child.name).toLowerCase();
          if (supportedExtensions.has(ext)) {
            try {
              // Use LezerParserService for comprehensive analysis
              const analysis = await this.lezerParserService.analyzeFile(childPath);
              
              if (analysis) {
                // Store the analysis using TreeSummaryService
                await this.treeSummaryService.updateFileAnalysis(childPath, analysis);
              } else {
                // Fallback to regex-based analysis for unsupported files
                const fallbackAnalysis = await this.generateFallbackAnalysis(childPath, ext);
                if (fallbackAnalysis) {
                  await this.treeSummaryService.updateFileAnalysis(childPath, fallbackAnalysis);
                }
              }
            } catch (error) {
              // Skip files that can't be read or analyzed
              console.warn(`Failed to analyze ${childPath}:`, error);
            }
          }
        } else if (child.type === 'directory') {
          await processNode(child, childPath);
        }
      }
    };
    
    await processNode(structure, projectPath);
  }

  /**
   * Extract imports from file content based on file extension
   */
  private extractImports(content: string, extension: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (extension === '.ts' || extension === '.js' || extension === '.tsx' || extension === '.jsx') {
        // TypeScript/JavaScript imports
        const importMatch = trimmed.match(/^import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/);
        if (importMatch) {
          imports.push(importMatch[1]);
        }
        
        // CommonJS requires
        const requireMatch = trimmed.match(/require\(['"]([^'"]+)['"]\)/);
        if (requireMatch) {
          imports.push(requireMatch[1]);
        }
      } else if (extension === '.py') {
        // Python imports
        const importMatch = trimmed.match(/^(?:import\s+([^\s]+)|from\s+([^\s]+)\s+import)/);
        if (importMatch) {
          imports.push(importMatch[1] || importMatch[2]);
        }
      }
    }
    
    return Array.from(new Set(imports)); // Remove duplicates
  }

  /**
   * Extract exports from file content based on file extension
   */
  private extractExports(content: string, extension: string): string[] {
    const exports: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (extension === '.ts' || extension === '.js' || extension === '.tsx' || extension === '.jsx') {
        // Named exports
        const namedExportMatch = trimmed.match(/^export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
        if (namedExportMatch) {
          exports.push(namedExportMatch[1]);
        }
        
        // Export lists
        const exportListMatch = trimmed.match(/^export\s+\{([^}]+)\}/);
        if (exportListMatch) {
          const names = exportListMatch[1].split(',').map(name => name.trim().split(/\s+as\s+/)[0]);
          exports.push(...names);
        }
        
        // Default exports (use filename)
        if (trimmed.match(/^export\s+default/)) {
          const filename = path.basename(content, extension);
          exports.push(filename);
        }
      }
    }
    
    return Array.from(new Set(exports)); // Remove duplicates
  }

  /**
   * Get programming language from file extension
   */
  private getLanguageFromExtension(extension: string): string {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript', 
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin'
    };
    
    return languageMap[extension.toLowerCase()] || 'unknown';
  }

  private async listFiles(args: any): Promise<ListFilesResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      directory: args.directory,
      recursive: args.recursive,
      includePatterns: args.includePatterns || args.include_patterns,
      excludePatterns: args.excludePatterns || args.exclude_patterns
    };
    
    const params = ListFilesSchema.parse({
      directory: normalizedArgs.directory,
      recursive: normalizedArgs.recursive,
      include_patterns: normalizedArgs.includePatterns,
      exclude_patterns: normalizedArgs.excludePatterns
    });
    
    const dirPath = path.resolve(params.directory);
    const options: ListFilesOptions = {
      recursive: params.recursive,
      ignorePatterns: params.exclude_patterns,
      includeHidden: false
    };

    const fileInfos = await this.fileOpsService.listFiles(dirPath, options);
    
    // Convert FileInfo[] to simple string paths for compatibility
    const files = fileInfos.map(info => info.path);

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully listed ${files.length} files in ${dirPath}`,
      {
        files,
        analysis_data: {
          fileInfos,
          count: files.length,
          directory: dirPath
        }
      },
      executionTime
    ) as ListFilesResponse;
  }

  private async findFiles(args: any): Promise<FindFilesResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      pattern: args.pattern,
      directory: args.directory,
      caseSensitive: args.caseSensitive || args.case_sensitive,
      includeContent: args.includeContent || args.include_content
    };
    
    const params = FindFilesSchema.parse({
      pattern: normalizedArgs.pattern,
      directory: normalizedArgs.directory,
      case_sensitive: normalizedArgs.caseSensitive,
      include_content: normalizedArgs.includeContent
    });
    
    const searchDir = path.resolve(params.directory);
    const options: FindFilesOptions = {
      directory: searchDir,
      caseSensitive: params.case_sensitive,
      includeContent: params.include_content
    };

    const matches = await this.fileOpsService.findFiles(params.pattern, options);
    
    const results = [];
    for (const filePath of matches) {
      const result: any = { path: filePath };
      
      if (params.include_content) {
        try {
          const content = await readFile(filePath, 'utf8');
          result.preview = content.substring(0, 50) + (content.length > 50 ? '...' : '');
        } catch {
          result.preview = '[Could not read file]';
        }
      }
      
      results.push(result);
    }

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully found ${matches.length} files matching pattern '${params.pattern}'`,
      {
        files: matches,
        analysis_data: {
          matches: results,
          count: results.length,
          pattern: params.pattern
        }
      },
      executionTime
    ) as FindFilesResponse;
  }

  private async easyReplace(args: any): Promise<EasyReplaceResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      filePath: args.filePath || args.file_path,
      oldText: args.oldText || args.old_text,
      newText: args.newText || args.new_text,
      fuzzyMatch: args.fuzzyMatch || args.fuzzy_match,
      backup: args.backup
    };
    
    const params = EasyReplaceSchema.parse({
      file_path: normalizedArgs.filePath,
      old_text: normalizedArgs.oldText,
      new_text: normalizedArgs.newText,
      fuzzy_match: normalizedArgs.fuzzyMatch,
      backup: normalizedArgs.backup
    });
    
    // First copy the file to use in replacement options
    const filePath = path.resolve(params.file_path);
    
    // Use our new FileOperationsService for replacement
    const options: ReplaceOptions = {
      fuzzyMatch: params.fuzzy_match,
      preserveIndentation: true,
      createBackup: params.backup,
      dryRun: false
    };

    // For single file replacement, we need to implement this differently
    // since easyReplace in the service works across multiple files
    const content = await readFile(filePath, 'utf8');
    
    // Create backup if requested
    if (params.backup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await writeFile(backupPath, content, 'utf8');
    }

    let newContent: string;
    if (params.fuzzy_match) {
      // Use the fuzzy replace logic
      newContent = this.fuzzyReplace(content, params.old_text, params.new_text);
    } else {
      // Exact replacement
      newContent = content.replace(new RegExp(this.escapeRegExp(params.old_text), 'g'), params.new_text);
    }

    const replacementCount = (content.match(new RegExp(this.escapeRegExp(params.old_text), 'g')) || []).length;
    
    if (replacementCount > 0) {
      await writeFile(filePath, newContent, 'utf8');
    }

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully replaced ${replacementCount} occurrences in ${filePath}`,
      {
        replaced_count: replacementCount,
        analysis_data: {
          file_path: filePath,
          backup_created: params.backup
        }
      },
      executionTime
    ) as EasyReplaceResponse;
  }

  private async cleanupOrphanedProjects(args: any): Promise<CleanupOrphanedProjectsResponse> {
    const startTime = Date.now();
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      basePath: args.basePath || args.base_path,
      daysThreshold: args.daysThreshold || args.days_threshold,
      dryRun: args.dryRun || args.dry_run
    };
    
    const params = CleanupOrphanedProjectsSchema.parse({
      base_path: normalizedArgs.basePath,
      days_threshold: normalizedArgs.daysThreshold,
      dry_run: normalizedArgs.dryRun
    });
    
    const basePath = path.resolve(params.base_path);
    const threshold = new Date(Date.now() - params.days_threshold * 24 * 60 * 60 * 1000);
    
    const orphanedProjects = await this.findOrphanedProjects(basePath, threshold);
    
    if (!params.dry_run) {
      // Actually delete the projects (implement carefully)
      for (const project of orphanedProjects) {
        // This would need proper implementation with recursive deletion
        console.warn('Actual deletion not implemented for safety');
      }
    }

    const executionTime = Date.now() - startTime;
    
    return createSuccessResponse(
      `Successfully identified ${orphanedProjects.length} orphaned projects`,
      {
        cleanup_results: {
          orphaned_projects: orphanedProjects,
          count: orphanedProjects.length,
          dry_run: params.dry_run,
          threshold_date: threshold.toISOString()
        }
      },
      executionTime
    ) as CleanupOrphanedProjectsResponse;
  }

  // Helper methods
  private async buildProjectStructure(
    dirPath: string, 
    maxDepth: number, 
    excludePatterns: string[], 
    currentDepth = 0,
    includePatterns: string[] = ['**/*'],
    rootPath?: string
  ): Promise<ProjectStructureInfo> {
    // Use rootPath to track the project root for relative path calculations
    const projectRoot = rootPath || dirPath;
    
    // Log progress for debugging
    if (currentDepth === 0) {
      this.logger.debug(`Starting project structure analysis at: ${dirPath}`);
      this.logger.debug(`Include patterns: ${JSON.stringify(includePatterns)}`);
      this.logger.debug(`Exclude patterns: ${JSON.stringify(excludePatterns)}`);
    }
    
    if (currentDepth >= maxDepth) {
      return {
        path: dirPath,
        name: path.basename(dirPath),
        type: 'directory',
        children: []
      };
    }

    try {
      // Use lstat to detect symbolic links (stat follows symlinks)
      const stats = await lstat(dirPath);
      
      // Check for symbolic links to prevent infinite loops
      if (stats.isSymbolicLink()) {
        this.logger.debug(`Skipping symbolic link: ${dirPath}`);
        return {
          path: dirPath,
          name: path.basename(dirPath),
          type: 'file',
          size: 0,
          extension: '',
          lastModified: stats.mtime
        };
      }
      
      const isDirectory = stats.isDirectory();

      if (!isDirectory) {
        return {
          path: dirPath,
          name: path.basename(dirPath),
          type: 'file',
          size: stats.size,
          extension: path.extname(dirPath),
          lastModified: stats.mtime
        };
      }

      const entries = await readdir(dirPath);
      const children: ProjectStructureInfo[] = [];

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const relativePath = path.relative(projectRoot, entryPath);
        
        // Check if should be excluded first (excludes take precedence)
        if (this.shouldExclude(relativePath, excludePatterns, projectRoot)) {
          this.logger.debug(`Excluded by pattern: ${relativePath}`);
          continue;
        }
        
        // Check if should be included
        if (!this.shouldInclude(relativePath, includePatterns, projectRoot)) {
          this.logger.debug(`Not included by pattern: ${relativePath}`);
          continue;
        }

        const child = await this.buildProjectStructure(
          entryPath, 
          maxDepth, 
          excludePatterns, 
          currentDepth + 1,
          includePatterns,
          projectRoot
        );
        children.push(child);
      }

      return {
        path: dirPath,
        name: path.basename(dirPath),
        type: 'directory',
        children,
        lastModified: stats.mtime
      };
    } catch (error) {
      this.logger.warn(`Error reading directory ${dirPath}: ${error}`);
      return {
        path: dirPath,
        name: path.basename(dirPath),
        type: 'directory',
        children: []
      };
    }
  }

  /**
   * Read and parse .claudeignore file from a directory
   */
  private async readClaudeIgnore(directory: string): Promise<string[]> {
    try {
      const claudeIgnorePath = path.join(directory, '.claudeignore');
      const content = await readFile(claudeIgnorePath, 'utf8');
      
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
        .map(pattern => {
          // Convert .claudeignore patterns to glob patterns for AnalysisMcpTools
          if (pattern.endsWith('/')) {
            // Directory patterns
            return [pattern.slice(0, -1), pattern + '**'];
          } else if (pattern.includes('*')) {
            // Already a glob pattern
            return [pattern];
          } else {
            // File or directory patterns - add both exact and recursive versions
            return [pattern, pattern + '/**'];
          }
        })
        .flat();
    } catch (error) {
      // .claudeignore file doesn't exist or can't be read, return empty array
      return [];
    }
  }

  /**
   * Get combined exclude patterns including .claudeignore
   */
  private async getCombinedExcludePatterns(projectPath: string, excludePatterns: string[]): Promise<string[]> {
    const claudeIgnorePatterns = await this.readClaudeIgnore(projectPath);
    return [...excludePatterns, ...claudeIgnorePatterns];
  }

  private shouldExclude(relativePath: string, excludePatterns: string[], projectRoot?: string): boolean {
    // Use PatternMatcher for proper glob pattern matching
    for (const pattern of excludePatterns) {
      const result = PatternMatcher.matchesPattern(relativePath, pattern);
      if (result.matches) {
        return true;
      }
    }
    return false;
  }
  
  private shouldInclude(relativePath: string, includePatterns: string[], projectRoot?: string): boolean {
    // If no include patterns specified, include everything by default
    if (includePatterns.length === 0 || (includePatterns.length === 1 && includePatterns[0] === '**/*')) {
      return true;
    }
    
    // Use PatternMatcher for proper glob pattern matching
    for (const pattern of includePatterns) {
      const result = PatternMatcher.matchesPattern(relativePath, pattern);
      if (result.matches) {
        return true;
      }
    }
    return false;
  }

  private generateTreeSummary(structure: ProjectStructureInfo): string {
    const lines: string[] = [];
    
    const traverse = (node: ProjectStructureInfo, indent = 0) => {
      const prefix = '  '.repeat(indent);
      const icon = node.type === 'directory' ? '📁' : '📄';
      lines.push(`${prefix}${icon} ${node.name}`);
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child, indent + 1);
        }
      }
    };

    traverse(structure);
    return lines.join('\n');
  }

  private calculateProjectStats(structure: ProjectStructureInfo): { totalFiles: number; totalDirectories: number; totalSize: number; fileTypes: Record<string, number> } {
    let totalFiles = 0;
    let totalDirectories = 0;
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};

    const traverse = (node: ProjectStructureInfo) => {
      if (node.type === 'file') {
        totalFiles++;
        totalSize += node.size || 0;
        const ext = node.extension || 'no-extension';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      } else {
        totalDirectories++;
        if (node.children) {
          for (const child of node.children) {
            traverse(child);
          }
        }
      }
    };

    traverse(structure);
    return { totalFiles, totalDirectories, totalSize, fileTypes };
  }

  private async getPackageInfo(projectPath: string): Promise<{ dependencies: Record<string, string>; framework: string; language: string }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const requirementsTxtPath = path.join(projectPath, 'requirements.txt');
    
    try {
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
        return {
          dependencies: { ...packageJson.dependencies, ...packageJson.devDependencies },
          framework: this.detectFramework(packageJson),
          language: 'JavaScript/TypeScript'
        };
      } else if (await this.fileExists(requirementsTxtPath)) {
        const requirements = await readFile(requirementsTxtPath, 'utf8');
        const dependencies: Record<string, string> = {};
        requirements.split('\n').forEach(line => {
          const [pkg, version] = line.trim().split('==');
          if (pkg) dependencies[pkg] = version || 'latest';
        });
        return {
          dependencies,
          framework: 'Python',
          language: 'Python'
        };
      }
    } catch (error) {
      // Ignore errors
    }

    return { dependencies: {}, framework: 'Unknown', language: 'Unknown' };
  }

  private detectFramework(packageJson: any): string {
    if (packageJson.dependencies?.react) return 'React';
    if (packageJson.dependencies?.vue) return 'Vue';
    if (packageJson.dependencies?.angular) return 'Angular';
    if (packageJson.dependencies?.svelte) return 'Svelte';
    if (packageJson.dependencies?.express) return 'Express';
    if (packageJson.dependencies?.next) return 'Next.js';
    return 'Node.js';
  }

  private async getGitInfo(projectPath: string): Promise<{ branch?: string; lastCommit?: string; remotes?: string[] } | undefined> {
    // Simple git info extraction - would need proper git library for production
    try {
      const gitPath = path.join(projectPath, '.git');
      if (await this.fileExists(gitPath)) {
        return {
          branch: 'main', // Placeholder
          lastCommit: 'abc123', // Placeholder
          remotes: ['origin'] // Placeholder
        };
      }
    } catch (error) {
      // Ignore errors
    }
    return undefined;
  }

  private async getReadmeDescription(projectPath: string): Promise<string | undefined> {
    const readmePaths = ['README.md', 'README.txt', 'readme.md', 'readme.txt'];
    
    for (const readmePath of readmePaths) {
      try {
        const fullPath = path.join(projectPath, readmePath);
        if (await this.fileExists(fullPath)) {
          const content = await readFile(fullPath, 'utf8');
          // Extract first paragraph or line as description
          const lines = content.split('\n').filter(line => line.trim());
          return lines[0]?.replace(/^#\s*/, '') || undefined;
        }
      } catch (error) {
        // Continue to next file
      }
    }
    return undefined;
  }

  /**
   * Generate fallback analysis for files that TreeSitter can't parse
   */
  private async generateFallbackAnalysis(filePath: string, extension: string): Promise<any> {
    try {
      const content = await readFile(filePath, 'utf8');
      const stats = await fs.promises.stat(filePath);
      const hash = createHash('sha256').update(content).digest('hex');
      
      // Extract symbols using regex fallback
      const symbols = this.extractSymbolsFallback(content, ['functions', 'classes', 'interfaces', 'types', 'variables']);
      
      // Extract imports and exports using existing regex methods
      const imports = this.extractImports(content, extension);
      const exports = this.extractExports(content, extension);
      
      // Determine language
      const language = this.getLanguageFromExtension(extension);
      
      return {
        filePath,
        hash,
        lastModified: stats.mtime,
        symbols: symbols.functions.concat(symbols.classes, symbols.interfaces, symbols.types, symbols.variables)
          .map(symbol => ({
            name: symbol.name,
            type: symbol.type || 'function',
            line: symbol.line || 1,
            column: symbol.column || 1,
            isExported: exports.includes(symbol.name)
          })),
        imports,
        exports,
        size: stats.size,
        language
      };
    } catch (error) {
      console.error(`Failed to generate fallback analysis for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Fallback regex-based symbol extraction for unsupported files
   */
  private extractSymbolsFallback(content: string, symbolTypes: string[]): any {
    const symbols: any = {
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
      variables: [],
      imports: []
    };

    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      if (symbolTypes.includes('functions')) {
        const functionMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*[=\(]/);
        if (functionMatch) {
          symbols.functions.push({
            name: functionMatch[1],
            type: 'function',
            line: lineNumber,
            column: 1,
            signature: line.trim()
          });
        }
      }

      if (symbolTypes.includes('classes')) {
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) {
          symbols.classes.push({
            name: classMatch[1],
            type: 'class',
            line: lineNumber,
            column: 1
          });
        }
      }

      if (symbolTypes.includes('interfaces')) {
        const interfaceMatch = line.match(/interface\s+(\w+)/);
        if (interfaceMatch) {
          symbols.interfaces.push({
            name: interfaceMatch[1],
            type: 'interface',
            line: lineNumber,
            column: 1
          });
        }
      }

      if (symbolTypes.includes('imports')) {
        const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          symbols.imports.push({
            name: line.trim(),
            from: importMatch[1],
            line: lineNumber
          });
        }
      }
    });

    return symbols;
  }

  private async getFiles(dirPath: string, recursive: boolean, includePatterns: string[], excludePatterns: string[]): Promise<string[]> {
    const files: string[] = [];
    
    const processDirectory = async (currentPath: string) => {
      try {
        const entries = await readdir(currentPath);
        
        for (const entry of entries) {
          const entryPath = path.join(currentPath, entry);
          const stats = await stat(entryPath);
          
          if (stats.isDirectory() && recursive) {
            if (!this.shouldExclude(entryPath, excludePatterns)) {
              await processDirectory(entryPath);
            }
          } else if (stats.isFile()) {
            if (!this.shouldExclude(entryPath, excludePatterns)) {
              files.push(entryPath);
            }
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    };

    await processDirectory(dirPath);
    return files;
  }

  private async searchFiles(dirPath: string, pattern: string, caseSensitive: boolean): Promise<string[]> {
    const files = await this.getFiles(dirPath, true, ['*'], []);
    const regex = new RegExp(pattern.replace(/\*/g, '.*'), caseSensitive ? 'g' : 'gi');
    
    return files.filter(file => regex.test(path.basename(file)));
  }

  private fuzzyReplace(content: string, oldText: string, newText: string): string {
    // Simple fuzzy replacement - normalize whitespace
    const normalizedOld = oldText.replace(/\s+/g, ' ').trim();
    const normalizedContent = content.replace(/\s+/g, ' ');
    
    if (normalizedContent.includes(normalizedOld)) {
      return content.replace(new RegExp(this.escapeRegExp(oldText), 'g'), newText);
    }
    
    // If exact match fails, try line-by-line fuzzy matching
    const lines = content.split('\n');
    const oldLines = oldText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (this.linesMatch(lines.slice(i, i + oldLines.length), oldLines)) {
        lines.splice(i, oldLines.length, ...newText.split('\n'));
        break;
      }
    }
    
    return lines.join('\n');
  }

  private linesMatch(contentLines: string[], oldLines: string[]): boolean {
    if (contentLines.length !== oldLines.length) return false;
    
    return contentLines.every((line, index) => {
      const normalizedContent = line.trim().replace(/\s+/g, ' ');
      const normalizedOld = oldLines[index].trim().replace(/\s+/g, ' ');
      return normalizedContent === normalizedOld;
    });
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async findOrphanedProjects(basePath: string, threshold: Date): Promise<string[]> {
    const orphaned: string[] = [];
    
    try {
      const entries = await readdir(basePath);
      
      for (const entry of entries) {
        const entryPath = path.join(basePath, entry);
        const stats = await stat(entryPath);
        
        if (stats.isDirectory() && stats.mtime < threshold) {
          // Check if it looks like a project directory
          const hasPackageJson = await this.fileExists(path.join(entryPath, 'package.json'));
          const hasGit = await this.fileExists(path.join(entryPath, '.git'));
          
          if (hasPackageJson || hasGit) {
            orphaned.push(entryPath);
          }
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
    
    return orphaned;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}