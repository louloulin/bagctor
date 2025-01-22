import { ActorSystem } from '../core/system';
import { Message } from '../core/types';
import { PropsBuilder } from '../core/props';
import { DefaultMailbox } from '../core/mailbox';

async function main() {
  const system = new ActorSystem();

  try {
    // Example 1: Simple message handler
    const counterPid = await system.spawn(
      PropsBuilder.fromHandler((msg: Message) => {
        if (msg.type === 'increment') {
          console.log('Increment received');
        }
      })
      .withMailbox(DefaultMailbox)
      .build()
    );

    // Example 2: Stateful actor with counter
    interface CounterState {
      count: number;
      lastUpdated: Date;
    }

    const statefulCounterPid = await system.spawn(
      PropsBuilder.fromState<CounterState>(
        { count: 0, lastUpdated: new Date() },
        (state, msg, context) => {
          switch (msg.type) {
            case 'increment':
              return {
                count: state.count + 1,
                lastUpdated: new Date()
              };
            case 'get':
              if (msg.sender) {
                context.send(msg.sender, {
                  type: 'count',
                  payload: state.count
                });
              }
              return state;
            default:
              return state;
          }
        }
      )
      .withMailbox(DefaultMailbox)
      .build()
    );

    // Test the actors
    await system.send(counterPid, { type: 'increment' });
    await system.send(statefulCounterPid, { type: 'increment' });
    await system.send(statefulCounterPid, { type: 'increment' });
    
    // Create a test actor to receive the count
    const testPid = await system.spawn(
      PropsBuilder.fromHandler((msg: Message) => {
        if (msg.type === 'count') {
          console.log('Current count:', msg.payload);
        }
      })
      .build()
    );

    // Get the count
    await system.send(statefulCounterPid, {
      type: 'get',
      sender: testPid
    });

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 1000));
    await system.stop();

  } catch (error) {
    console.error('Error:', error);
    await system.stop();
  }
}

main().catch(console.error); 