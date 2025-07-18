import { z } from 'zod';

// ===============================================
// TreeSummary Tool Request Schemas
// ===============================================

export const UpdateFileAnalysisSchema = z.object({
  filePath: z.string().describe("Absolute path to the file to analyze or update. Used as the primary key for storing analysis data."),
  analysisData: z.object({
    filePath: z.string().describe("Absolute path to the file (should match the parent filePath parameter)"),
    hash: z.string().describe("SHA-256 hash of the file content, used to detect changes and avoid unnecessary re-analysis"),
    lastModified: z.string().describe("ISO 8601 timestamp of when the file was last modified"),
    symbols: z.array(z.object({
      name: z.string().describe("Name of the symbol (function, class, variable, etc.)"),
      type: z.enum(['function', 'class', 'variable', 'interface', 'type', 'enum']).describe("Type of the symbol found in the code"),
      line: z.number().describe("Line number where the symbol is defined (1-based)"),
      column: z.number().describe("Column number where the symbol is defined (1-based)"),
      accessibility: z.enum(['public', 'private', 'protected']).optional().describe("Accessibility modifier for the symbol (mainly for class members)"),
      isExported: z.boolean().describe("Whether this symbol is exported from the module")
    })).describe("Array of all symbols (functions, classes, variables, etc.) found in the file"),
    imports: z.array(z.string()).describe("Array of all import statements/dependencies used by this file"),
    exports: z.array(z.string()).describe("Array of all symbols exported by this file"),
    size: z.number().describe("File size in bytes"),
    language: z.string().describe("Programming language detected (e.g., 'typescript', 'javascript', 'python')")
  }).describe("Complete analysis data for the file including symbols, imports, exports, and metadata")
});

export const RemoveFileAnalysisSchema = z.object({
  filePath: z.string().describe("Absolute path to the file whose analysis data should be removed. Use when a file has been deleted and you want to clean up its cached analysis data.")
});

export const UpdateProjectMetadataSchema = z.object({
  projectPath: z.string().optional().describe("Absolute path to the project directory. If not provided, uses the current working directory. This tool scans for package.json, tsconfig.json, and other config files to extract project metadata like name, version, dependencies, and technologies used.")
});

export const GetProjectOverviewSchema = z.object({
  projectPath: z.string().optional().describe("Absolute path to the project directory. If not provided, uses the current working directory. Returns a comprehensive overview including project structure, file counts, symbol counts, metadata, and directory hierarchy.")
});

export const CleanupStaleAnalysesSchema = z.object({
  projectPath: z.string().optional().describe("Absolute path to the project directory. If not provided, uses the current working directory. Cleans up analysis data for files that no longer exist or are older than the specified age."),
  maxAgeDays: z.number().min(1).max(365).optional().default(30).describe("Maximum age in days for analysis files to be considered stale. Files with analysis data older than this will be removed. Must be between 1 and 365 days, defaults to 30 days.")
});

export type UpdateFileAnalysisInput = z.infer<typeof UpdateFileAnalysisSchema>;
export type RemoveFileAnalysisInput = z.infer<typeof RemoveFileAnalysisSchema>;
export type UpdateProjectMetadataInput = z.infer<typeof UpdateProjectMetadataSchema>;
export type GetProjectOverviewInput = z.infer<typeof GetProjectOverviewSchema>;
export type CleanupStaleAnalysesInput = z.infer<typeof CleanupStaleAnalysesSchema>;

// ===============================================
// TreeSummary Tool Response Schemas
// ===============================================

// Update File Analysis Response
export const UpdateFileAnalysisResponseSchema = z.object({
  success: z.boolean().describe("Whether the file analysis update operation succeeded. True if the file analysis was successfully stored or updated in the TreeSummary database."),
  message: z.string().describe("Human-readable message describing the result of the operation. Typically 'Successfully updated analysis for [file_path]' on success or an error description on failure."),
  timestamp: z.string().describe("ISO 8601 timestamp of when the operation completed, automatically generated when the response is created."),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds, measured from the start of the operation until completion."),
  data: z.object({
    file_path: z.string().describe("Absolute path to the file that was analyzed. This matches the input filePath parameter."),
    analysis_updated: z.boolean().describe("Whether the analysis data was successfully updated. Always true for successful operations, indicating the file's symbols, imports, exports, and metadata were stored.")
  }).optional().describe("Additional data about the operation result. Contains the file path and confirmation that analysis was updated. Only present on successful operations.")
});

// Remove File Analysis Response
export const RemoveFileAnalysisResponseSchema = z.object({
  success: z.boolean().describe("Whether the file analysis removal operation succeeded. True if the file's analysis data was successfully removed from the TreeSummary database."),
  message: z.string().describe("Human-readable message describing the result of the operation. Typically 'Successfully removed analysis for [file_path]' on success or an error description on failure."),
  timestamp: z.string().describe("ISO 8601 timestamp of when the operation completed, automatically generated when the response is created."),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds, measured from the start of the operation until completion."),
  data: z.object({
    file_path: z.string().describe("Absolute path to the file whose analysis was removed. This matches the input filePath parameter."),
    analysis_updated: z.boolean().describe("Whether the analysis data was successfully removed. Always false for successful removal operations, indicating the file's cached analysis data is no longer stored.")
  }).optional().describe("Additional data about the operation result. Contains the file path and confirmation that analysis was removed. Only present on successful operations.")
});

