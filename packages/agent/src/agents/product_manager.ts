import { RoleAgent } from './role_agent';
import { ActorContext } from '@bactor/core';
import { AgentMessage, AgentConfig, isTaskPayload } from '../types';
import {
  Action,
  RequirementAnalysisAction,
  UserStoryCreationAction,
  RequirementAnalysis,
  UserStory,
  ProductManagerConfig
} from '../interfaces/action_types';

export class ProductManager extends RoleAgent {
  private config: ProductManagerConfig;

  constructor(context: ActorContext, config: ProductManagerConfig) {
    super(context, config);
    this.config = config;
  }

  protected async processTask(action: Action): Promise<any> {
    if (action.type === 'ANALYZE_REQUIREMENT') {
      return await this.handleRequirementAnalysis(action as RequirementAnalysisAction);
    } else if (action.type === 'CREATE_USER_STORY') {
      return await this.handleUserStoryCreation(action as UserStoryCreationAction);
    } else {
      throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  protected async processCoordination(action: string, data: any): Promise<any> {
    // Process coordination based on product manager capabilities
    switch (action) {
      case 'UPDATE_REQUIREMENTS':
        return await this.updateRequirements(data);
      case 'PRIORITIZE_STORIES':
        return await this.prioritizeStories(data);
      case 'ANALYZE_MARKET':
        return await this.analyzeMarket(data);
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async handleRequirementAnalysis(action: RequirementAnalysisAction): Promise<RequirementAnalysis> {
    try {
      if (!action.metadata) {
        throw new Error('Invalid requirement analysis request: missing metadata');
      }

      const { rawRequirement, context, constraints } = action.metadata;

      // Perform market analysis
      const marketAnalysis = await this.performMarketAnalysis(rawRequirement);

      // Create user stories
      const userStories = await this.createInitialUserStories(rawRequirement, context);

      // Analyze feasibility
      const feasibilityAnalysis = await this.analyzeFeasibility(userStories, constraints || []);

      const analysis: RequirementAnalysis = {
        userStories,
        marketAnalysis,
        feasibilityAnalysis
      };

      return analysis;

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  private async handleUserStoryCreation(action: UserStoryCreationAction): Promise<UserStory[]> {
    try {
      if (!action.metadata) {
        throw new Error('Invalid user story creation request: missing metadata');
      }

      const { requirement, scope } = action.metadata;
      if (!requirement) {
        throw new Error('Invalid user story creation request: missing requirement');
      }

      const userStories = await this.generateUserStories(requirement, scope);
      return userStories;

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  private async performMarketAnalysis(requirement: string): Promise<any> {
    // Implement market analysis logic
    return {
      competitors: ['Competitor A', 'Competitor B'],
      uniqueSellingPoints: ['Feature X', 'Feature Y'],
      targetUsers: ['User Segment 1', 'User Segment 2']
    };
  }

  private async createInitialUserStories(requirement: string, context: string): Promise<UserStory[]> {
    // Implement user story creation logic
    return [
      {
        id: `US-${Date.now()}-1`,
        title: 'Example User Story 1',
        description: `As a user, I want to ${requirement}`,
        priority: 'high',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2']
      }
    ];
  }

  private async analyzeFeasibility(userStories: UserStory[], constraints: string[]): Promise<any> {
    // Implement feasibility analysis logic
    return {
      technicalRisks: ['Risk 1', 'Risk 2'],
      resourceRequirements: ['Resource 1', 'Resource 2'],
      timeline: '2 weeks'
    };
  }

  private async generateUserStories(requirement: RequirementAnalysis, scope: string): Promise<UserStory[]> {
    // Implement detailed user story generation logic
    return requirement.userStories.map(story => ({
      ...story,
      description: `${story.description} (Scope: ${scope})`
    }));
  }

  private async updateRequirements(data: any): Promise<RequirementAnalysis> {
    // Implement requirement update logic
    return {
      userStories: data.userStories,
      marketAnalysis: data.marketAnalysis,
      feasibilityAnalysis: data.feasibilityAnalysis
    };
  }

  private async prioritizeStories(data: any): Promise<UserStory[]> {
    // Implement story prioritization logic
    return data.userStories.sort((a: UserStory, b: UserStory) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private async analyzeMarket(data: any): Promise<any> {
    if (!data.market || !data.competitors || !data.targetUsers) {
      throw new Error('Invalid market analysis request: missing required fields');
    }

    return {
      analysis: {
        marketSize: 'Large',
        growthRate: '15%',
        competitors: data.competitors.map((c: string) => ({
          name: c,
          strengths: ['Feature A', 'Feature B'],
          weaknesses: ['Weakness X', 'Weakness Y']
        })),
        targetUsers: data.targetUsers.map((u: string) => ({
          segment: u,
          needs: ['Need 1', 'Need 2'],
          painPoints: ['Pain 1', 'Pain 2']
        }))
      },
      recommendations: [
        'Focus on unique value proposition',
        'Target underserved segments',
        'Differentiate through innovation'
      ]
    };
  }
} 