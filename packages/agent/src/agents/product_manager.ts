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
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async handleRequirementAnalysis(action: RequirementAnalysisAction): Promise<RequirementAnalysis> {
    try {
      // Analyze requirements based on input
      const { rawRequirement, context, constraints } = action.input;

      // Perform market analysis
      const marketAnalysis = await this.performMarketAnalysis(rawRequirement);

      // Create user stories
      const userStories = await this.createInitialUserStories(rawRequirement, context);

      // Analyze feasibility
      const feasibilityAnalysis = await this.analyzeFeasibility(userStories, constraints);

      const analysis: RequirementAnalysis = {
        userStories,
        marketAnalysis,
        feasibilityAnalysis
      };

      action.status = 'COMPLETED';
      action.output = analysis;

      return analysis;

    } catch (error) {
      action.status = 'FAILED';
      if (error instanceof Error) {
        action.error = error;
      } else {
        action.error = new Error(String(error));
      }
      throw action.error;
    }
  }

  private async handleUserStoryCreation(action: UserStoryCreationAction): Promise<UserStory[]> {
    try {
      // Create user stories based on requirement analysis
      const { requirement, scope } = action.input;
      const userStories = await this.generateUserStories(requirement, scope);

      action.status = 'COMPLETED';
      action.output = userStories;

      return userStories;

    } catch (error) {
      action.status = 'FAILED';
      if (error instanceof Error) {
        action.error = error;
      } else {
        action.error = new Error(String(error));
      }
      throw action.error;
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
} 