// Update Project Metadata Response
export const UpdateProjectMetadataResponseSchema = z.object({
  success: z.boolean().describe("Whether the project metadata update operation succeeded. True if the project's metadata was successfully extracted and stored in the TreeSummary database."),
  message: z.string().describe("Human-readable message describing the result of the operation. Typically 'Successfully updated project metadata for [project_path]' on success or an error description on failure."),
  timestamp: z.string().describe("ISO 8601 timestamp of when the operation completed, automatically generated when the response is created."),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds, measured from the start of the operation until completion."),
  data: z.object({
    project_path: z.string().describe("Absolute path to the project directory that was analyzed. Defaults to current working directory if not specified in the request."),
    metadata_updated: z.boolean().describe("Whether the project metadata was successfully updated. Always true for successful operations, indicating project name, version, dependencies, technologies, and configuration files were extracted and stored.")
  }).optional().describe("Additional data about the operation result. Contains the project path and confirmation that metadata was updated. Only present on successful operations.")
});

// Get Project Overview Response
export const GetProjectOverviewResponseSchema = z.object({
  success: z.boolean().describe("Whether the project overview retrieval operation succeeded. True if the project overview was successfully retrieved from the TreeSummary database."),
  message: z.string().describe("Human-readable message describing the result of the operation. Typically 'Successfully retrieved project overview for [project_path]' on success or an error description on failure."),
  timestamp: z.string().describe("ISO 8601 timestamp of when the operation completed, automatically generated when the response is created."),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds, measured from the start of the operation until completion."),
  data: z.object({
    project_path: z.string().describe("Absolute path to the project directory that was analyzed. Defaults to current working directory if not specified in the request."),
    overview: z.object({
      projectPath: z.string().describe("Absolute path to the project directory, matching the analyzed project location."),
      totalFiles: z.number().describe("Total number of files analyzed in the project, excluding ignored files and directories based on .claudeignore and default ignore patterns."),
      lastUpdated: z.string().describe("ISO 8601 timestamp of when the project analysis was last updated, indicating the freshness of the cached data."),
      structure: z.any().describe("Hierarchical directory structure of the project represented as a DirectoryNode tree. Each node contains name, type (file/directory), path, optional children array, size, and lastModified date."),
      symbolCount: z.number().describe("Total number of symbols (functions, classes, variables, interfaces, types, enums) found across all analyzed files in the project."),
      metadata: z.object({
        name: z.string().describe("Project name extracted from package.json, or derived from the directory name if no package.json exists."),
        description: z.string().optional().describe("Project description extracted from package.json description field, if available."),
        version: z.string().optional().describe("Project version extracted from package.json version field, if available."),
        technologies: z.array(z.string()).describe("Array of detected technologies and frameworks based on configuration files, dependencies, and file extensions (e.g., 'React', 'TypeScript', 'Node.js')."),
        dependencies: z.array(z.string()).describe("Array of project dependencies extracted from package.json dependencies and devDependencies fields."),
        entryPoints: z.array(z.string()).describe("Array of detected entry point files such as index.js, main.js, or files specified in package.json main field."),
        configFiles: z.array(z.string()).describe("Array of detected configuration files like package.json, tsconfig.json, .eslintrc, webpack.config.js, etc."),
        buildOutputs: z.array(z.string()).describe("Array of detected build output directories such as dist/, build/, .next/, target/, etc.")
      }).describe("Project metadata extracted from configuration files and project structure analysis, providing comprehensive project information.")
    }).describe("Complete project overview containing hierarchical structure, extracted metadata, file statistics, and symbol counts. This represents the full cached analysis of the project.")
  }).optional().describe("Additional data about the operation result. Contains the project path and complete overview object. Only present on successful operations.")
});

// Cleanup Stale Analyses Response
export const CleanupStaleAnalysesResponseSchema = z.object({
  success: z.boolean().describe("Whether the cleanup operation succeeded. True if the stale analysis cleanup was completed successfully, regardless of whether any files were actually removed."),
  message: z.string().describe("Human-readable message describing the result of the operation. Typically 'Successfully cleaned up [count] stale analysis files' indicating the number of files removed."),
  timestamp: z.string().describe("ISO 8601 timestamp of when the operation completed, automatically generated when the response is created."),
  execution_time_ms: z.number().optional().describe("Time taken to execute the operation in milliseconds, measured from the start of the operation until completion."),
  data: z.object({
    project_path: z.string().describe("Absolute path to the project directory that was cleaned up. Defaults to current working directory if not specified in the request."),
    cleanup_count: z.number().describe("Number of stale analysis files that were removed from the TreeSummary database. This includes analysis data for files that no longer exist or are older than the specified maxAgeDays threshold.")
  }).optional().describe("Additional data about the operation result. Contains the project path and count of removed stale analyses. Only present on successful operations.")
});

// Export response types
export type UpdateFileAnalysisResponse = z.infer<typeof UpdateFileAnalysisResponseSchema>;
export type RemoveFileAnalysisResponse = z.infer<typeof RemoveFileAnalysisResponseSchema>;
export type UpdateProjectMetadataResponse = z.infer<typeof UpdateProjectMetadataResponseSchema>;
export type GetProjectOverviewResponse = z.infer<typeof GetProjectOverviewResponseSchema>;
export type CleanupStaleAnalysesResponse = z.infer<typeof CleanupStaleAnalysesResponseSchema>;