import { ActorSystem } from '@bactor/core';
import { HttpServer, HttpServerProps } from '../server';
import { HttpContext } from '../types';
import { LoggerMiddleware, CorsMiddleware, AuthMiddleware } from '../middleware/common';

async function main() {
  const system = new ActorSystem();

  // Create HTTP server actor
  const props: HttpServerProps = {
    actorClass: HttpServer,
    port: 3000,
    hostname: 'localhost'
  };
  const serverPid = await system.spawn(props);
  const server = system.getActor(serverPid.id) as HttpServer;
  const router = server.getRouter();

  // Create and add middleware
  const loggerPid = await system.spawn({
    actorClass: LoggerMiddleware,
    actorContext: { name: 'RequestLogger' }
  });

  const corsPid = await system.spawn({
    actorClass: CorsMiddleware,
    actorContext: { name: 'CORS' }
  });

  const authPid = await system.spawn({
    actorClass: AuthMiddleware,
    actorContext: { name: 'Auth' }
  });

  // Add middleware to server
  await system.send(serverPid, { type: 'middleware.add', payload: loggerPid });
  await system.send(serverPid, { type: 'middleware.add', payload: corsPid });
  await system.send(serverPid, { type: 'middleware.add', payload: authPid });

  // Define protected routes
  router.get('/api/protected', (ctx: HttpContext) => {
    const user = ctx.state.get('user');
    return {
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        message: 'Protected resource',
        user
      })
    };
  });

  // Define public routes
  router.get('/', () => ({
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/plain' }),
    body: 'Hello from Bactor Web!'
  }));

  // Start the server
  await system.send(serverPid, { type: 'start' });
  
  // Handle process termination
  process.on('SIGINT', async () => {
    await system.send(serverPid, { type: 'stop' });
    process.exit(0);
  });
}

main().catch(console.error); 