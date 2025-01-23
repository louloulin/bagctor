import { Message, Props } from '../core/types';
import { ActorContext } from '../core/context';
import { Actor } from '../core/actor';
import { ActorSystem } from '../core/system';

// 定义一个简单的问候消息接口
interface GreetingMessage extends Message {
  type: 'greeting';
  payload: {
    name: string;
  };
}

// 创建一个简单的Greeter Actor
class GreeterActor extends Actor {
  constructor(context: ActorContext) {
    super(context);
  }

  protected behaviors(): void {
    // 添加默认行为来处理问候消息
    this.addBehavior('default', async (message: Message) => {
      if (message.type === 'greeting') {
        const greetingMsg = message as GreetingMessage;
        console.log(`Hello, ${greetingMsg.payload.name}! 👋`);
      }
    });
  }
}

// 主函数：展示如何使用Actor系统
async function main() {
  // 创建一个新的Actor系统
  const system = new ActorSystem();
  await system.start();
  
  // 创建一个Greeter actor
  const greeterProps: Props = {
    producer: (context: ActorContext) => new GreeterActor(context)
  };
  
  const greeterPid = await system.spawn(greeterProps);
  
  // 发送问候消息
  const message: GreetingMessage = {
    type: 'greeting',
    payload: { name: "World" }
  };
  await system.send(greeterPid, message);
  
  // 等待消息处理完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 关闭Actor系统
  await system.stop();
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main().catch(console.error);
} 