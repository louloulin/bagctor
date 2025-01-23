// import { expect, test, mock, beforeEach } from "bun:test";
// import { 
//   configureLogger, 
//   createLogger, 
//   log, 
//   trace, 
//   LoggerConfig,
//   TraceContext,
//   LoggerManager
// } from "../utils/logger";

// // Mock logs storage
// const mockLogs: any[] = [];

// // Mock pino
// mock.module('pino', () => {
//   const createMockLogger = (opts: any = {}) => {
//     const loggerLevel = opts.level || 'info';
//     const levels = {
//       trace: 10,
//       debug: 20,
//       info: 30,
//       warn: 40,
//       error: 50,
//       fatal: 60
//     };

//     const shouldLog = (level: string) => {
//       return levels[level as keyof typeof levels] >= levels[loggerLevel as keyof typeof levels];
//     };

//     const formatLog = (level: string, input: any, msg?: string) => {
//       let logObject: any;
      
//       if (typeof input === 'object') {
//         logObject = { ...input };
//         if (msg) logObject.msg = msg;
//       } else {
//         logObject = { msg: input };
//       }

//       // Apply formatters
//       if (opts.formatters) {
//         if (opts.formatters.log) {
//           try {
//             logObject = opts.formatters.log(logObject);
//           } catch (e) {
//             // Ignore formatter errors
//           }
//         }
//       }

//       // Apply redaction
//       if (opts.redact && Array.isArray(opts.redact)) {
//         for (const path of opts.redact) {
//           if (logObject[path]) {
//             logObject[path] = '[REDACTED]';
//           }
//           if (logObject.data?.[path]) {
//             logObject.data[path] = '[REDACTED]';
//           }
//         }
//       }

//       return {
//         level: level.toUpperCase(),
//         time: Date.now(),
//         ...logObject
//       };
//     };

//     const logger = {
//       level: loggerLevel,
//       levels: { values: levels },
//       trace: (input: any, msg?: string) => {
//         if (shouldLog('trace')) {
//           mockLogs.push(formatLog('trace', input, msg));
//         }
//       },
//       debug: (input: any, msg?: string) => {
//         if (shouldLog('debug')) {
//           mockLogs.push(formatLog('debug', input, msg));
//         }
//       },
//       info: (input: any, msg?: string) => {
//         if (shouldLog('info')) {
//           mockLogs.push(formatLog('info', input, msg));
//         }
//       },
//       warn: (input: any, msg?: string) => {
//         if (shouldLog('warn')) {
//           mockLogs.push(formatLog('warn', input, msg));
//         }
//       },
//       error: (input: any, msg?: string) => {
//         if (shouldLog('error')) {
//           mockLogs.push(formatLog('error', input, msg));
//         }
//       },
//       fatal: (input: any, msg?: string) => {
//         if (shouldLog('fatal')) {
//           mockLogs.push(formatLog('fatal', input, msg));
//         }
//       },
//       child: function(bindings: object) {
//         const childLogger = createMockLogger(opts);
//         const originalFormatLog = formatLog;
//         return {
//           ...childLogger,
//           trace: (input: any, msg?: string) => {
//             if (shouldLog('trace')) {
//               mockLogs.push(originalFormatLog('trace', { ...input, ...bindings }, msg));
//             }
//           },
//           debug: (input: any, msg?: string) => {
//             if (shouldLog('debug')) {
//               mockLogs.push(originalFormatLog('debug', { ...input, ...bindings }, msg));
//             }
//           },
//           info: (input: any, msg?: string) => {
//             if (shouldLog('info')) {
//               mockLogs.push(originalFormatLog('info', { ...input, ...bindings }, msg));
//             }
//           },
//           warn: (input: any, msg?: string) => {
//             if (shouldLog('warn')) {
//               mockLogs.push(originalFormatLog('warn', { ...input, ...bindings }, msg));
//             }
//           },
//           error: (input: any, msg?: string) => {
//             if (shouldLog('error')) {
//               mockLogs.push(originalFormatLog('error', { ...input, ...bindings }, msg));
//             }
//           },
//           fatal: (input: any, msg?: string) => {
//             if (shouldLog('fatal')) {
//               mockLogs.push(originalFormatLog('fatal', { ...input, ...bindings }, msg));
//             }
//           }
//         };
//       }
//     };

