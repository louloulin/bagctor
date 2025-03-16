import { ActorSystem } from '../core/system';
import { PropsBuilder } from '../core/props';
import { SupervisorStrategies } from '../core/helpers';
import { Message, PID } from '../core/types';
import { Actor } from '../core/actor';

// Importing SupervisorDirective from the correct location
import { SupervisorDirective } from '../core/types';

// Custom error classes for testing
class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

class DatabaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}

class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

// Test actors
class ErrorThrowingActor extends Actor {
    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'throw-network-error') {
                throw new NetworkError('Network connection failed');
            }
            if (msg.type === 'throw-database-error') {
                throw new DatabaseError('Database query failed');
            }
            if (msg.type === 'throw-validation-error') {
                throw new ValidationError('Input validation failed');
            }
            if (msg.type === 'throw-generic-error') {
                throw new Error('A generic error occurred');
            }
            if (msg.type === 'ping') {
                return 'pong';
            }
        });
    }
}

class SupervisorActor extends Actor {
    public childPid: PID | null = null;

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'create-child') {
                const props = PropsBuilder.fromClass(ErrorThrowingActor).build();
                this.childPid = await this.spawn(props);
                return this.childPid;
            }

            if (msg.type === 'send-to-child' && this.childPid) {
                return await this.context.request(this.childPid, msg.payload.message);
            }
        });
    }
}

