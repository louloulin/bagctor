import { Props, IMailbox, SupervisorStrategy, MessageDispatcher, Message } from './types';
import { ActorContext } from './context';
import { Actor } from './actor';

export class PropsBuilder {
  private props: Props = {};

  // For class-based actors
  static fromClass(actorClass: new (context: ActorContext) => Actor): PropsBuilder {
    const builder = new PropsBuilder();
    builder.props.actorClass = actorClass;
    return builder;
  }

  // For function-based actors
  static fromProducer(producer: (context: ActorContext) => Actor): PropsBuilder {
    const builder = new PropsBuilder();
    builder.props.producer = producer;
    return builder;
  }

  // For lambda-style message handlers
  static fromHandler(handler: (msg: Message) => void | Promise<void>): PropsBuilder {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class LambdaActor extends Actor {
        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            await Promise.resolve(handler(msg));
          });
        }
      }
      return new LambdaActor(context);
    });
  }

  // For lambda-style actors with state
  static fromState<T>(
    initialState: T,
    handler: (state: T, msg: Message, context: ActorContext) => Promise<T> | T
  ): PropsBuilder {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class StatefulLambdaActor extends Actor {
        private customState: T = initialState;

        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            this.customState = await Promise.resolve(handler(this.customState, msg, this.context));
          });
        }
      }
      return new StatefulLambdaActor(context);
    });
  }

  // For function-based actors with context
  static fromFunc(func: (context: ActorContext, message: Message) => void): PropsBuilder {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class FunctionalActor extends Actor {
        constructor(context: ActorContext) {
          super(context);
        }

        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            func(this.context, msg);
          });
        }
      }
      return new FunctionalActor(context);
    });
  }

  withMailbox(mailboxType: new () => IMailbox): PropsBuilder {
    this.props.mailboxType = mailboxType;
    return this;
  }

  withSupervisor(strategy: SupervisorStrategy): PropsBuilder {
    this.props.supervisorStrategy = strategy;
    return this;
  }

  withDispatcher(dispatcher: MessageDispatcher): PropsBuilder {
    this.props.dispatcher = dispatcher;
    return this;
  }

  withAddress(address: string): PropsBuilder {
    this.props.address = address;
    return this;
  }

  withContext(context: any): PropsBuilder {
    this.props.actorContext = context;
    return this;
  }

  build(): Props {
    // Validate props
    if (!this.props.actorClass && !this.props.producer) {
      throw new Error('Props must have either actorClass or producer defined');
    }
    return { ...this.props };
  }
} 