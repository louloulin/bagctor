import { expect, test, describe } from "bun:test";
import {
    NodeStatus,
    ClusterEventType,
    RecoveryPolicy,
    BackpressureStrategy
} from "../src/types";

describe('Types', () => {
    test('enums are exported correctly', () => {
        // 测试 NodeStatus 枚举
        expect(NodeStatus).toBeDefined();
        expect(NodeStatus.ACTIVE).toBe('ACTIVE');
        expect(NodeStatus.JOINING).toBe('JOINING');
        expect(NodeStatus.SUSPECTED).toBe('SUSPECTED');
        expect(NodeStatus.DEAD).toBe('DEAD');
        expect(NodeStatus.LEAVING).toBe('LEAVING');

        // 测试 ClusterEventType 枚举
        expect(ClusterEventType).toBeDefined();
        expect(ClusterEventType.NODE_JOINED).toBe('NODE_JOINED');
        expect(ClusterEventType.NODE_LEFT).toBe('NODE_LEFT');

        // 测试 RecoveryPolicy 枚举
        expect(RecoveryPolicy).toBeDefined();
        expect(RecoveryPolicy.IMMEDIATE).toBe('IMMEDIATE');
        expect(RecoveryPolicy.GRADUAL).toBe('GRADUAL');
        expect(RecoveryPolicy.EXPONENTIAL).toBe('EXPONENTIAL');
        expect(RecoveryPolicy.ADAPTIVE).toBe('ADAPTIVE');

        // 测试 BackpressureStrategy 枚举
        expect(BackpressureStrategy).toBeDefined();
        expect(BackpressureStrategy.ADAPTIVE).toBe('ADAPTIVE');
    });
}); 