import { test, expect, describe } from 'bun:test';
import { AgentSystem } from '../src/core/agentSystem';

describe('Agent System Basic', () => {
    test('应该能够创建一个代理系统', () => {
        const agentSystem = new AgentSystem({ systemId: 'test-system' });
        expect(agentSystem).toBeDefined();
    });
}); 