import { z } from "zod";

// ===============================================
// Analysis Tool Request Schemas
// ===============================================

export const AnalyzeProjectStructureSchema = z.object({
  project_path: z.string().default(".").describe("The path to the project directory to analyze. Defaults to current directory."),
  include_patterns: z.array(z.string()).default(["**/*"]).describe("Glob patterns for files to include in analysis. Defaults to all files."),
  exclude_patterns: z
    .array(z.string())
    .default(["node_modules/**", ".git/**", "dist/**", "build/**"])
    .describe("Glob patterns for files/directories to exclude from analysis. Includes .claudeignore patterns if present."),
  max_depth: z.number().default(10).describe("Maximum directory depth to traverse during analysis. Prevents infinite recursion."),
  generate_summary: z.boolean().default(true).describe("Whether to generate a .treesummary file with the project structure overview."),
}).describe("Analyzes project structure and generates a comprehensive directory tree with file metadata. Creates cached analysis results and optionally generates summary files for AI optimization. Respects .claudeignore patterns and common ignore patterns.");

export const GenerateProjectSummarySchema = z.object({
  project_path: z.string().default(".").describe("The path to the project directory to analyze. Defaults to current directory."),
  include_readme: z.boolean().default(true).describe("Whether to extract description from README files (README.md, README.txt, etc.)."),
  include_package_info: z.boolean().default(true).describe("Whether to analyze package.json, requirements.txt, and other dependency files to detect framework and language."),
  include_git_info: z.boolean().default(true).describe("Whether to extract git repository information like branch, commits, and remotes."),
  output_path: z.string().optional().describe("Optional path to save the generated summary as a JSON file."),
}).describe("Generates an AI-optimized project summary with metadata, dependencies, framework detection, and statistics. Useful for providing comprehensive project context to AI agents and development tools.");

export const AnalyzeFileSymbolsSchema = z.object({
  file_path: z.string().describe("The absolute path to the source code file to analyze for symbols."),
  symbol_types: z
    .array(
      z.enum([
        "functions",
        "classes",
        "interfaces",
        "types",
        "variables",
        "imports",
      ])
    )
    .default(["functions", "classes"])
    .describe("Types of code symbols to extract from the file. Defaults to functions and classes."),
}).describe("Extracts and analyzes code symbols (functions, classes, interfaces, types, variables, imports) from source files. Useful for understanding code structure, generating documentation, and code analysis tasks.");

export const ListFilesSchema = z.object({
  directory: z.string().default(".").describe("The directory path to list files from. Defaults to current directory."),
  recursive: z.boolean().default(false).describe("Whether to recursively list files in subdirectories. Defaults to false for current directory only."),
  include_patterns: z.array(z.string()).default(["*"]).describe("Glob patterns for files to include in the listing. Defaults to all files."),
  exclude_patterns: z.array(z.string()).default([]).describe("Glob patterns for files/directories to exclude from the listing."),
}).describe("Lists files and directories with smart filtering and ignore patterns. Provides detailed file metadata including size, type, and modification dates. Useful for file system exploration and directory analysis.");

export const FindFilesSchema = z.object({
  pattern: z.string().describe("The search pattern to match against file names. Supports wildcards (* and **) for flexible matching."),
  directory: z.string().default(".").describe("The directory to search in. Defaults to current directory."),
  case_sensitive: z.boolean().default(false).describe("Whether the pattern matching should be case sensitive. Defaults to case insensitive."),
  include_content: z.boolean().default(false).describe("Whether to include file content preview (first 500 characters) in the results."),
}).describe("Searches for files by pattern with advanced matching options. Supports glob patterns, case sensitivity control, and optional content preview. Useful for finding specific files across large codebases.");

export const EasyReplaceSchema = z.object({
  file_path: z.string().describe("The absolute path to the file where text replacement should be performed."),
  old_text: z.string().describe("The text to search for and replace. Can be exact text or pattern."),
  new_text: z.string().describe("The replacement text to substitute for the old text."),
  fuzzy_match: z.boolean().default(true).describe("Whether to use fuzzy matching that normalizes whitespace and handles indentation. Defaults to true for flexible matching."),
  backup: z.boolean().default(true).describe("Whether to create a backup file before making changes. Defaults to true for safety."),
}).describe("Performs intelligent text replacement in files with fuzzy matching and backup capabilities. Handles whitespace normalization and indentation preservation. Useful for code refactoring and bulk text modifications.");

