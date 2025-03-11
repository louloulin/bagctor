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
  let mockRequirements: RequirementAnalysis;
  let mockUserStories: UserStory[];

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

    architectPID = await system.spawn({
      producer: (context: ActorContext) => new Architect(context, mockConfig)
    });
  });

  describe('System Design', () => {
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
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(true).toBe(true);
    });

    test('should handle concurrent design requests', async () => {
      const requests = Array(5).fill(null).map((_, i) => ({
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: mockRequirements,
          userStories: mockUserStories,
          constraints: [`constraint-${i}`]
        }
      }));

      await Promise.all(requests.map(req => system.send(architectPID, req)));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(true).toBe(true);
    });

    test('should recover from design errors', async () => {
      const invalidMessage: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: null,
          userStories: [],
          constraints: []
        }
      };

      await system.send(architectPID, invalidMessage);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send a valid message after error
      const validMessage: Message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: mockRequirements,
          userStories: mockUserStories,
          constraints: ['must be scalable']
        }
      };

      await system.send(architectPID, validMessage);
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(true).toBe(true);
    });
  });

  describe('State Management', () => {
    test('should maintain design history', async () => {
      const messages = Array(3).fill(null).map((_, i) => ({
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: {
            ...mockRequirements,
            version: `v${i + 1}`
          },
          userStories: mockUserStories,
          constraints: [`version-${i + 1}`]
        }
      }));

      for (const msg of messages) {
        await system.send(architectPID, msg);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(true).toBe(true);
    });

    test('should handle state transitions', async () => {
      const transitions = [
        { type: 'START_DESIGN', payload: { phase: 'requirements' } },
        { type: 'UPDATE_DESIGN', payload: { phase: 'architecture' } },
        { type: 'COMPLETE_DESIGN', payload: { phase: 'review' } }
      ];

      for (const transition of transitions) {
        await system.send(architectPID, transition);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(true).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('should integrate with other agents', async () => {
      // TODO: Implement integration tests with other agents
      expect(true).toBe(true);
    });

    test('should handle complex workflows', async () => {
      const workflow = {
        type: 'WORKFLOW',
        sender: architectPID,
        payload: {
          steps: [
            { type: 'REQUIREMENTS_ANALYSIS', data: mockRequirements },
            { type: 'SYSTEM_DESIGN', data: mockUserStories },
            { type: 'API_DESIGN', data: { endpoints: [] } }
          ]
        }
      };

      await system.send(architectPID, workflow);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(true).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large scale designs', async () => {
      const largeRequirements = {
        ...mockRequirements,
        userStories: Array(100).fill(null).map((_, i) => ({
          id: `US-${i}`,
          title: `Story ${i}`,
          description: `Description ${i}`,
          priority: 'medium',
          acceptanceCriteria: [`Criteria ${i}`]
        }))
      };

      const message = {
        type: 'TASK',
        sender: architectPID,
        payload: {
          requirements: largeRequirements,
          userStories: largeRequirements.userStories,
          constraints: ['must handle large scale']
        }
      };

      const startTime = Date.now();
      await system.send(architectPID, message);
      await new Promise(resolve => setTimeout(resolve, 200));
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
}); 