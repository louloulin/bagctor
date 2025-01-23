import { Actor } from '../core/actor';
import { Message, PID } from '../core/types';
import { ActorSystem } from '../core/system';
import { PropsBuilder } from '../core/props';
import { DefaultMailbox } from '../core/mailbox';

// Example 1: Function-based actor using producer
function createCounterActor() {
  let count = 0;
  
  return new class extends Actor {
    protected behaviors(): void {
      this.addBehavior('default', async (msg: Message) => {
        switch (msg.type) {
          case 'increment':
            count++;
            console.log(`Counter incremented to ${count}`);
            break;
          case 'get':
            if (msg.sender) {
              await this.context.send(msg.sender, {
                type: 'count',
                payload: count
              });
            }
            break;
        }
      });
    }
  }(undefined as any);
}

// Example 2: Simple function-based actor
function simpleActor(context: any, msg: Message) {
  console.log('Received message:', msg);
  if (msg.sender) {
    context.send(msg.sender, {
      type: 'echo',
      payload: msg.payload
    });
  }
}

async function main() {
  const system = new ActorSystem();

  try {
    // Spawn counter actor using producer
    const counterPid = await system.spawn(
      PropsBuilder.fromProducer(createCounterActor)
        .withMailbox(DefaultMailbox)
        .build()
    );

    // Spawn simple actor using function
    const echoPid = await system.spawn(
      PropsBuilder.fromFunc(simpleActor)
        .withMailbox(DefaultMailbox)
        .build()
    );

    // Create a test actor to interact with others
    class TestActor extends Actor {
      private results: any[] = [];

      protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
          if (msg.type === 'start') {
            // Test counter actor
            await this.context.send(counterPid, { type: 'increment' });
            await this.context.send(counterPid, { type: 'increment' });
            await this.context.send(counterPid, {
              type: 'get',
              sender: this.context.self
            });
          } else if (msg.type === 'count') {
            this.results.push(`Counter value: ${msg.payload}`);
            
            // Test echo actor
            await this.context.send(echoPid, {
              type: 'hello',
              payload: 'world',
              sender: this.context.self
            });
          } else if (msg.type === 'echo') {
            this.results.push(`Echo response: ${msg.payload}`);
            console.log('Test results:', this.results);
          }
        });
      }
    }

    // Run the test
    const testPid = await system.spawn(
      PropsBuilder.fromClass(TestActor)
        .withMailbox(DefaultMailbox)
        .build()
    );

    await system.send(testPid, { type: 'start' });

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 1000));
    await system.stop();
  } catch (error) {
    console.error('Error:', error);
    await system.stop();
  }
}

main().catch(console.error); 