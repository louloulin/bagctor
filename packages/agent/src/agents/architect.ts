import { RoleAgent } from './role_agent';
import { ActorContext, Message } from '@bactor/core';
import { AgentMessage, isTaskPayload } from '../types';
import { 
  ArchitectConfig, 
  SystemDesign, 
  APISpec,
  ArchitectureDesignAction,
  APIDesignAction,
  RequirementAnalysis,
  UserStory,
  Action
} from '../interfaces/action_types';

export class Architect extends RoleAgent {
  private designsInProgress: Map<string, ArchitectureDesignAction>;
  private apiDesignsInProgress: Map<string, APIDesignAction>;
  private designHistory: Map<string, SystemDesign>;

  constructor(context: ActorContext, config: ArchitectConfig) {
    super(context, config);
    this.designsInProgress = new Map();
    this.apiDesignsInProgress = new Map();
    this.designHistory = new Map();
    this.initializeArchitectBehaviors();
  }

  protected behaviors(): void {
    super.behaviors();
    this.initializeArchitectBehaviors();
  }

  protected async processTask(action: Action): Promise<any> {
    if (action.type === 'DESIGN_ARCHITECTURE') {
      return await this.handleSystemDesign({
        type: 'TASK',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          type: 'TASK',
          action: action as ArchitectureDesignAction
        }
      });
    } else if (action.type === 'DESIGN_API') {
      return await this.handleAPIDesign({
        type: 'TASK',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          type: 'TASK',
          action: action as APIDesignAction
        }
      });
    } else {
      throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  private initializeArchitectBehaviors(): void {
    // Add system design behavior
    this.addBehavior('system_design', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (isTaskPayload(agentMessage.payload) && 
          agentMessage.payload.action.type === 'DESIGN_ARCHITECTURE') {
        await this.handleSystemDesign(agentMessage);
      }
    });

    // Add API design behavior
    this.addBehavior('api_design', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (isTaskPayload(agentMessage.payload) && 
          agentMessage.payload.action.type === 'DESIGN_API') {
        await this.handleAPIDesign(agentMessage);
      }
    });
  }

  private async handleSystemDesign(message: AgentMessage): Promise<void> {
    if (!isTaskPayload(message.payload)) return;
    const action = message.payload.action as ArchitectureDesignAction;
    this.designsInProgress.set(action.id, action);

    try {
      // 1. Analyze requirements and user stories
      const designContext = await this.analyzeDesignContext(
        action.input.requirements,
        action.input.userStories,
        action.input.constraints
      );

      // 2. Create system architecture
      const architecture = await this.createArchitecture(designContext);

      // 3. Design data structures
      const dataStructures = await this.designDataStructures(designContext);

      // 4. Define APIs
      const apis = await this.defineAPIs(architecture, dataStructures);

      // 5. Create complete system design
      const systemDesign: SystemDesign = {
        architecture,
        dataStructures,
        apis
      };

      // 6. Update action status and store design
      action.status = 'COMPLETED';
      action.output = systemDesign;
      this.designHistory.set(action.id, systemDesign);

      await this.tell(message.sender, {
        type: 'RESULT',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: action.id,
          result: systemDesign
        }
      });

    } catch (error) {
      action.status = 'FAILED';
      if (error instanceof Error) {
        action.error = error;
      } else {
        action.error = new Error(String(error));
      }

      await this.tell(message.sender, {
        type: 'ERROR',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: action.id,
          error: action.error
        }
      });
    }
  }

  private async handleAPIDesign(message: AgentMessage): Promise<void> {
    if (!isTaskPayload(message.payload)) return;
    const action = message.payload.action as APIDesignAction;
    this.apiDesignsInProgress.set(action.id, action);

    try {
      // 1. Analyze system design
      const apis = await this.designAPIs(
        action.input.systemDesign,
        action.input.requirements
      );

      // 2. Update action status
      action.status = 'COMPLETED';
      action.output = apis;

      await this.tell(message.sender, {
        type: 'RESULT',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: action.id,
          result: apis
        }
      });

    } catch (error) {
      action.status = 'FAILED';
      if (error instanceof Error) {
        action.error = error;
      } else {
        action.error = new Error(String(error));
      }

      await this.tell(message.sender, {
        type: 'ERROR',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: action.id,
          error: action.error
        }
      });
    }
  }

  // Helper methods for system design
  private async analyzeDesignContext(
    requirements: RequirementAnalysis,
    userStories: UserStory[],
    constraints: string[]
  ): Promise<any> {
    // Implement design context analysis
    return {
      functionalRequirements: requirements,
      userStories,
      constraints,
      patterns: this.identifyArchitecturalPatterns(requirements, constraints)
    };
  }

  private async createArchitecture(designContext: any): Promise<any> {
    // Implement architecture creation
    return {
      components: [],
      dataFlow: '',
      deployment: ''
    };
  }

  private async designDataStructures(designContext: any): Promise<any> {
    // Implement data structure design
    return [];
  }

  private async defineAPIs(architecture: any, dataStructures: any): Promise<APISpec[]> {
    // Implement API definition
    return [];
  }

  private async designAPIs(systemDesign: SystemDesign, requirements: string[]): Promise<APISpec[]> {
    // Implement detailed API design
    return [];
  }

  private identifyArchitecturalPatterns(requirements: RequirementAnalysis, constraints: string[]): string[] {
    // Implement pattern identification
    return [];
  }

  // Public methods for external interaction
  public async createSystemDesign(
    requirements: RequirementAnalysis,
    userStories: UserStory[],
    constraints: string[]
  ): Promise<SystemDesign> {
    const architectureAction: ArchitectureDesignAction = {
      id: `ARCH-${Date.now()}`,
      type: 'DESIGN_ARCHITECTURE',
      status: 'PENDING',
      priority: 'high',
      context: {
        role: 'architect',
        dependencies: [],
        resources: ['design_patterns', 'architecture_templates'],
        constraints: []
      },
      input: {
        requirements,
        userStories,
        constraints
      },
      metadata: {
        createdAt: new Date()
      }
    };

    await this.handleSystemDesign({
      type: 'TASK',
      sender: this.agentContext.self,
      timestamp: Date.now(),
      payload: {
        type: 'TASK',
        action: architectureAction
      }
    });

    return architectureAction.output as SystemDesign;
  }
} 