export const CleanupOrphanedProjectsSchema = z.object({
  base_path: z.string().default(process.env.HOME || ".").describe("The base directory path to search for orphaned projects. Defaults to user's home directory."),
  days_threshold: z.number().default(30).describe("The number of days since last modification to consider a project orphaned. Defaults to 30 days."),
  dry_run: z.boolean().default(true).describe("Whether to perform a dry run without actually deleting files. Defaults to true for safety."),
}).describe("Identifies and optionally removes orphaned project directories based on age and inactivity. Looks for directories with package.json or .git that haven't been modified recently. Always defaults to dry run for safety.");

// Analysis Types
export type AnalyzeProjectStructureInput = z.infer<
  typeof AnalyzeProjectStructureSchema
>;
export type GenerateProjectSummaryInput = z.infer<
  typeof GenerateProjectSummarySchema
>;
export type AnalyzeFileSymbolsInput = z.infer<typeof AnalyzeFileSymbolsSchema>;
export type ListFilesInput = z.infer<typeof ListFilesSchema>;
export type FindFilesInput = z.infer<typeof FindFilesSchema>;
export type EasyReplaceInput = z.infer<typeof EasyReplaceSchema>;
export type CleanupOrphanedProjectsInput = z.infer<
  typeof CleanupOrphanedProjectsSchema
>;

// ===============================================
// Analysis Tool Response Schemas
// ===============================================

