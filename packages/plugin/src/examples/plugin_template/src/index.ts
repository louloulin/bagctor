import { Actor, ActorContext, Message, log } from '@bactor/core';

interface TemplatePluginConfig {
    defaultOption: string;
    [key: string]: any;
}

class TemplatePlugin extends Actor {
    private config: TemplatePluginConfig;

    constructor(context: ActorContext, config: TemplatePluginConfig) {
        super(context);
        this.config = config;
        log.info('Template plugin created with config:', config);
    }

    protected behaviors(): void {
        this.addBehavior('template.action', this.handleTemplateAction.bind(this));
        log.info('Template plugin behaviors registered');
    }

    private async handleTemplateAction(message: Message): Promise<void> {
        try {
            log.info('Template plugin handling action:', message);

            // Process the message
            const result = {
                option: this.config.defaultOption,
                ...message.payload
            };

            // Send response if sender exists
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'template.response',
                    payload: {
                        success: true,
                        data: result
                    }
                });
            }
        } catch (error) {
            log.error('Template plugin action failed:', error);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'template.response',
                    payload: {
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new TemplatePlugin(context, config);
} 