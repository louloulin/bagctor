import { logger, log, createLogger, configureLogger, trace } from '../utils/logger';

// Example 1: Basic logging with different levels
async function basicLoggingExample() {
  console.log('\n=== Basic Logging Example ===');
  
  log.trace('This is a trace message');
  log.debug('This is a debug message');
  log.info('This is an info message');
  log.warn('This is a warning message');
  log.error('This is an error message');
  log.fatal('This is a fatal message');
}

// Example 2: Using context-based loggers
async function contextLoggerExample() {
  console.log('\n=== Context Logger Example ===');
  
  const userLogger = createLogger('UserService');
  const authLogger = createLogger('AuthService');

  userLogger.info('User logged in successfully');
  authLogger.warn('Invalid login attempt');
  
  // Logging with additional context
  userLogger.info({ userId: '123', action: 'login' }, 'User action recorded');
}

// Example 3: Trace context and correlation
async function traceContextExample() {
  console.log('\n=== Trace Context Example ===');
  
  // Set a custom trace ID
  trace.setTraceId('custom-trace-123');
  
  // Add custom context
  trace.setContext('requestId', 'req-456');
  trace.setContext('userId', 'user-789');
  
  // Logs will automatically include the trace ID
  log.info('Processing request');
  log.info('Request completed');
  
  // Get trace context
  console.log('Current Trace ID:', trace.getTraceId());
  console.log('Request ID:', trace.getContext('requestId'));
  
  // Clear trace context
  trace.clearContext();
}

// Example 4: Logger configuration
async function loggerConfigExample() {
  console.log('\n=== Logger Configuration Example ===');
  
  // Configure logger with custom settings and redaction paths
  configureLogger({
    level: 'debug',
    prettyPrint: true,
    redact: ['$.password', '$.secret'],  // Use JSONPath syntax for redaction
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  });
  
  // Log sensitive information (will be redacted)
  logger.info({
    user: 'john',
    password: 'secret123',
    secret: 'api-key'
  }, 'User credentials with redacted fields');

  // Log nested sensitive information
  logger.info({
    user: {
      name: 'john',
      password: 'secret123'
    },
    apiConfig: {
      secret: 'api-key'
    }
  }, 'Nested sensitive data');
}

// Run all examples
async function runExamples() {
  await basicLoggingExample();
  await contextLoggerExample();
  await traceContextExample();
  await loggerConfigExample();
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export { runExamples }; 