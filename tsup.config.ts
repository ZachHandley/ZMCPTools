import { defineConfig } from 'tsup';

export default defineConfig([
  // Server build (with shebang for npx usage, excludes native deps)
  {
    entry: ['src/index.ts'],
    outDir: 'dist/server',
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'node18',
    platform: 'node',
    bundle: true,
    external: ['@lancedb/lancedb', 'better-sqlite3'], // Mark native deps as external
    publicDir: false,
    treeshake: true,
    skipNodeModulesBundle: true, // Don't bundle node_modules due to native deps
    tsconfig: 'tsconfig.json',
    shims: false,
    cjsInterop: false,
    banner: {
      js: '#!/usr/bin/env node'
    },
    // Ensure server binary is executable and copy hooks
    onSuccess: async () => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      const path = await import('path');
      
      try {
        execSync('chmod +x dist/server/index.js', { stdio: 'ignore' });
        console.log('✅ Made server binary executable');
      } catch (error) {
        console.warn('⚠️  Failed to make server binary executable:', error);
      }
      
      // Copy hooks directory to dist with Unix line endings
      try {
        const srcHooksDir = path.resolve('src/hooks');
        const distHooksDir = path.resolve('dist/hooks');
        
        if (fs.existsSync(srcHooksDir)) {
          // Create dist hooks directory
          fs.mkdirSync(distHooksDir, { recursive: true });
          
          // Copy each hook file and fix line endings
          const hookFiles = fs.readdirSync(srcHooksDir);
          for (const file of hookFiles) {
            const srcFile = path.join(srcHooksDir, file);
            const destFile = path.join(distHooksDir, file);
            
            let content = fs.readFileSync(srcFile, 'utf8');
            // Ensure Unix line endings
            content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            fs.writeFileSync(destFile, content);
            fs.chmodSync(destFile, 0o755); // Make executable
          }
          
          console.log('✅ Copied hooks to dist with Unix line endings');
        }
      } catch (error) {
        console.warn('⚠️  Failed to copy hooks:', error);
      }
    }
  },
  // CLI build (with shebang, single entry point)
  {
    entry: { 'index': 'src/cli/index.ts' },
    outDir: 'dist/cli',
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'node18',
    platform: 'node',
    bundle: true,
    external: [],
    publicDir: false,
    treeshake: true,
    skipNodeModulesBundle: true,
    tsconfig: 'tsconfig.json',
    shims: false,
    cjsInterop: false,
    banner: {
      js: '#!/usr/bin/env node'
    },
    // Ensure CLI binary is executable and copy dashboard files
    onSuccess: async () => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      const path = await import('path');
      
      try {
        execSync('chmod +x dist/cli/index.js', { stdio: 'ignore' });
        console.log('✅ Made CLI binary executable');
      } catch (error) {
        console.warn('⚠️  Failed to make CLI binary executable:', error);
      }
      
      // Copy dashboard dist files to CLI build
      try {
        const dashboardDistPath = path.resolve('dashboard/dist');
        const cliDashboardPath = path.resolve('dist/cli/dashboard');
        
        if (fs.existsSync(dashboardDistPath)) {
          // Copy dashboard files to a subdirectory to avoid conflicts
          const astroAssetsPath = path.join(cliDashboardPath, 'web');
          
          // Copy dashboard files
          function copyRecursive(src, dest) {
            fs.mkdirSync(dest, { recursive: true });
            const items = fs.readdirSync(src);
            
            for (const item of items) {
              const srcPath = path.join(src, item);
              const destPath = path.join(dest, item);
              const stat = fs.statSync(srcPath);
              
              if (stat.isDirectory()) {
                copyRecursive(srcPath, destPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          }
          
          copyRecursive(dashboardDistPath, astroAssetsPath);
          console.log('✅ Copied dashboard files to CLI build');
        } else {
          console.warn('⚠️  Dashboard dist not found - run npm run build:dashboard first');
        }
      } catch (error) {
        console.warn('⚠️  Failed to copy dashboard files:', error);
      }
    }
  }
]);