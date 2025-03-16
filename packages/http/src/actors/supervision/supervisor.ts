/**
 * @bactor/http Supervision
 * 
 * This module implements supervision strategies for HTTP actors,
 * providing error handling and recovery mechanisms.
 */

import { Actor, ActorContext, PID } from '@bactor/core';

/**
 * Types of directives that a supervisor can issue in response to a failure
 */
export type SupervisorDirective = 'resume' | 'restart' | 'stop' | 'escalate';

/**
 * Function that determines what directive to issue for a particular error
 */
export type DirectiveFunction = (error: Error, child: PID) => SupervisorDirective;

/**
 * Configuration for a supervision strategy
 */
export interface SupervisorStrategyConfig {
    /**
     * Function to determine what directive to issue for an error
     */
    directive: DirectiveFunction;

    /**
     * Maximum number of restarts allowed within the time window
     */
    maxRestarts: number;

    /**
     * Time window in milliseconds for counting restarts
     */
    withinTimeWindow: number;
}

/**
 * Tracks restart history for a child actor
 */
interface RestartTracker {
    count: number;
    timestamps: number[];
}

/**
 * Base class for supervision strategies
 */
export abstract class SupervisorStrategy {
    protected config: SupervisorStrategyConfig;
    protected restartTrackers: Map<string, RestartTracker> = new Map();

    constructor(config: SupervisorStrategyConfig) {
        this.config = config;
    }

    /**
     * Handle a failure in a child actor
     * @param error The error that occurred
     * @param child The PID of the child actor that failed
     * @returns A supervisor directive
     */
    public handleFailure(error: Error, child: PID): SupervisorDirective {
        const directive = this.config.directive(error, child);

        if (directive === 'restart') {
            return this.handleRestart(child);
        }

        return directive;
    }

    /**
     * Handle a restart directive
     * @param child The PID of the child actor to restart
     * @returns The final directive after checking restart limits
     */
    protected handleRestart(child: PID): SupervisorDirective {
        const childId = child.id;

        // Get or create restart tracker for this child
        if (!this.restartTrackers.has(childId)) {
            this.restartTrackers.set(childId, { count: 0, timestamps: [] });
        }

        const tracker = this.restartTrackers.get(childId)!;
        const now = Date.now();

        // Remove timestamps outside the window
        tracker.timestamps = tracker.timestamps.filter(
            time => now - time < this.config.withinTimeWindow
        );

        // Add current timestamp
        tracker.timestamps.push(now);
        tracker.count++;

        // Check if we've exceeded the restart limit
        if (tracker.timestamps.length > this.config.maxRestarts) {
            console.log(`[Supervisor] Too many restarts for ${childId}, stopping actor`);
            return 'stop';
        }

        return 'restart';
    }

    /**
     * Reset the restart count for a child
     * @param child The PID of the child actor
     */
    public resetRestartCount(child: PID): void {
        this.restartTrackers.delete(child.id);
    }
}

/**
 * One-for-one strategy that handles each child failure independently
 */
export class OneForOneStrategy extends SupervisorStrategy {
    constructor(config: SupervisorStrategyConfig) {
        super(config);
    }
}

/**
 * All-for-one strategy that applies the same directive to all children
 * when any one child fails
 */
export class AllForOneStrategy extends SupervisorStrategy {
    private children: Set<PID> = new Set();

    constructor(config: SupervisorStrategyConfig) {
        super(config);
    }

    /**
     * Add a child to the supervision group
     * @param child The PID of the child actor
     */
    public addChild(child: PID): void {
        this.children.add(child);
    }

    /**
     * Remove a child from the supervision group
     * @param child The PID of the child actor
     */
    public removeChild(child: PID): void {
        this.children.delete(child);
    }

    /**
     * Get all children in the supervision group
     * @returns An array of PIDs
     */
    public getChildren(): PID[] {
        return Array.from(this.children);
    }
}

/**
 * SupervisorActor that can be used to supervise other actors
 */
export class SupervisorActor extends Actor {
    private strategy: SupervisorStrategy;
    private supervisedChildren: Set<string> = new Set();

    constructor(context: ActorContext, props?: { strategy?: SupervisorStrategy }) {
        super(context);

        // Create default strategy if none provided
        this.strategy = props?.strategy || new OneForOneStrategy({
            directive: (error) => {
                console.log(`[SupervisorActor] Handling error: ${error.message}`);

                // Default strategy based on error type
                if (error.name === 'TemporaryError') {
                    return 'restart';
                } else if (error.name === 'ResourceError' || error.name === 'FatalError') {
                    return 'stop';
                } else {
                    return 'escalate';
                }
            },
            maxRestarts: 10,
            withinTimeWindow: 60000 // 1 minute
        });
    }

    /**
     * Handle child failures
     */
    protected onChildFailure(child: PID, error: Error): void {
        console.log(`[SupervisorActor] Child ${child.id} failed with error: ${error.message}`);

        if (!this.supervisedChildren.has(child.id)) {
            // Not our supervised child, escalate the error
            throw error;
        }

        const directive = this.strategy.handleFailure(error, child);

        switch (directive) {
            case 'resume':
                console.log(`[SupervisorActor] Resuming child ${child.id}`);
                break;

            case 'restart':
                console.log(`[SupervisorActor] Restarting child ${child.id}`);
                // Since restart is not directly available in ActorContext,
                // we'll stop and then spawn a new instance instead
                this.context.stop(child)
                    .then(() => {
                        // Logic to create a new instance would go here
                        console.log(`[SupervisorActor] Stopped child ${child.id}, will re-create it`);
                        // In a real implementation, we would need to store actor class and props
                        // information to be able to re-create the actor
                    })
                    .catch(err => {
                        console.error(`[SupervisorActor] Failed to stop child ${child.id}:`, err);
                    });
                break;

            case 'stop':
                console.log(`[SupervisorActor] Stopping child ${child.id}`);
                this.supervisedChildren.delete(child.id);
                this.context.stop(child);
                break;

            case 'escalate':
                console.log(`[SupervisorActor] Escalating error from child ${child.id}`);
                throw error;
        }
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[SupervisorActor] Received message: ${msg.type}`);

            if (msg.type === 'supervise') {
                const childPid = msg.payload.child;

                if (childPid) {
                    this.supervisedChildren.add(childPid.id);

                    if (this.strategy instanceof AllForOneStrategy) {
                        this.strategy.addChild(childPid);
                    }

                    console.log(`[SupervisorActor] Now supervising ${childPid.id}`);

                    // Notify the sender that supervision has started
                    if (msg.sender) {
                        await this.context.send(msg.sender, {
                            type: 'supervise.complete',
                            payload: { child: childPid },
                            sender: this.context.self
                        });
                    }
                }
            } else if (msg.type === 'unsupervise') {
                const childPid = msg.payload.child;

                if (childPid && this.supervisedChildren.has(childPid.id)) {
                    this.supervisedChildren.delete(childPid.id);

                    if (this.strategy instanceof AllForOneStrategy) {
                        this.strategy.removeChild(childPid);
                    }

                    console.log(`[SupervisorActor] No longer supervising ${childPid.id}`);

                    // Notify the sender that supervision has ended
                    if (msg.sender) {
                        await this.context.send(msg.sender, {
                            type: 'unsupervise.complete',
                            payload: { child: childPid },
                            sender: this.context.self
                        });
                    }
                }
            }
        });
    }
} 