import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorService } from '../src/cli/monitor';

describe('Monitor Command', () => {
  let mockDb: any;
  let mockRepos: any;
  let mockServices: any;

  beforeEach(() => {
    // Mock database
    mockDb = {
      getDb: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([])
      })
    };

    // Mock repositories
    mockRepos = {
      agentRepo: {
        getAll: vi.fn().mockResolvedValue([]),
        getByStatus: vi.fn().mockResolvedValue([])
      },
      taskRepo: {
        getAll: vi.fn().mockResolvedValue([]),
        getByStatus: vi.fn().mockResolvedValue([])
      },
      commRepo: {
        getRooms: vi.fn().mockResolvedValue([]),
        getParticipants: vi.fn().mockResolvedValue([]),
        getMessages: vi.fn().mockResolvedValue([])
      },
      knowledgeRepo: {
        searchEntities: vi.fn().mockResolvedValue([])
      },
      memoryRepo: {
        search: vi.fn().mockResolvedValue([])
      }
    };

    // Mock services
    mockServices = {
      agentService: mockRepos.agentRepo,
      taskService: mockRepos.taskRepo,
      commService: mockRepos.commRepo,
      memoryService: mockRepos.memoryRepo
    };
  });

  describe('MonitorService', () => {
    it('should initialize with default options', () => {
      const monitor = new MonitorService(mockDb, mockRepos, mockServices);
      expect(monitor).toBeDefined();
      expect(monitor.options.output).toBe('cli');
      expect(monitor.options.watch).toBe(false);
    });

    it('should collect agent data', async () => {
      const mockAgents = [
        {
          id: 'agent1',
          agentName: 'test-agent',
          status: 'active',
          repositoryPath: '/test/path'
        }
      ];
      mockRepos.agentRepo.getAll.mockResolvedValue(mockAgents);

      const monitor = new MonitorService(mockDb, mockRepos, mockServices);
      const data = await monitor.collectData();

      expect(data.agents).toHaveLength(1);
      expect(data.agents[0].agentName).toBe('test-agent');
    });

    it('should collect task data', async () => {
      const mockTasks = [
        {
          id: 'task1',
          taskType: 'feature',
          status: 'in_progress',
          description: 'Test task'
        }
      ];
      mockRepos.taskRepo.getAll.mockResolvedValue(mockTasks);

      const monitor = new MonitorService(mockDb, mockRepos, mockServices);
      const data = await monitor.collectData();

      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].description).toBe('Test task');
    });

    it('should format data for JSON output', async () => {
      const monitor = new MonitorService(mockDb, mockRepos, mockServices, {
        output: 'json'
      });

      const data = await monitor.collectData();
      const formatted = monitor.formatData(data);

      expect(formatted).toContain('"timestamp"');
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('should format data for HTML output', async () => {
      const monitor = new MonitorService(mockDb, mockRepos, mockServices, {
        output: 'html'
      });

      const data = await monitor.collectData();
      const formatted = monitor.formatData(data);

      expect(formatted).toContain('<!DOCTYPE html>');
      expect(formatted).toContain('<title>MCP Tools Monitor</title>');
    });

    it('should apply repository filter', async () => {
      const monitor = new MonitorService(mockDb, mockRepos, mockServices, {
        repository: '/specific/repo'
      });

      await monitor.collectData();

      expect(mockRepos.agentRepo.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/specific/repo'
        })
      );
    });

    it('should handle watch mode refresh', async () => {
      const monitor = new MonitorService(mockDb, mockRepos, mockServices, {
        watch: true,
        refresh: 1
      });

      const collectSpy = vi.spyOn(monitor, 'collectData');
      const stopSpy = vi.spyOn(monitor, 'stop');

      // Start monitoring
      monitor.start();

      // Wait for initial collection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop monitoring
      monitor.stop();

      expect(collectSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});