// Base response schema for analysis tools
export const BaseAnalysisResponseSchema = z.object({
  success: z.boolean().describe("Whether the tool execution was successful"),
  message: z.string().describe("Human-readable message describing the result"),
  timestamp: z.string().describe("ISO timestamp of when the tool completed"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the tool in milliseconds"),
  error: z.string().optional().describe("Error message if success is false")
}).describe("Base response structure for all analysis tools containing execution status, timing information, and error handling");

// Project structure info schema with recursive children
export const ProjectStructureInfoSchema = z.object({
  path: z.string().describe("Full absolute path to the file or directory"),
  name: z.string().describe("Base name of the file or directory"),
  type: z.enum(['file', 'directory']).describe("Type of the filesystem entry"),
  size: z.number().optional().describe("Size in bytes for files, undefined for directories"),
  extension: z.string().optional().describe("File extension including the dot (e.g., '.js', '.ts') for files only"),
  lastModified: z.string().optional().describe("Last modification timestamp of the file or directory")
}).describe("Represents a file or directory node in the project structure tree with metadata. Directory nodes have a 'children' array containing nested ProjectStructureInfo objects");

export type ProjectStructureInfo = z.infer<typeof ProjectStructureInfoSchema> & {
  children?: ProjectStructureInfo[];
};

// Project summary schema
export const ProjectSummarySchema = z.object({
  name: z.string().describe("Project name extracted from the directory name"),
  path: z.string().describe("Absolute path to the project root directory"),
  description: z.string().optional().describe("Project description extracted from README files"),
  framework: z.string().optional().describe("Detected framework (e.g., 'React', 'Vue', 'Express', 'Next.js') based on dependencies"),
  language: z.string().optional().describe("Primary programming language (e.g., 'JavaScript/TypeScript', 'Python') detected from package files"),
  dependencies: z.record(z.string(), z.string()).optional().describe("Map of dependency names to versions from package.json, requirements.txt, or similar files"),
  structure: z.any().describe("Complete project directory structure as a recursive tree of ProjectStructureInfo objects"), // Using z.any() to avoid recursion issues
  gitInfo: z.object({
    branch: z.string().optional().describe("Current git branch name"),
    lastCommit: z.string().optional().describe("Latest commit hash or identifier"),
    remotes: z.array(z.string()).optional().describe("List of configured git remote names")
  }).optional().describe("Git repository information if the project is a git repository"),
  stats: z.object({
    totalFiles: z.number().describe("Total number of files in the project"),
    totalDirectories: z.number().describe("Total number of directories in the project"),
    totalSize: z.number().describe("Total size of all files in bytes"),
    fileTypes: z.record(z.string(), z.number()).describe("Map of file extensions to their counts (e.g., '.js': 15, '.ts': 8)")
  }).describe("Project statistics including file counts, directory counts, and file type distribution")
}).describe("Comprehensive project summary with metadata, framework detection, dependency analysis, git information, and project statistics");

// File symbols schema
export const FileSymbolsSchema = z.object({
  file_path: z.string().describe("Absolute path to the analyzed source file"),
  symbols: z.object({
    functions: z.array(z.object({
      name: z.string().describe("Function name"),
      line: z.number().describe("Line number where the function is defined"),
      signature: z.string().optional().describe("Full function signature including parameters and return type")
    })).describe("List of functions found in the file"),
    classes: z.array(z.object({
      name: z.string().describe("Class name"),
      line: z.number().describe("Line number where the class is defined"),
      methods: z.array(z.string()).optional().describe("List of method names within the class")
    })).describe("List of classes found in the file"),
    interfaces: z.array(z.object({
      name: z.string().describe("Interface name"),
      line: z.number().describe("Line number where the interface is defined"),
      properties: z.array(z.string()).optional().describe("List of property names within the interface")
    })).describe("List of interfaces found in the file (TypeScript)"),
    types: z.array(z.object({
      name: z.string().describe("Type alias name"),
      line: z.number().describe("Line number where the type is defined"),
      definition: z.string().optional().describe("Full type definition")
    })).describe("List of type aliases found in the file (TypeScript)"),
    variables: z.array(z.object({
      name: z.string().describe("Variable name"),
      line: z.number().describe("Line number where the variable is defined"),
      type: z.string().optional().describe("Variable type annotation if available")
    })).describe("List of variables found in the file"),
    imports: z.array(z.object({
      name: z.string().describe("Import statement text"),
      from: z.string().describe("Module path being imported from"),
      line: z.number().describe("Line number of the import statement")
    })).describe("List of import statements found in the file")
  }).describe("Collection of all extracted symbols organized by type")
}).describe("Complete symbol analysis of a source code file including functions, classes, interfaces, types, variables, and imports with their locations");

// File info schema for list operations
export const FileInfoSchema = z.object({
  path: z.string().describe("Full absolute path to the file or directory"),
  name: z.string().describe("Base name of the file or directory"),
  size: z.number().optional().describe("Size in bytes for files, undefined for directories"),
  type: z.string().describe("File type description (e.g., 'file', 'directory', 'symlink')"),
  extension: z.string().optional().describe("File extension including the dot (e.g., '.js', '.ts') for files only"),
  lastModified: z.string().optional().describe("Last modification timestamp in ISO"),
  isDirectory: z.boolean().describe("True if this is a directory"),
  isFile: z.boolean().describe("True if this is a regular file")
}).describe("Detailed information about a file or directory including metadata, size, type, and timestamps");

// File match schema for find operations
export const FileMatchSchema = z.object({
  path: z.string().describe("Full absolute path to the matched file"),
  preview: z.string().optional().describe("First 500 characters of file content if include_content was requested, or '[Could not read file]' if the file is unreadable")
}).describe("File match result from pattern search, optionally including content preview");

// Individual tool response schemas
export const AnalyzeProjectStructureResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    project_info: z.any().describe("Complete project directory structure as a recursive tree of ProjectStructureInfo objects with files and directories"), // ProjectStructureInfo but using z.any() to avoid recursion
    summary_generated: z.boolean().describe("Whether a .treesummary file was generated"),
    summary_path: z.string().nullable().describe("Path to the generated .treesummary file, null if not generated"),
    cached: z.boolean().describe("Whether the result was retrieved from cache or newly computed")
  }).optional().describe("Project structure analysis results including directory tree, summary generation status, and cache information")
}).describe("Response from analyze_project_structure tool containing the complete project directory structure and metadata");

