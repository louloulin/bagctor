import { ActorSystem } from '@bactor/core';
import { Message } from '@bactor/core';
import Decimal from 'decimal.js';
import { MatchingEngineActor } from '../actors/matching_engine_actor';
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
} from '../models/types';

async function main() {
  // 创建Actor系统
  const system = new ActorSystem();
  await system.start();

  // 创建撮合引擎Actor
  const matchingEngine = await system.spawn({
    producer: (context) => new MatchingEngineActor(context, 'BTC-USDT')
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

  // 设置消息处理器
  const messageHandler = async (message: Message) => {
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
  };

  // 注册消息处理器
  system.addMessageHandler(messageHandler);

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

  // 移除消息处理器
  system.removeMessageHandler(messageHandler);

  // 关闭系统
  await system.stop();
}

// 如果直接运行此文件，则执行main函数
main().catch(console.error); 