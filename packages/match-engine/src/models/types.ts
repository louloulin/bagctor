import { Message } from '@bactor/core';
import Decimal from 'decimal.js';

// 订单方向
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

// 订单类型
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET'
}

// 订单状态
export enum OrderStatus {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  REJECTED = 'REJECTED'
}

// 订单数据结构
export interface Order {
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: Decimal;
  quantity: Decimal;
  filledQuantity: Decimal;
  status: OrderStatus;
  timestamp: number;
  userId: string;
}

// 交易数据结构
export interface Trade {
  tradeId: string;
  symbol: string;
  price: Decimal;
  quantity: Decimal;
  makerOrderId: string;
  takerOrderId: string;
  timestamp: number;
}

// Actor 消息类型
export interface PlaceOrderMessage extends Message {
  type: 'place_order';
  payload: {
    order: Order;
  };
}

export interface CancelOrderMessage extends Message {
  type: 'cancel_order';
  payload: {
    orderId: string;
    symbol: string;
    userId: string;
  };
}

export interface OrderBookUpdateMessage extends Message {
  type: 'order_book_update';
  payload: {
    symbol: string;
    bids: Array<[Decimal, Decimal]>; // [price, quantity]
    asks: Array<[Decimal, Decimal]>; // [price, quantity]
  };
}

export interface TradeExecutedMessage extends Message {
  type: 'trade_executed';
  payload: {
    trade: Trade;
  };
}

export interface OrderStatusUpdateMessage extends Message {
  type: 'order_status_update';
  payload: {
    orderId: string;
    status: OrderStatus;
    filledQuantity: Decimal;
  };
}

// 聚合的消息类型
export type MatchingEngineMessage = 
  | PlaceOrderMessage 
  | CancelOrderMessage 
  | OrderBookUpdateMessage 
  | TradeExecutedMessage 
  | OrderStatusUpdateMessage; 