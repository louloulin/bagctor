import { ActorContext } from '@bactor/core';

export interface HttpRequest {
  method: string;
  url: string;
  headers: Headers;
  body?: ReadableStream | string | null;
  state: Map<string, any>;
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  body?: ReadableStream | string | null;
}

export interface RouteParams {
  [key: string]: string;
}

export interface HttpContext {
  request: HttpRequest;
  params: RouteParams;
  query: URLSearchParams;
  state: Map<string, any>;
  actorContext: ActorContext;
}

export type HttpHandler = (c: HttpContext) => Promise<HttpResponse> | HttpResponse;

export interface Route {
  pattern: string;
  method: string;
  handler: HttpHandler;
} 