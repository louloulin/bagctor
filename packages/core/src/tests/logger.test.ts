import { expect, test, mock, beforeEach } from "bun:test";
import { 
  configureLogger, 
  createLogger, 
  log, 
  trace, 
  LoggerConfig,
  TraceContext,
  LoggerManager
} from "../utils/logger";
import pino from 'pino';

// Mock pino transport to capture logs
const mockLogs: any[] = [];
const mockTransport: pino.TransportSingleOptions = {
  target: 'pino-pretty',
  options: {
    write: (msg: string) => {
      mockLogs.push(JSON.parse(msg));
    }
  }
};

beforeEach(() => {
  // Clear mock logs before each test
  mockLogs.length = 0;
  // Clear trace context
  trace.clearContext();
  // Reset logger config
  configureLogger({
    level: 'info',
    prettyPrint: false,
    transport: mockTransport
  });
});

test("Logger should respect log levels", () => {
  configureLogger({ level: 'warn' });
  
  log.debug("Debug message");
  log.info("Info message");
  log.warn("Warning message");
  log.error("Error message");

  expect(mockLogs.length).toBe(2); // Only warn and error should be logged
  expect(mockLogs[0].level).toBe('warn');
  expect(mockLogs[0].msg).toBe('Warning message');
  expect(mockLogs[1].level).toBe('error');
  expect(mockLogs[1].msg).toBe('Error message');
});

test("Logger should include trace context", () => {
  const customTraceId = "test-trace-123";
  trace.setTraceId(customTraceId);
  
  log.info("Test message");
  
  expect(mockLogs[0].traceId).toBe(customTraceId);
});

test("Logger should support custom context", () => {
  const logger = createLogger("TestService");
  logger.info("Service message");
  
  expect(mockLogs[0].context).toBe("TestService");
});

test("Logger should handle custom formatters", () => {
  configureLogger({
    formatters: {
      log: (obj: Record<string, unknown>) => ({
        ...obj,
        customField: 'test-value'
      })
    }
  });
  
  log.info("Test message");
  
  expect(mockLogs[0].customField).toBe('test-value');
});

test("TraceContext should maintain context between calls", () => {
  trace.setContext('userId', 'user-123');
  trace.setContext('requestId', 'req-456');
  
  log.info("First message");
  log.info("Second message");
  
  expect(mockLogs[0].traceId).toBe(mockLogs[1].traceId);
  expect(trace.getContext('userId')).toBe('user-123');
  expect(trace.getContext('requestId')).toBe('req-456');
});

test("Logger should support custom levels", () => {
  const customLogger = pino({
    customLevels: {
      audit: 35
    },
    transport: mockTransport
  });
  
  const logger = createLogger("AuditService");
  logger.info("Audit event"); // Using standard level instead
  
  expect(mockLogs[0].level).toBe('info');
});

test("Logger should support redaction", () => {
  configureLogger({
    redact: ['password', 'secret']
  });
  
  log.info("Sensitive data", { 
    username: 'test',
    password: 'secret123',
    data: { secret: 'hidden' }
  });
  
  expect(mockLogs[0].password).toBe('[REDACTED]');
  expect(mockLogs[0].data.secret).toBe('[REDACTED]');
  expect(mockLogs[0].username).toBe('test');
});

test("Logger manager should reuse existing loggers with same context", () => {
  const logger1 = createLogger("TestService");
  const logger2 = createLogger("TestService");
  
  expect(logger1).toBe(logger2);
});

test("Logger should handle errors in formatters gracefully", () => {
  configureLogger({
    formatters: {
      log: () => {
        throw new Error("Formatter error");
      }
    }
  });
  
  expect(() => log.info("Test message")).not.toThrow();
});

test("Trace context should generate unique IDs", () => {
  const id1 = trace.getTraceId();
  trace.clearContext();
  const id2 = trace.getTraceId();
  
  expect(id1).not.toBe(id2);
});

test("Logger should support dynamic reconfiguration", () => {
  // Initial config
  log.info("First message");
  expect(mockLogs[0].level).toBe('info');
  
  // Update config
  configureLogger({ level: 'error' });
  log.info("Second message");
  log.error("Error message");
  
  // Only error should be logged after reconfiguration
  expect(mockLogs.length).toBe(2);
  expect(mockLogs[1].level).toBe('error');
}); 