import { expect, test } from "bun:test";
import { toTypedMessage, toBaseMessage } from "../typed/types";
import { Message as CoreMessage } from "../core/types";

test("与传统Actor系统的向后兼容性 > toTypedMessage和toBaseMessage应该正确转换消息", () => {
    const originalMessage: CoreMessage = {
        type: "test",
        payload: { data: "test data" },
        messageId: "test-id",
        metadata: {
            timestamp: Date.now(),
            correlationId: "test-correlation"
        }
    };

    // 测试 CoreMessage 到 BaseMessage 的转换
    const baseMessage = toBaseMessage(originalMessage);
    expect(baseMessage.type).toBe("test");
    expect(baseMessage.payload).toEqual({ data: "test data" });
    expect(baseMessage.messageId).toBe("test-id");
    expect(baseMessage.metadata).toBeDefined();
    expect(baseMessage.metadata?.correlationId).toBe("test-correlation");

    // 测试创建新的 TypedMessage
    const typedMessage = toTypedMessage("test", { data: "test data" }, {
        messageId: "test-id",
        metadata: {
            correlationId: "test-correlation"
        }
    });
    expect(typedMessage.type).toBe("test");
    expect(typedMessage.payload).toEqual({ data: "test data" });
    expect(typedMessage.messageId).toBe("test-id");
    expect(typedMessage.metadata).toBeDefined();
    expect(typedMessage.metadata?.correlationId).toBe("test-correlation");
    expect(typedMessage.metadata?.timestamp).toBeDefined();

    // 测试消息格式的一致性
    const convertedBack = toBaseMessage(typedMessage as CoreMessage);
    expect(convertedBack).toEqual({
        type: typedMessage.type,
        payload: typedMessage.payload,
        messageId: typedMessage.messageId,
        metadata: typedMessage.metadata,
        sender: typedMessage.sender
    });
});

test("简化的向后兼容性测试 > toTypedMessage和toBaseMessage应该正确转换消息", () => {
    // 测试最简单的消息转换
    const simpleTypedMessage = toTypedMessage("test", { value: 123 });
    expect(simpleTypedMessage.type).toBe("test");
    expect(simpleTypedMessage.payload).toEqual({ value: 123 });
    expect(simpleTypedMessage.messageId).toBeDefined();
    expect(simpleTypedMessage.metadata?.timestamp).toBeDefined();

    const simpleBaseMessage = toBaseMessage(simpleTypedMessage as CoreMessage);
    expect(simpleBaseMessage.type).toBe("test");
    expect(simpleBaseMessage.payload).toEqual({ value: 123 });
    expect(simpleBaseMessage.messageId).toBe(simpleTypedMessage.messageId);
    expect(simpleBaseMessage.metadata?.timestamp).toBe(simpleTypedMessage.metadata?.timestamp);
}); 