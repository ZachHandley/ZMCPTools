import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the CommonJS module
const wrapperLib = require('../zmcp-agent-wrapper-lib.cjs');
const { parseArgs, getProcessTitle, typeAbbreviations } = wrapperLib;

describe('zmcp-agent-wrapper-lib', () => {
  describe('parseArgs', () => {
    it('should return usage error when no -- delimiter', () => {
      const result = parseArgs(['node', 'script', 'backend', 'oauth']);
      expect(result).toEqual({ error: 'usage' });
    });

    it('should return usage error when -- delimiter is too early', () => {
      const result = parseArgs(['node', 'script', 'backend', '--', 'sleep']);
      expect(result).toEqual({ error: 'usage' });
    });

    it('should return missing error when agent type is empty', () => {
      const result = parseArgs(['node', 'script', '', 'project', 'id', '--', 'sleep']);
      expect(result).toEqual({ error: 'missing' });
    });

    it('should return missing error when project context is empty', () => {
      const result = parseArgs(['node', 'script', 'backend', '', 'id', '--', 'sleep']);
      expect(result).toEqual({ error: 'missing' });
    });

    it('should return missing error when agent id is empty', () => {
      const result = parseArgs(['node', 'script', 'backend', 'project', '', '--', 'sleep']);
      expect(result).toEqual({ error: 'missing' });
    });

    it('should return missing error when no command after --', () => {
      const result = parseArgs(['node', 'script', 'backend', 'project', 'id', '--']);
      expect(result).toEqual({ error: 'missing' });
    });

    it('should parse valid arguments correctly', () => {
      const result = parseArgs(['node', 'script', 'backend', 'oauth-impl', 'a3f2e1', '--', 'sleep', '60']);
      expect(result).toEqual({
        agentType: 'backend',
        projectContext: 'oauth-impl',
        agentId: 'a3f2e1',
        command: ['sleep', '60']
      });
    });

    it('should handle complex commands with multiple arguments', () => {
      const result = parseArgs(['node', 'script', 'testing', 'auth-tests', 'c1e4', '--', 'npm', 'test', '--coverage', '--verbose']);
      expect(result).toEqual({
        agentType: 'testing',
        projectContext: 'auth-tests',
        agentId: 'c1e4',
        command: ['npm', 'test', '--coverage', '--verbose']
      });
    });
  });

  describe('getProcessTitle', () => {
    it('should use known abbreviation for backend', () => {
      const title = getProcessTitle('backend', 'oauth-impl', 'a3f2e1');
      expect(title).toBe('zmcp-be-oauth-impl-a3f2e1');
    });

    it('should use known abbreviation for frontend', () => {
      const title = getProcessTitle('frontend', 'react-ui', 'b7d9c2');
      expect(title).toBe('zmcp-fe-react-ui-b7d9c2');
    });

    it('should use known abbreviation for testing', () => {
      const title = getProcessTitle('testing', 'auth-tests', 'c1e4d3');
      expect(title).toBe('zmcp-ts-auth-tests-c1e4d3');
    });

    it('should use known abbreviation for documentation', () => {
      const title = getProcessTitle('documentation', 'api-docs', 'd2a1e4');
      expect(title).toBe('zmcp-dc-api-docs-d2a1e4');
    });

    it('should use known abbreviation for architect', () => {
      const title = getProcessTitle('architect', 'full-stack', 'e5b3f6');
      expect(title).toBe('zmcp-ar-full-stack-e5b3f6');
    });

    it('should use known abbreviation for devops', () => {
      const title = getProcessTitle('devops', 'ci-cd', 'f6c4g7');
      expect(title).toBe('zmcp-dv-ci-cd-f6c4g7');
    });

    it('should use known abbreviation for analysis', () => {
      const title = getProcessTitle('analysis', 'code-review', 'g7d5h8');
      expect(title).toBe('zmcp-an-code-review-g7d5h8');
    });

    it('should use known abbreviation for researcher', () => {
      const title = getProcessTitle('researcher', 'docs-study', 'h8e6i9');
      expect(title).toBe('zmcp-rs-docs-study-h8e6i9');
    });

    it('should use known abbreviation for implementer', () => {
      const title = getProcessTitle('implementer', 'feature-x', 'i9f7j0');
      expect(title).toBe('zmcp-im-feature-x-i9f7j0');
    });

    it('should use known abbreviation for reviewer', () => {
      const title = getProcessTitle('reviewer', 'pr-review', 'j0g8k1');
      expect(title).toBe('zmcp-rv-pr-review-j0g8k1');
    });

    it('should use first 2 chars for unknown agent type', () => {
      const title = getProcessTitle('customtype', 'project', 'id123');
      expect(title).toBe('zmcp-cu-project-id123');
    });

    it('should handle uppercase agent types', () => {
      const title = getProcessTitle('BACKEND', 'project', 'id123');
      expect(title).toBe('zmcp-be-project-id123');
    });

    it('should truncate long project names to 20 chars', () => {
      const longProject = 'this-is-a-very-long-project-name-that-exceeds-limit';
      const title = getProcessTitle('frontend', longProject, 'id123');
      // zmcp-fe-this-is-a-very-long--id123
      const parts = title.split('-');
      // Reconstruct the truncated project part (which may contain hyphens)
      const projectPart = parts.slice(2, -1).join('-');
      expect(projectPart).toBe('this-is-a-very-long-');
      expect(projectPart.length).toBe(20);
    });

    it('should not truncate project names under 20 chars', () => {
      const shortProject = 'short-project';
      const title = getProcessTitle('backend', shortProject, 'id123');
      expect(title).toBe('zmcp-be-short-project-id123');
    });

    it('should handle empty strings gracefully', () => {
      const title = getProcessTitle('unknown', '', 'id');
      expect(title).toBe('zmcp-un--id');
    });
  });

  describe('typeAbbreviations', () => {
    it('should have all expected type abbreviations', () => {
      const expectedTypes = {
        'backend': 'be',
        'frontend': 'fe',
        'testing': 'ts',
        'documentation': 'dc',
        'architect': 'ar',
        'devops': 'dv',
        'analysis': 'an',
        'researcher': 'rs',
        'implementer': 'im',
        'reviewer': 'rv'
      };
      
      expect(typeAbbreviations).toEqual(expectedTypes);
    });

    it('should have unique abbreviations', () => {
      const abbrs = Object.values(typeAbbreviations);
      const uniqueAbbrs = [...new Set(abbrs)];
      expect(abbrs.length).toBe(uniqueAbbrs.length);
    });

    it('should have 2-character abbreviations', () => {
      Object.values(typeAbbreviations).forEach(abbr => {
        expect(abbr.length).toBe(2);
      });
    });
  });

});