export const GenerateProjectSummaryResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    summary: ProjectSummarySchema.describe("Complete project summary with metadata, dependencies, framework detection, and statistics"),
    cached: z.boolean().describe("Whether the result was retrieved from cache or newly computed")
  }).optional().describe("Project summary data including all analyzed information and cache status")
}).describe("Response from generate_project_summary tool containing comprehensive project analysis and metadata");

export const AnalyzeFileSymbolsResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    symbols: FileSymbolsSchema.describe("Extracted symbols from the analyzed file including functions, classes, interfaces, types, variables, and imports")
  }).optional().describe("Symbol analysis results containing all extracted code symbols with their locations")
}).describe("Response from analyze_file_symbols tool containing all extracted symbols from a source code file");

export const ListFilesResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    files: z.array(z.string()).describe("Array of file paths matching the listing criteria"),
    analysis_data: z.object({
      fileInfos: z.array(FileInfoSchema).describe("Detailed information for each file including metadata, size, and timestamps"),
      count: z.number().describe("Total number of files found"),
      directory: z.string().describe("The directory that was listed")
    }).describe("Additional analysis data with detailed file information and statistics")
  }).optional().describe("File listing results with both simple paths and detailed file information")
}).describe("Response from list_files tool containing file paths and detailed metadata for files in a directory");

export const FindFilesResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    files: z.array(z.string()).describe("Array of file paths that match the search pattern"),
    analysis_data: z.object({
      matches: z.array(FileMatchSchema).describe("Detailed match results including file paths and optional content previews"),
      count: z.number().describe("Total number of files found matching the pattern"),
      pattern: z.string().describe("The search pattern that was used")
    }).describe("Additional analysis data with detailed match information and search parameters")
  }).optional().describe("File search results with both simple paths and detailed match information")
}).describe("Response from find_files tool containing files matching a search pattern with optional content previews");

export const EasyReplaceResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    replaced_count: z.number().describe("Number of text replacements that were made in the file"),
    analysis_data: z.object({
      file_path: z.string().describe("Absolute path to the file that was modified"),
      backup_created: z.boolean().describe("Whether a backup file was created before making changes")
    }).describe("Additional information about the replacement operation")
  }).optional().describe("Text replacement results including replacement count and backup status")
}).describe("Response from easy_replace tool containing the number of replacements made and backup information");

export const CleanupOrphanedProjectsResponseSchema = BaseAnalysisResponseSchema.extend({
  data: z.object({
    cleanup_results: z.object({
      orphaned_projects: z.array(z.string()).describe("Array of absolute paths to orphaned project directories found"),
      count: z.number().describe("Total number of orphaned projects identified"),
      dry_run: z.boolean().describe("Whether this was a dry run (true) or actual deletion (false)"),
      threshold_date: z.string().describe("ISO timestamp cutoff date - projects older than this are considered orphaned")
    }).describe("Results of the orphaned project cleanup operation")
  }).optional().describe("Cleanup operation results including found orphaned projects and operation parameters")
}).describe("Response from cleanup_orphaned_projects tool containing information about orphaned project directories found or cleaned up");

// Response Types
export type AnalyzeProjectStructureResponse = z.infer<typeof AnalyzeProjectStructureResponseSchema>;
export type GenerateProjectSummaryResponse = z.infer<typeof GenerateProjectSummaryResponseSchema>;
export type AnalyzeFileSymbolsResponse = z.infer<typeof AnalyzeFileSymbolsResponseSchema>;
export type ListFilesResponse = z.infer<typeof ListFilesResponseSchema>;
export type FindFilesResponse = z.infer<typeof FindFilesResponseSchema>;
export type EasyReplaceResponse = z.infer<typeof EasyReplaceResponseSchema>;
export type CleanupOrphanedProjectsResponse = z.infer<typeof CleanupOrphanedProjectsResponseSchema>;

// Helper schemas for reuse
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type FileSymbols = z.infer<typeof FileSymbolsSchema>;
export type FileInfo = z.infer<typeof FileInfoSchema>;
export type FileMatch = z.infer<typeof FileMatchSchema>;