//     return logger;
//   };

//   return createMockLogger;
// });

// beforeEach(() => {
//   // Clear mock logs
//   mockLogs.length = 0;
//   // Clear trace context
//   trace.clearContext();
//   // Reset logger config
//   configureLogger({
//     level: 'info',
//     prettyPrint: false
//   });
// });

// test("Logger should respect log levels", () => {
//   configureLogger({ level: 'warn' });
  
//   log.debug("Debug message");
//   log.info("Info message");
//   log.warn("Warning message");
//   log.error("Error message");

//   expect(mockLogs.length).toBe(2); // Only warn and error should be logged
//   expect(mockLogs[0].level).toBe('WARN');
//   expect(mockLogs[0].msg).toBe('Warning message');
//   expect(mockLogs[1].level).toBe('ERROR');
//   expect(mockLogs[1].msg).toBe('Error message');
// });

// test("Logger should include trace context", () => {
//   const customTraceId = "test-trace-123";
//   trace.setTraceId(customTraceId);
  
//   log.info("Test message");
  
//   expect(mockLogs[0].traceId).toBe(customTraceId);
// });

// test("Logger should support custom context", () => {
//   const logger = createLogger("TestService");
//   logger.info("Service message");
  
//   expect(mockLogs[0].context).toBe("TestService");
// });

// test("Logger should handle custom formatters", () => {
//   configureLogger({
//     formatters: {
//       log: (obj) => ({
//         ...obj,
//         customField: 'test-value'
//       })
//     }
//   });
  
//   log.info("Test message");
  
//   expect(mockLogs[0].customField).toBe('test-value');
// });

// test("TraceContext should maintain context between calls", () => {
//   trace.setContext('userId', 'user-123');
//   trace.setContext('requestId', 'req-456');
  
//   log.info("First message");
//   log.info("Second message");
  
//   expect(mockLogs[0].traceId).toBe(mockLogs[1].traceId);
//   expect(trace.getContext('userId')).toBe('user-123');
//   expect(trace.getContext('requestId')).toBe('req-456');
// });

// test("Logger should support redaction", () => {
//   configureLogger({
//     redact: ['password', 'secret']
//   });
  
//   log.info("Sensitive data", { 
//     username: 'test',
//     password: 'secret123',
//     data: { secret: 'hidden' }
//   });
  
//   expect(mockLogs[0].password).toBe('[REDACTED]');
//   expect(mockLogs[0].data.secret).toBe('[REDACTED]');
//   expect(mockLogs[0].username).toBe('test');
// });

// test("Logger manager should reuse existing loggers with same context", () => {
//   const logger1 = createLogger("TestService");
//   const logger2 = createLogger("TestService");
  
//   expect(logger1).toBe(logger2);
// });

// test("Logger should handle errors in formatters gracefully", () => {
//   configureLogger({
//     formatters: {
//       log: () => {
//         throw new Error("Formatter error");
//       }
//     }
//   });
  
//   expect(() => log.info("Test message")).not.toThrow();
// });

// test("Trace context should generate unique IDs", () => {
//   const id1 = trace.getTraceId();
//   trace.clearContext();
//   const id2 = trace.getTraceId();
  
//   expect(id1).not.toBe(id2);
// });

// test("Logger should support dynamic reconfiguration", () => {
//   // Initial config
//   log.info("First message");
  
//   expect(mockLogs[0].level).toBe('INFO');
  
//   // Update config
//   configureLogger({ level: 'error' });
//   log.info("Second message");
//   log.error("Error message");
  
//   // Only error should be logged after reconfiguration
//   expect(mockLogs.length).toBe(2);
//   expect(mockLogs[1].level).toBe('ERROR');
// }); 