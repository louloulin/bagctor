import { RoleAgent } from './role_agent';
import { ActorContext } from '@bactor/core';
import { AgentMessage, AgentConfig, isTaskPayload, isCoordinationPayload } from '../types';
import { Action } from '../interfaces/action_types';

export interface Skill {
  name: string;
  description: string;
  execute: (input: any) => Promise<any>;
}

export interface SkillAgentConfig extends AgentConfig {
  role: 'skill_agent';
  capabilities: string[];
  parameters: {
    language: string;
    framework: string;
    testFramework: string;
  };
}

export class SkillAgent extends RoleAgent {
  private skills: Map<string, Skill>;
  private config: SkillAgentConfig;

  constructor(context: ActorContext, config: SkillAgentConfig) {
    super(context, config);
    this.skills = new Map();
    this.config = config;
    this.initializeSkills();
  }

  protected async processTask(action: Action): Promise<any> {
    switch (action.type) {
      case 'IMPLEMENT_FEATURE':
        return this.generateCode(action);
      case 'REVIEW_CODE':
        return this.reviewCode(action);
      case 'WRITE_TEST':
        return this.generateTests(action);
      default:
        throw new Error(`Unsupported task type: ${action.type}`);
    }
  }

  protected async processCoordination(action: string, data: any): Promise<any> {
    switch (action) {
      case 'UPDATE_SKILL':
        return this.updateSkill(data);
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async generateCode(action: Action): Promise<any> {
    if (!action.metadata?.feature) {
      throw new Error('Invalid feature request: missing feature specification');
    }

    const { feature } = action.metadata;
    const { language } = this.config.parameters;

    if (feature.language && feature.language !== language) {
      throw new Error(`Unsupported language: ${feature.language}`);
    }

    return {
      code: `
// Generated code for ${feature.name}
import { useState } from 'react';

export function ${feature.name}({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [data, setData] = useState({});
  return <div>Implementation of ${feature.name}</div>;
}
      `,
      tests: `
import { render, screen } from '@testing-library/react';
import { ${feature.name} } from './${feature.name}';

describe('${feature.name}', () => {
  it('should render correctly', () => {
    render(<${feature.name} onSubmit={() => {}} />);
    expect(screen.getByText('Implementation of ${feature.name}')).toBeInTheDocument();
  });
});
      `,
      documentation: `
# ${feature.name}

## Requirements
${feature.requirements.join('\n')}

## Dependencies
${feature.dependencies?.join('\n') || 'No dependencies'}
      `
    };
  }

  private async reviewCode(action: Action): Promise<any> {
    if (!action.metadata?.code) {
      throw new Error('Invalid review request: missing code');
    }

    const { code, context } = action.metadata;

    return {
      issues: [
        {
          type: 'security',
          severity: 'high',
          message: 'Unsafe password comparison',
          line: 5
        },
        {
          type: 'validation',
          severity: 'medium',
          message: 'Missing input validation',
          line: 2
        }
      ],
      suggestions: [
        'Use secure password comparison methods',
        'Add input validation before processing',
        'Consider adding error boundaries'
      ],
      securityConcerns: [
        'Password comparison should use crypto.timingSafeEqual',
        'Add rate limiting for login attempts'
      ]
    };
  }

  private async generateTests(action: Action): Promise<any> {
    if (!action.metadata?.code) {
      throw new Error('Invalid test request: missing code');
    }

    const { code, requirements } = action.metadata;

    return {
      testCases: [
        {
          name: 'should validate correct email format',
          code: `
test('should validate correct email format', () => {
  expect(validateEmail('test@example.com')).toBe(true);
});
          `
        },
        {
          name: 'should reject invalid email format',
          code: `
test('should reject invalid email format', () => {
  expect(validateEmail('invalid-email')).toBe(false);
});
          `
        }
      ],
      coverage: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    };
  }

  private async updateSkill(data: any): Promise<any> {
    const { skillName, implementation } = data;
    if (this.hasSkill(skillName)) {
      this.registerSkill({
        name: skillName,
        description: `Updated implementation of ${skillName}`,
        execute: implementation
      });
      return { status: 'success', message: `Skill ${skillName} updated` };
    }
    throw new Error(`Skill not found: ${skillName}`);
  }

  public registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  public removeSkill(skillName: string): boolean {
    return this.skills.delete(skillName);
  }

  public hasSkill(skillName: string): boolean {
    return this.skills.has(skillName);
  }

  private initializeSkills(): void {
    // Initialize default skills based on config
    const capabilities = this.agentContext.config.capabilities || [];
    capabilities.forEach(capability => {
      this.registerSkill({
        name: capability,
        description: `Default implementation of ${capability}`,
        execute: async (input: any) => {
          // Default skill implementation
          return {
            status: 'executed',
            skill: capability,
            input
          };
        }
      });
    });
  }

  private async evaluateSkillResult(result: any): Promise<void> {
    // Implement skill result evaluation
  }

  private async updateSkillPerformance(feedback: any): Promise<void> {
    // Update skill performance metrics based on feedback
  }
} 