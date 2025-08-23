import * as fs from 'fs/promises';
import { accessSync } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { FoundationCacheService } from './FoundationCacheService.js';

export interface ProjectOverview {
  projectPath: string;
  totalFiles: number;
  lastUpdated: Date;
  structure: DirectoryNode;
  symbolCount: number;
  metadata: ProjectMetadata;
}

export interface DirectoryNode {
  name: string;
  type: 'directory' | 'file';
  path: string;
  children?: DirectoryNode[];
  size?: number;
  lastModified?: Date;
}

export interface ProjectMetadata {
  name: string;
  description?: string;
  version?: string;
  technologies: string[];
  dependencies: string[];
  entryPoints: string[];
  configFiles: string[];
  buildOutputs: string[];
}

export interface FileAnalysis {
  filePath: string;
  hash: string;
  lastModified: Date;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
  size: number;
  language: string;
}

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum';
  line: number;
  column: number;
  accessibility?: 'public' | 'private' | 'protected';
  isExported: boolean;
}

export interface UpdateOptions {
  force?: boolean;
  maxAgeDays?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

/**
 * TreeSummaryService manages .treesummary directories with incremental updates
 * and atomic operations for project analysis and caching.
 * Automatically integrates with FoundationCacheService for intelligent caching.
 */
export class TreeSummaryService {
  private readonly treeSummaryDir = '.treesummary';
  private readonly defaultIgnorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.vite',
    'target',
    '__pycache__',
    '*.pyc',
    '.env*',
    '*.log',
    '.DS_Store',
    'Thumbs.db'
  ];

  constructor(private foundationCache?: FoundationCacheService) {
    // Foundation cache is optional for backward compatibility
  }

  /**
   * Recursively collect all analysis files from the new directory structure
   */
  private async collectAnalysisFiles(treeSummaryPath: string): Promise<{ files: string[], totalFiles: number, symbolCount: number }> {
    const analysisFiles: string[] = [];
    let totalFiles = 0;
    let symbolCount = 0;

    const collectFromDir = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await collectFromDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            analysisFiles.push(fullPath);
            totalFiles++;
            
            try {
              const analysisContent = await fs.readFile(fullPath, 'utf-8');
              const analysis: FileAnalysis = JSON.parse(analysisContent);
              symbolCount += analysis.symbols.length;
            } catch {
              // Skip corrupted files
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    };

    // Start from the treesummary directory and look for any files/ subdirectories
    await collectFromDir(treeSummaryPath);
    
    return { files: analysisFiles, totalFiles, symbolCount };
  }

  /**
   * Read and parse .claudeignore file from a directory
   */
  private async readClaudeIgnore(directory: string): Promise<string[]> {
    try {
      const claudeIgnorePath = path.join(directory, '.claudeignore');
      const content = await fs.readFile(claudeIgnorePath, 'utf8');
      
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
        .map(pattern => {
          // Convert .claudeignore patterns to simple patterns for TreeSummary
          if (pattern.endsWith('/')) {
            return pattern.slice(0, -1); // Remove trailing slash
          }
          return pattern;
        });
    } catch (error) {
      // .claudeignore file doesn't exist or can't be read, return empty array
      return [];
    }
  }

  /**
   * Get combined ignore patterns from default patterns and .claudeignore
   */
  private async getCombinedIgnorePatterns(directory: string): Promise<string[]> {
    const claudeIgnorePatterns = await this.readClaudeIgnore(directory);
    return [...this.defaultIgnorePatterns, ...claudeIgnorePatterns];
  }

