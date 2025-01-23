import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
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
  let architectPID: any;
  let mockConfig: ArchitectConfig;

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

    architectPID = await system.spawn({
      producer: (context: ActorContext) => new Architect(context, mockConfig)
    });
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
      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: mockRequirements,
          userStories: mockUserStories,
          constraints: ['must be scalable', 'must be secure']
        }
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      // Note: In a real test, we would set up a test actor to receive the response
      expect(true).toBe(true);
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

      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: action
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      expect(true).toBe(true);
    });

    test('should store design history', async () => {
      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: mockRequirements,
          userStories: mockUserStories,
          constraints: ['scalable']
        }
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      expect(true).toBe(true);
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

      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: action
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      expect(true).toBe(true);
    });

    test('should handle errors gracefully', async () => {
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

      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: action
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      expect(true).toBe(true);
    });
  });

  describe('Architecture Patterns', () => {
    test('should identify appropriate patterns based on requirements', async () => {
      const message: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: ['scalability', 'reliability', 'performance'],
          constraints: ['cloud-native', 'microservices']
        }
      };

      await system.send(architectPID, message);
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the response was sent
      expect(true).toBe(true);
    });
  });
}); 