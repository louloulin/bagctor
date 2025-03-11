/**
 * Tool Factory for Bactor Agent
 */

import { Tool } from "../tools";
import { ActorSystem, PID } from "@bactor/core";

export interface ToolFactoryConfig {
    actorSystem: ActorSystem;
}

export class ToolFactory {
    private tools = new Map();
    private actorSystem: ActorSystem;

    constructor(config: ToolFactoryConfig) {
        this.actorSystem = config.actorSystem;
    }

    register(name: string, tool: any): void {
        this.tools.set(name, tool);
    }

    registerAll(tools: Record<string, any>): void {
        Object.entries(tools).forEach(([name, tool]) => {
            this.register(name, tool);
        });
    }

    getTool(name: string): any {
        return this.tools.get(name);
    }

    getAllTools(): Record<string, any> {
        return Object.fromEntries(this.tools.entries());
    }

    async executeTool(name: string, params: any, caller?: PID): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        return await tool.execute(params);
    }
}

export function createToolFactory(config: ToolFactoryConfig): ToolFactory {
    return new ToolFactory(config);
}
