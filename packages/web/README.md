# @bactor/web

A lightweight HTTP server implementation based on the Bactor actor system, inspired by Hono.js.

## Features

- Actor-based HTTP server
- Express/Hono-style routing
- Path parameters and query string support
- Async request handling
- Built on top of Bun's native HTTP server

## Installation

```bash
bun add @bactor/web
```

## Quick Start

```typescript
import { System } from '@bactor/core';
import { HttpServer } from '@bactor/web';

const system = new System();

// Create HTTP server actor
const server = system.actorOf(HttpServer, { port: 3000 });
const router = server.getRouter();

// Define routes
router.get('/', () => ({
  status: 200,
  headers: new Headers({ 'Content-Type': 'text/plain' }),
  body: 'Hello from Bactor Web!'
}));

router.get('/users/:id', (ctx) => ({
  status: 200,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  body: JSON.stringify({
    id: ctx.params.id,
    query: Object.fromEntries(ctx.query.entries())
  })
}));

// Start the server
server.tell('start');
```

## Router API

The router supports standard HTTP methods:

```typescript
router.get(pattern: string, handler: HttpHandler);
router.post(pattern: string, handler: HttpHandler);
router.put(pattern: string, handler: HttpHandler);
router.delete(pattern: string, handler: HttpHandler);
```

### Route Parameters

Routes can include named parameters:

```typescript
router.get('/users/:id/posts/:postId', (ctx) => {
  const { id, postId } = ctx.params;
  // ...
});
```

### Query Parameters

Access query parameters through the context:

```typescript
router.get('/search', (ctx) => {
  const query = ctx.query.get('q');
  const page = ctx.query.get('page');
  // ...
});
```

### Request Body

Handle request bodies in POST/PUT handlers:

```typescript
router.post('/data', async (ctx) => {
  const body = await new Response(ctx.request.body).json();
  // ...
});
```

## Server Control

The HTTP server actor responds to two messages:

- `start`: Starts the HTTP server
- `stop`: Stops the HTTP server

```typescript
// Start the server
server.tell('start');

// Stop the server
server.tell('stop');
```

## Error Handling

The server automatically handles errors and returns appropriate HTTP responses:

- Unhandled route: 404 Not Found
- Server error: 500 Internal Server Error

## License

MIT 