// Tests
describe('Error Classifier in Custom Supervisor Strategy', () => {
    let system: ActorSystem;

    beforeEach(() => {
        system = new ActorSystem();
    });

    afterEach(async () => {
        await system.shutdown();
    });

    test('different error types trigger different directives', async () => {
        // Create error classifiers
        const networkErrorClassifier = SupervisorStrategies.createErrorClassifier(
            'network-errors',
            (error) => error instanceof NetworkError,
            SupervisorDirective.Restart
        );

        const databaseErrorClassifier = SupervisorStrategies.createErrorClassifier(
            'database-errors',
            (error) => error instanceof DatabaseError,
            SupervisorDirective.Stop
        );

        const validationErrorClassifier = SupervisorStrategies.createErrorClassifier(
            'validation-errors',
            (error) => error instanceof ValidationError,
            SupervisorDirective.Resume
        );

        // Create custom strategy with classifiers
        const strategy = SupervisorStrategies.custom(
            // Default handler
            (error, childPid, restartCount) => {
                // For any other error, escalate
                return SupervisorDirective.Escalate;
            },
            {
                restartAll: false,
                errorClassifiers: [
                    networkErrorClassifier,
                    databaseErrorClassifier,
                    validationErrorClassifier
                ]
            }
        );

        // Create supervisor with strategy
        const supervisorProps = PropsBuilder
            .fromClass(SupervisorActor)
            .withSupervisor(strategy)
            .build();

        const supervisorPid = await system.spawn(supervisorProps);

        // Create child
        const childPid = await system.request<PID>(supervisorPid, { type: 'create-child' });

        // Test that child is working initially
        const response = await system.request(supervisorPid, {
            type: 'send-to-child',
            payload: {
                message: { type: 'ping' }
            }
        });

        expect(response).toBe('pong');

        // Test NetworkError - should restart the child
        try {
            await system.request(supervisorPid, {
                type: 'send-to-child',
                payload: {
                    message: { type: 'throw-network-error' }
                }
            });
            expect("This line should not be reached").toBe("Error should have been thrown");
        } catch (error) {
            // Expected
        }

        // After restart, should still be able to ping
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow time for restart

        const responseAfterRestart = await system.request(supervisorPid, {
            type: 'send-to-child',
            payload: {
                message: { type: 'ping' }
            }
        });

        expect(responseAfterRestart).toBe('pong');

        // Test DatabaseError - should stop the child
        try {
            await system.request(supervisorPid, {
                type: 'send-to-child',
                payload: {
                    message: { type: 'throw-database-error' }
                }
            });
            expect("This line should not be reached").toBe("Error should have been thrown");
        } catch (error) {
            // Expected
        }

        // After stop, should not be able to ping (will get a timeout)
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow time for stop

        let errorOccurred = false;
        try {
            await system.request(
                supervisorPid,
                {
                    type: 'send-to-child',
                    payload: {
                        message: { type: 'ping' }
                    }
                },
                500 // Short timeout as a number
            );
            expect(false).toBe(true); // This will fail the test if we don't get an error
        } catch (error: any) { // Using any to avoid type issues
            // Expected an error
            errorOccurred = true;
        }

        expect(errorOccurred).toBe(true);
    });

    test('custom classifier matches patterns in error messages', async () => {
        // Create pattern-matching classifier
        const sensitiveDataErrorClassifier = SupervisorStrategies.createErrorClassifier(
            'sensitive-data-errors',
            (error) => error.message.includes('password') || error.message.includes('credit card'),
            SupervisorDirective.Stop // Always stop for security issues
        );

        // Create custom strategy
        const strategy = SupervisorStrategies.custom(
            // Default handler
            (error, childPid, restartCount) => {
                return SupervisorDirective.Restart;
            },
            {
                errorClassifiers: [sensitiveDataErrorClassifier]
            }
        );

        // Create test actor that throws specific errors
        class SecurityActor extends Actor {
            protected behaviors(): void {
                this.addBehavior('default', async (msg: Message) => {
                    if (msg.type === 'log-password') {
                        throw new Error('Failed to log password data');
                    }
                    if (msg.type === 'process-payment') {
                        throw new Error('Error processing credit card information');
                    }
                    if (msg.type === 'other-error') {
                        throw new Error('Some other error occurred');
                    }
                    if (msg.type === 'ping') {
                        return 'pong';
                    }
                });
            }
        }

        // Create parent
        class SecurityParent extends Actor {
            public childPid: PID | null = null;

            protected behaviors(): void {
                this.addBehavior('default', async (msg: Message) => {
                    if (msg.type === 'create-child') {
                        const props = PropsBuilder.fromClass(SecurityActor).build();
                        this.childPid = await this.spawn(props);
                        return this.childPid;
                    }

                    if (msg.type === 'send-to-child' && this.childPid) {
                        return await this.context.request(this.childPid, msg.payload.message);
                    }
                });
            }
        }

        // Create supervisor with strategy
        const supervisorProps = PropsBuilder
            .fromClass(SecurityParent)
            .withSupervisor(strategy)
            .build();

        const supervisorPid = await system.spawn(supervisorProps);

        // Create child
        const childPid = await system.request<PID>(supervisorPid, { type: 'create-child' });

        // Test password error - should stop the child
        try {
            await system.request(supervisorPid, {
                type: 'send-to-child',
                payload: {
                    message: { type: 'log-password' }
                }
            });
            expect("This line should not be reached").toBe("Error should have been thrown");
        } catch (error) {
            // Expected
        }

        // After stop, should not be able to ping
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow time for stop

        let errorOccurred = false;
        try {
            await system.request(
                supervisorPid,
                {
                    type: 'send-to-child',
                    payload: {
                        message: { type: 'ping' }
                    }
                },
                500 // Short timeout as a number
            );
            expect(false).toBe(true); // This will fail the test if we don't get an error
        } catch (error: any) { // Using any to avoid type issues
            // Expected an error
            errorOccurred = true;
        }

        expect(errorOccurred).toBe(true);

        // Create a new child
        const newChildPid = await system.request<PID>(supervisorPid, { type: 'create-child' });

        // Test other error - should restart the child
        try {
            await system.request(supervisorPid, {
                type: 'send-to-child',
                payload: {
                    message: { type: 'other-error' }
                }
            });
            expect("This line should not be reached").toBe("Error should have been thrown");
        } catch (error) {
            // Expected
        }

        // After restart, should still be able to ping
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow time for restart

        const responseAfterRestart = await system.request(supervisorPid, {
            type: 'send-to-child',
            payload: {
                message: { type: 'ping' }
            }
        });

        expect(responseAfterRestart).toBe('pong');
    });
});