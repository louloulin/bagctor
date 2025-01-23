import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext } from '@bactor/core';
import { Architect } from '../architect';
import { 
  ArchitectConfig, 
  RequirementAnalysis, 
  UserStory, 
  SystemDesign,
  APISpec,
  ArchitectureDesignAction,
  APIDesignAction,
  AgentMessage
} from '../../interfaces';

describe('Architect Agent', () => {
  let system: ActorSystem;
  let architect: Architect;
  let mockConfig: ArchitectConfig;
  let context: ActorContext;

  beforeAll(async () => {
    system = new ActorSystem();
    await system.start();
  });

  afterAll(async () => {
    await system.stop();
  });

  beforeEach(async () => {
    mockConfig = {
      role: 'architect',
      capabilities: [
        'system_design',
        'api_design',
        'data_modeling',
        'security_planning'
      ],
      parameters: {
        architectureStyle: 'microservices',
        securityLevel: 'basic',
        scalabilityRequirements: ['horizontal-scaling']
      }
    };

    // 先创建一个临时 actor 来获取 context
    const tempActor = await system.spawn({
      producer: (ctx: ActorContext) => {
        context = ctx;
        return new Architect(ctx, mockConfig);
      }
    });

    architect = new Architect(context, mockConfig);
  });

  describe('System Design', () => {
    let mockRequirements: RequirementAnalysis;
    let mockUserStories: UserStory[];

    beforeEach(() => {
      mockRequirements = {
        userStories: [],
        marketAnalysis: {
          competitors: ['competitor1'],
          uniqueSellingPoints: ['unique1'],
          targetUsers: ['user1']
        },
        feasibilityAnalysis: {
          technicalRisks: ['risk1'],
          resourceRequirements: ['resource1'],
          timeline: '3 months'
        }
      };

      mockUserStories = [
        {
          id: 'US-001',
          title: 'User Registration',
          description: 'As a user, I want to register an account',
          priority: 'high',
          acceptanceCriteria: ['Email verification', 'Password validation']
        }
      ];
    });

    test('should create system design from requirements and user stories', async () => {
      const constraints = ['must be scalable', 'must be secure'];
      const design = await architect.createSystemDesign(
        mockRequirements,
        mockUserStories,
        constraints
      );

      expect(design).toBeDefined();
      expect(design.architecture).toBeDefined();
      expect(design.dataStructures).toBeDefined();
      expect(design.apis).toBeDefined();
    });

    test('should handle system design task', async () => {
      const action: ArchitectureDesignAction = {
        id: 'ARCH-001',
        type: 'DESIGN_ARCHITECTURE',
        status: 'PENDING',
        priority: 'high',
        context: {
          role: 'architect',
          dependencies: [],
          resources: [],
          constraints: []
        },
        input: {
          requirements: mockRequirements,
          userStories: mockUserStories,
          constraints: ['scalable']
        },
        metadata: {}
      };

      const mockTell = mock<(target: any, message: AgentMessage) => Promise<void>>(async () => {});
      (architect as any).tell = mockTell;
      
      await (architect as any).handleSystemDesign({
        type: 'TASK',
        sender: context.self,
        timestamp: Date.now(),
        payload: action
      });

      expect(mockTell).toHaveBeenCalled();
      const [[_, response]] = mockTell.mock.calls;
      expect(response.type).toBe('RESULT');
      expect(response.payload.result).toBeDefined();
    });

    test('should store design history', async () => {
      const design = await architect.createSystemDesign(
        mockRequirements,
        mockUserStories,
        ['scalable']
      );

      // Access private field for testing
      const history = (architect as any).designHistory;
      expect(history.size).toBeGreaterThan(0);
      const storedDesign = Array.from(history.values())[0];
      expect(storedDesign).toBeDefined();
    });
  });

  describe('API Design', () => {
    let mockSystemDesign: SystemDesign;

    beforeEach(() => {
      mockSystemDesign = {
        architecture: {
          components: [
            {
              name: 'UserService',
              responsibility: 'Handle user operations',
              dependencies: [],
              apis: []
            }
          ],
          dataFlow: 'graph TD;A-->B',
          deployment: 'graph TD;A-->B'
        },
        dataStructures: [
          {
            name: 'User',
            fields: [
              {
                name: 'id',
                type: 'string',
                description: 'User ID'
              }
            ],
            relationships: []
          }
        ],
        apis: []
      };
    });

    test('should handle API design task', async () => {
      const action: APIDesignAction = {
        id: 'API-001',
        type: 'DESIGN_API',
        status: 'PENDING',
        priority: 'high',
        context: {
          role: 'architect',
          dependencies: [],
          resources: [],
          constraints: []
        },
        input: {
          systemDesign: mockSystemDesign,
          requirements: ['RESTful', 'JSON responses']
        },
        metadata: {}
      };

      const mockTell = mock<(target: any, message: AgentMessage) => Promise<void>>(async () => {});
      (architect as any).tell = mockTell;
      
      await (architect as any).handleAPIDesign({
        type: 'TASK',
        sender: context.self,
        timestamp: Date.now(),
        payload: action
      });

      expect(mockTell).toHaveBeenCalled();
      const [[_, response]] = mockTell.mock.calls;
      expect(response.type).toBe('RESULT');
      expect(response.payload.result).toBeDefined();
    });

    test('should handle errors gracefully', async () => {
      const mockTell = mock<(target: any, message: AgentMessage) => Promise<void>>(async () => {});
      (architect as any).tell = mockTell;
      
      const mockDesignAPIs = mock<(systemDesign: SystemDesign, requirements: string[]) => Promise<APISpec[]>>(() => {
        throw new Error('API design failed');
      });
      (architect as any).designAPIs = mockDesignAPIs;

      const action: APIDesignAction = {
        id: 'API-002',
        type: 'DESIGN_API',
        status: 'PENDING',
        priority: 'high',
        context: {
          role: 'architect',
          dependencies: [],
          resources: [],
          constraints: []
        },
        input: {
          systemDesign: mockSystemDesign,
          requirements: ['invalid']
        },
        metadata: {}
      };

      await (architect as any).handleAPIDesign({
        type: 'TASK',
        sender: context.self,
        timestamp: Date.now(),
        payload: action
      });

      expect(mockTell).toHaveBeenCalled();
      const [[_, response]] = mockTell.mock.calls;
      expect(response.type).toBe('ERROR');
      expect(response.payload.error).toBeDefined();
    });
  });

  describe('Architecture Patterns', () => {
    test('should identify appropriate patterns based on requirements', async () => {
      const mockRequirements: RequirementAnalysis = {
        userStories: [],
        marketAnalysis: {
          competitors: [],
          uniqueSellingPoints: ['high-scalability'],
          targetUsers: []
        },
        feasibilityAnalysis: {
          technicalRisks: ['high-load'],
          resourceRequirements: ['distributed-system'],
          timeline: '6 months'
        }
      };

      const patterns = (architect as any).identifyArchitecturalPatterns(
        mockRequirements,
        ['must handle high load']
      );

      expect(Array.isArray(patterns)).toBe(true);
    });
  });
}); 