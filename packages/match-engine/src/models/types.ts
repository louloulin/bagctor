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
export interface BaseMatchingEngineMessage extends Message {
  type: MatchingEngineMessageType;
  payload: any;
}

export type MatchingEngineMessageType = 
  | 'place_order'
  | 'cancel_order'
  | 'order_book_update'
  | 'trade_executed'
  | 'order_status_update'
  | 'order_book_snapshot';

export interface PlaceOrderPayload {
  order: Order;
}

export interface CancelOrderPayload {
  orderId: string;
  symbol: string;
  userId: string;
}

export interface OrderBookUpdatePayload {
  symbol: string;
  bids: Array<[Decimal, Decimal]>; // [price, quantity]
  asks: Array<[Decimal, Decimal]>; // [price, quantity]
}

export interface TradeExecutedPayload {
  trade: Trade;
}

export interface OrderStatusUpdatePayload {
  orderId: string;
  status: OrderStatus;
  filledQuantity: Decimal;
}

// 具体消息类型
export interface PlaceOrderMessage extends BaseMatchingEngineMessage {
  type: 'place_order';
  payload: PlaceOrderPayload;
}

export interface CancelOrderMessage extends BaseMatchingEngineMessage {
  type: 'cancel_order';
  payload: CancelOrderPayload;
}

export interface OrderBookUpdateMessage extends BaseMatchingEngineMessage {
  type: 'order_book_update';
  payload: OrderBookUpdatePayload;
}

export interface TradeExecutedMessage extends BaseMatchingEngineMessage {
  type: 'trade_executed';
  payload: TradeExecutedPayload;
}

export interface OrderStatusUpdateMessage extends BaseMatchingEngineMessage {
  type: 'order_status_update';
  payload: OrderStatusUpdatePayload;
}

export interface OrderBookSnapshotMessage extends BaseMatchingEngineMessage {
  type: 'order_book_snapshot';
  payload: {
    symbol: string;
  };
}

// 聚合的消息类型
export type MatchingEngineMessage = 
  | PlaceOrderMessage 
  | CancelOrderMessage 
  | OrderBookUpdateMessage 
  | TradeExecutedMessage 
  | OrderStatusUpdateMessage
  | OrderBookSnapshotMessage; 