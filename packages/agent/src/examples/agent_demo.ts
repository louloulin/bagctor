import { ActorContext, ActorSystem, Message, PID } from '@bactor/core';
import { AgentConfig } from '../types';
import { AssistantAgent, AssistantConfig } from '../agents/assistant_agent';
import { ProductManager } from '../agents/product_manager';
import { Architect } from '../agents/architect';
import { ProductManagerConfig, ArchitectConfig } from '../interfaces/action_types';

async function main() {
  // Initialize actor system
  const system = new ActorSystem();
  await system.start();  // 确保系统启动

  // Create agents
  const productManagerConfig: ProductManagerConfig = {
    role: 'product_manager',
    capabilities: [
      'requirement_analysis',
      'user_story_creation',
      'market_research',
      'feature_prioritization'
    ],
    parameters: {
      analysisDepth: 'detailed',
      marketFocus: ['enterprise', 'saas'],
      prioritizationCriteria: ['business_value', 'technical_feasibility']
    }
  };

  const architectConfig: ArchitectConfig = {
    role: 'architect',
    capabilities: [
      'system_design',
      'api_design',
      'data_modeling',
      'security_planning'
    ],
    parameters: {
      architectureStyle: 'microservices',
      securityLevel: 'advanced',
      scalabilityRequirements: ['high_availability', 'horizontal_scaling']
    }
  };

  const assistantConfig: AssistantConfig = {
    role: 'assistant',
    capabilities: ['task_assistance', 'coordination'],
    parameters: {
      responseStyle: 'concise',
      expertise: ['technical', 'product'],
      contextMemory: 5
    }
  };

  // Create actors
  const productManager = await system.spawn({
    producer: (props: ActorContext) => new ProductManager(props, productManagerConfig)
  });

  const architect = await system.spawn({
    producer: (props: ActorContext) => new Architect(props, architectConfig)
  });

  const assistant = await system.spawn({
    producer: (props: ActorContext) => new AssistantAgent(props, assistantConfig)
  });

  // Example interaction
  const message: Message = {
    type: 'TASK',
    payload: {
      type: 'TASK',
      action: {
        id: 'REQ-1',
        type: 'ANALYZE_REQUIREMENT',
        status: 'PENDING',
        priority: 'high',
        context: {
          role: 'product_manager',
          dependencies: [],
          resources: ['market_data'],
          constraints: []
        },
        input: {
          rawRequirement: 'Build a scalable microservices architecture',
          context: 'Enterprise SaaS platform',
          constraints: ['budget', 'timeline']
        },
        metadata: {
          createdAt: new Date()
        }
      }
    },
    sender: productManager
  };
  
  await system.send(productManager, message);

  // Wait for some time to see the results
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Cleanup
  await system.stop();
}

main().catch(console.error); 