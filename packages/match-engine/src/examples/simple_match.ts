import { ActorSystem } from '@bactor/core';
import { Message } from '@bactor/core';
import { createRouter, RouterConfig, Actor, ActorContext } from '@bactor/core';
import { configureLogger } from '@bactor/core';
import * as DecimalJs from 'decimal.js';
import { MatchingEngineActor } from '../actors/matching_engine_actor.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  PlaceOrderMessage,
  TradeExecutedMessage,
  OrderStatusUpdateMessage,
  OrderBookUpdateMessage,
  MatchingEngineMessage
} from '../models/types.js';

// 使用导入的Decimal类型
const Decimal = DecimalJs.default || DecimalJs;
type DecimalType = DecimalJs.Decimal;

// 消息处理Actor
class MessageHandlerActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      const msg = message as MatchingEngineMessage;
      switch (msg.type) {
        case 'trade_executed':
          console.log('Trade executed:', (msg as TradeExecutedMessage).payload);
          break;
        case 'order_status_update':
          console.log('Order status update:', (msg as OrderStatusUpdateMessage).payload);
          break;
        case 'order_book_update':
          console.log('Order book update:', (msg as OrderBookUpdateMessage).payload);
          break;
      }
    });
  }

  async preStart(): Promise<void> {
    console.log('MessageHandler started');
  }

  async postStop(): Promise<void> {
    console.log('MessageHandler stopped');
  }
}

async function main() {
  // 配置日志级别
  configureLogger({
    level: 'debug',
    prettyPrint: true
  });

  // 创建Actor系统
  const system = new ActorSystem();
  await system.start();

  // 创建广播路由器
  const routerConfig: RouterConfig = { system };
  const broadcastRouter = createRouter('broadcast', routerConfig);
  const routerPid = await system.spawn({
    producer: () => broadcastRouter
  });

  // 创建撮合引擎Actor
  const matchingEngine = await system.spawn({
    producer: (context) => new MatchingEngineActor(context, 'BTC-USDT', routerPid)
  });

  // 创建一些测试订单
  const orders: Order[] = [
    // 卖单
    {
      orderId: 'sell-1',
      symbol: 'BTC-USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: new Decimal('50000.00'),
      quantity: new Decimal('1.5'),
      filledQuantity: new Decimal('0'),
      status: OrderStatus.NEW,
      timestamp: Date.now(),
      userId: 'user1'
    },
    {
      orderId: 'sell-2',
      symbol: 'BTC-USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: new Decimal('50100.00'),
      quantity: new Decimal('2.0'),
      filledQuantity: new Decimal('0'),
      status: OrderStatus.NEW,
      timestamp: Date.now(),
      userId: 'user2'
    },
    // 买单
    {
      orderId: 'buy-1',
      symbol: 'BTC-USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: new Decimal('50000.00'),
      quantity: new Decimal('1.0'),
      filledQuantity: new Decimal('0'),
      status: OrderStatus.NEW,
      timestamp: Date.now(),
      userId: 'user3'
    }
  ];

  // 创建消息处理Actor
  const handlerPid = await system.spawn({
    producer: (context) => new MessageHandlerActor(context)
  });

  // 添加处理器到路由器
  await system.send(routerPid, {
    type: 'router.add-routee',
    routee: handlerPid
  });

  // 发送订单
  console.log('=== Starting Trading Simulation ===');

  for (const order of orders) {
    console.log(`\nPlacing order: ${order.orderId} (${order.side} ${order.quantity} BTC @ ${order.price} USDT)`);

    const message: PlaceOrderMessage = {
      type: 'place_order',
      payload: { order }
    };

    await system.send(matchingEngine, message);
    // 等待一下，让消息能够处理完
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n=== Simulation Complete ===');

  // 获取最终的订单簿状态
  await system.send(matchingEngine, {
    type: 'order_book_snapshot',
    payload: { symbol: 'BTC-USDT' }
  });

  // 等待一下让最后的消息处理完
  await new Promise(resolve => setTimeout(resolve, 100));

  // 移除处理器
  await system.send(routerPid, {
    type: 'router.remove-routee',
    routee: handlerPid
  });

  // 关闭系统
  await system.stop();
}

// 如果直接运行此文件，则执行main函数
main().catch(console.error); 