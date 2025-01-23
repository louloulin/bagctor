import { Logger } from 'pino';

export class TestLogger {
  private logs: any[] = [];

  clear(): void {
    this.logs = [];
  }

  getLogs(): any[] {
    return this.logs;
  }

  write(obj: any): void {
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        // If not JSON, create a basic log object
        obj = { msg: obj };
      }
    }
    this.logs.push(obj);
  }

  createMockDestination() {
    return {
      write: this.write.bind(this)
    };
  }

  createMockLogger(): Logger {
    const self = this;
    const baseLogger = {
      level: 'trace',
      levels: {
        values: {
          trace: 10,
          debug: 20,
          info: 30,
          warn: 40,
          error: 50,
          fatal: 60
        }
      },
      [Symbol.for('pino.serializers')]: {},
      [Symbol.for('pino.metadata')]: true,
      [Symbol.for('pino.opts')]: {
        level: 'trace',
        messageKey: 'msg'
      }
    };

    const logMethod = (level: string) => {
      return function(this: any, ...args: any[]) {
        let data: any = {};
        let msg: string | undefined;

        // Handle different argument patterns
        if (typeof args[0] === 'object') {
          data = args[0];
          msg = args[1];
        } else if (typeof args[0] === 'string') {
          msg = args[0];
          data = args[1] || {};
        }

        const logObject = {
          level: level.toUpperCase(),
          msg,
          ...data,
          time: Date.now()
        };

        self.write(logObject);
      };
    };

    return {
      ...baseLogger,
      trace: logMethod('trace'),
      debug: logMethod('debug'),
      info: logMethod('info'),
      warn: logMethod('warn'),
      error: logMethod('error'),
      fatal: logMethod('fatal'),
      child: function(bindings: object) {
        const childLogger = Object.create(this);
        const originalLogMethod = logMethod;
        
        ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(level => {
          childLogger[level] = function(...args: any[]) {
            const data = typeof args[0] === 'object' ? { ...args[0], ...bindings } : { ...bindings };
            const msg = typeof args[0] === 'object' ? args[1] : args[0];
            originalLogMethod(level).call(this, data, msg);
          };
        });
        
        return childLogger;
      }
    } as unknown as Logger;
  }
} 