  /**
   * Update file analysis for a specific file with atomic operations and foundation cache invalidation
   */
  async updateFileAnalysis(filePath: string, analysisData: FileAnalysis): Promise<boolean> {
    try {
      const projectPath = this.findProjectRoot(filePath);
      const treeSummaryPath = path.join(projectPath, this.treeSummaryDir);
      
      // Invalidate relevant foundation cache entries
      if (this.foundationCache) {
        try {
          // Invalidate project-level caches since file analysis changed
          await this.foundationCache.invalidateCache({
            filePath: projectPath,
            templateId: 'project_overview'
          });
        } catch (error) {
          console.warn('Failed to invalidate foundation cache:', error);
        }
      }
      
      // Ensure .treesummary directory exists
      await this.ensureTreeSummaryDirectory(treeSummaryPath);
      
      // Create atomic file write with directory structure preservation
      const relativeFilePath = path.relative(projectPath, filePath);
      
      // Create clean mirror structure: .treesummary/files/path/to/file.ext.json
      const analysisFile = path.join(treeSummaryPath, 'files', relativeFilePath + '.json');
      
      // Ensure files directory exists
      await fs.mkdir(path.dirname(analysisFile), { recursive: true });
      
      // Write to temporary file first for atomic operation
      const tempFile = analysisFile + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(analysisData, null, 2));
      
      // Atomic rename
      await fs.rename(tempFile, analysisFile);
      
      // Update project metadata
      await this.updateProjectMetadata(projectPath);
      
      return true;
    } catch (error) {
      console.error(`Failed to update file analysis for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Remove file analysis for a deleted file
   */
  async removeFileAnalysis(filePath: string): Promise<boolean> {
    try {
      const projectPath = this.findProjectRoot(filePath);
      const treeSummaryPath = path.join(projectPath, this.treeSummaryDir);
      
      const relativeFilePath = path.relative(projectPath, filePath);
      
      // Use clean mirror structure: .treesummary/files/path/to/file.ext.json
      const analysisFile = path.join(treeSummaryPath, 'files', relativeFilePath + '.json');
      
      // Check if file exists before attempting to delete
      try {
        await fs.access(analysisFile);
        await fs.unlink(analysisFile);
      } catch (error) {
        // File doesn't exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      
      // Update project metadata
      await this.updateProjectMetadata(projectPath);
      
      return true;
    } catch (error) {
      console.error(`Failed to remove file analysis for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Update project metadata with current state
   */
  async updateProjectMetadata(projectPath?: string): Promise<void> {
    if (!projectPath) {
      projectPath = process.cwd();
    }
    
    const treeSummaryPath = path.join(projectPath, this.treeSummaryDir);
    await this.ensureTreeSummaryDirectory(treeSummaryPath);
    
    const metadata = await this.analyzeProjectMetadata(projectPath);
    const metadataFile = path.join(treeSummaryPath, 'metadata.json');
    
    // Atomic write
    const tempFile = metadataFile + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(metadata, null, 2));
    await fs.rename(tempFile, metadataFile);
  }

  /**
   * Get comprehensive project overview with automatic foundation caching
   */
  async getProjectOverview(projectPath?: string): Promise<ProjectOverview> {
    if (!projectPath) {
      projectPath = process.cwd();
    }
    
    const resolvedPath = path.resolve(projectPath);
    
    // Try to get cached overview from foundation cache first
    if (this.foundationCache) {
      try {
        const cacheKey = `project_overview_${resolvedPath}`;
        const cachedOverview = await this.foundationCache.getCachedAnalysis(
          resolvedPath,
          cacheKey,
          'project_overview'
        );
        
        if (cachedOverview) {
          return cachedOverview;
        }
      } catch (error) {
        // If cache fails, continue with normal processing
        console.warn('Foundation cache failed for project overview:', error);
      }
    }
    
    const treeSummaryPath = path.join(resolvedPath, this.treeSummaryDir);
    
    // Check if .treesummary exists
    try {
      await fs.access(treeSummaryPath);
    } catch {
      // Initialize if doesn't exist
      await this.initializeProject(resolvedPath);
    }
    
    // Load metadata
    const metadataFile = path.join(treeSummaryPath, 'metadata.json');
    let metadata: ProjectMetadata;
    
    try {
      const metadataContent = await fs.readFile(metadataFile, 'utf-8');
      metadata = JSON.parse(metadataContent);
    } catch {
      metadata = await this.analyzeProjectMetadata(resolvedPath);
    }
    
    // Count symbols from all file analyses using new directory structure
    const { totalFiles, symbolCount } = await this.collectAnalysisFiles(treeSummaryPath);
    
    // Build directory structure
    const structure = await this.buildDirectoryStructure(resolvedPath);
    
    const overview: ProjectOverview = {
      projectPath: resolvedPath,
      totalFiles,
      lastUpdated: new Date(),
      structure,
      symbolCount,
      metadata
    };
    
    // Cache the result in foundation cache
    if (this.foundationCache) {
      try {
        const cacheKey = `project_overview_${resolvedPath}`;
        await this.foundationCache.cacheAnalysisResult(
          resolvedPath,
          cacheKey,
          'project_overview',
          overview
        );
      } catch (error) {
        // If caching fails, log but don't fail the operation
        console.warn('Failed to cache project overview:', error);
      }
    }
    
    return overview;
  }

  /**
   * Clean up stale analysis files older than specified days
   */
  async cleanupStaleAnalyses(projectPath?: string, maxAgeDays: number = 30): Promise<number> {
    if (!projectPath) {
      projectPath = process.cwd();
    }
    
    const treeSummaryPath = path.join(projectPath, this.treeSummaryDir);
    let cleanedCount = 0;
    
    const maxAge = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    
    const cleanupDir = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await cleanupDir(fullPath);
            
            // Remove empty directories after cleanup
            try {
              const remainingEntries = await fs.readdir(fullPath);
              if (remainingEntries.length === 0) {
                await fs.rmdir(fullPath);
              }
            } catch {
              // Directory not empty or already removed
            }
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            try {
              const stats = await fs.stat(fullPath);
              
              if (stats.mtime < maxAge) {
                // Reconstruct original file path from analysis file path
                const relativePath = path.relative(treeSummaryPath, fullPath);
                let originalFilePath: string;
                
                if (relativePath.startsWith('files/')) {
                  // Clean mirror structure: .treesummary/files/path/to/file.ext.json
                  const relativeSourcePath = relativePath.substring(6); // Remove 'files/' prefix
                  const originalFileName = path.basename(relativeSourcePath, '.json'); // Remove .json suffix
                  const originalDirPath = path.dirname(relativeSourcePath);
                  originalFilePath = originalDirPath === '.' 
                    ? path.join(projectPath, originalFileName)
                    : path.join(projectPath, originalDirPath, path.basename(originalFileName));
                } else {
                  // Skip non-files directory entries
                  continue;
                }
                
                try {
                  await fs.access(originalFilePath);
                } catch {
                  // Source file doesn't exist, safe to remove analysis
                  await fs.unlink(fullPath);
                  cleanedCount++;
                }
              }
            } catch (error) {
              console.error(`Error processing ${fullPath}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
      }
    };
    
    try {
      await cleanupDir(treeSummaryPath);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    
    return cleanedCount;
  }

  /**
   * Initialize .treesummary directory structure for a project
   */
  private async initializeProject(projectPath: string): Promise<void> {
    const treeSummaryPath = path.join(projectPath, this.treeSummaryDir);
    await this.ensureTreeSummaryDirectory(treeSummaryPath);
    await this.updateProjectMetadata(projectPath);
  }

  /**
   * Ensure .treesummary directory structure exists
   */
  private async ensureTreeSummaryDirectory(treeSummaryPath: string): Promise<void> {
    await fs.mkdir(treeSummaryPath, { recursive: true });
    await fs.mkdir(path.join(treeSummaryPath, 'files'), { recursive: true });
    await fs.mkdir(path.join(treeSummaryPath, 'cache'), { recursive: true });
    
    // Create .gitignore to avoid committing cache files
    const gitignorePath = path.join(treeSummaryPath, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, '# TreeSummary cache files\ncache/\n*.tmp\n');
    }
  }

  /**
   * Find the project root by looking for common markers
   * Always returns the TOPMOST project root, not the first one found
   */
  private findProjectRoot(filePath: string): string {
    let currentDir = path.dirname(path.resolve(filePath));
    let topMostProjectRoot: string | null = null;
    
    // Common project markers in priority order (.git is most important)
    const markers = [
      '.git',
      'package.json',
      'pyproject.toml',
      'Cargo.toml',
      'go.mod',
      'Makefile',
      'pom.xml',
      'build.gradle'
    ];
    
    while (currentDir !== path.dirname(currentDir)) {
      // Check for any project markers in this directory
      let hasProjectMarker = false;
      
      for (const marker of markers) {
        try {
          const markerPath = path.join(currentDir, marker);
          // Use synchronous check for simplicity in this case
          accessSync(markerPath);
          hasProjectMarker = true;
          break; // Found at least one marker in this directory
        } catch {
          // Continue checking other markers
        }
      }
      
      if (hasProjectMarker) {
        // Update the topmost project root (always prefer higher up in the directory tree)
        topMostProjectRoot = currentDir;
      }
      
      currentDir = path.dirname(currentDir);
    }
    
    // Return the topmost project root found, or default to the directory containing the file
    return topMostProjectRoot || path.dirname(path.resolve(filePath));
  }

  /**
   * Analyze project metadata from common configuration files
   */
  private async analyzeProjectMetadata(projectPath: string): Promise<ProjectMetadata> {
    const metadata: ProjectMetadata = {
      name: path.basename(projectPath),
      technologies: [],
      dependencies: [],
      entryPoints: [],
      configFiles: [],
      buildOutputs: []
    };
    
    // Check for Node.js project
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      metadata.name = packageJson.name || metadata.name;
      metadata.description = packageJson.description;
      metadata.version = packageJson.version;
      metadata.technologies.push('Node.js');
      metadata.configFiles.push('package.json');
      
      if (packageJson.dependencies) {
        metadata.dependencies.push(...Object.keys(packageJson.dependencies));
      }
      if (packageJson.devDependencies) {
        metadata.dependencies.push(...Object.keys(packageJson.devDependencies));
      }
      
      if (packageJson.main) metadata.entryPoints.push(packageJson.main);
      if (packageJson.types) metadata.entryPoints.push(packageJson.types);
    } catch {
      // Not a Node.js project or package.json doesn't exist
    }
    
    // Check for TypeScript
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    try {
      await fs.access(tsConfigPath);
      metadata.technologies.push('TypeScript');
      metadata.configFiles.push('tsconfig.json');
    } catch {
      // Not TypeScript
    }
    
    // Check for Python
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    try {
      await fs.access(pyprojectPath);
      metadata.technologies.push('Python');
      metadata.configFiles.push('pyproject.toml');
    } catch {
      try {
        await fs.access(requirementsPath);
        metadata.technologies.push('Python');
        metadata.configFiles.push('requirements.txt');
      } catch {
        // Not Python
      }
    }
    
    // Check for common build outputs
    const commonBuildDirs = ['dist', 'build', 'out', 'target', '__pycache__'];
    for (const dir of commonBuildDirs) {
      try {
        await fs.access(path.join(projectPath, dir));
        metadata.buildOutputs.push(dir);
      } catch {
        // Directory doesn't exist
      }
    }
    
    return metadata;
  }

  /**
   * Build directory structure for the project
   */
  private async buildDirectoryStructure(projectPath: string): Promise<DirectoryNode> {
    const stats = await fs.stat(projectPath);
    const node: DirectoryNode = {
      name: path.basename(projectPath),
      type: 'directory',
      path: projectPath,
      lastModified: stats.mtime,
      children: []
    };
    
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip ignored patterns
        if (await this.shouldIgnore(entry.name, projectPath)) {
          continue;
        }
        
        const entryPath = path.join(projectPath, entry.name);
        const entryStats = await fs.stat(entryPath);
        
        if (entry.isDirectory()) {
          // Recursively build directory structure (limited depth for performance)
          const childNode: DirectoryNode = {
            name: entry.name,
            type: 'directory',
            path: entryPath,
            lastModified: entryStats.mtime,
            children: []
          };
          
          // Only go 2 levels deep to avoid performance issues
          if (entryPath.split(path.sep).length < projectPath.split(path.sep).length + 2) {
            try {
              const grandChildren = await fs.readdir(entryPath, { withFileTypes: true });
              for (const grandChild of grandChildren.slice(0, 10)) { // Limit to first 10 for performance
                if (!(await this.shouldIgnore(grandChild.name, projectPath))) {
                  const grandChildPath = path.join(entryPath, grandChild.name);
                  const grandChildStats = await fs.stat(grandChildPath);
                  
                  childNode.children!.push({
                    name: grandChild.name,
                    type: grandChild.isDirectory() ? 'directory' : 'file',
                    path: grandChildPath,
                    size: grandChild.isFile() ? grandChildStats.size : undefined,
                    lastModified: grandChildStats.mtime
                  });
                }
              }
            } catch {
              // Skip if can't read directory
            }
          }
          
          node.children!.push(childNode);
        } else if (entry.isFile()) {
          node.children!.push({
            name: entry.name,
            type: 'file',
            path: entryPath,
            size: entryStats.size,
            lastModified: entryStats.mtime
          });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${projectPath}:`, error);
    }
    
    return node;
  }

  /**
   * Check if a file or directory should be ignored
   */
  private async shouldIgnore(name: string, projectPath: string): Promise<boolean> {
    const combinedPatterns = await this.getCombinedIgnorePatterns(projectPath);
    return combinedPatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob pattern matching
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern || name.startsWith(pattern);
    });
  }

  /**
   * Generate hash for file content (used for change detection)
   */
  private async generateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch (error) {
      console.error(`Error generating hash for ${filePath}:`, error);
      return '';
    }
  }
}

export default TreeSummaryService;