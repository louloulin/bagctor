import { ActorSystem } from '@bactor/core';
import { HttpServer, HttpServerProps } from '../server';
import { HttpContext } from '../types';

async function main() {
  const system = new ActorSystem();

  // Create HTTP server actor
  const props: HttpServerProps = {
    actorClass: HttpServer,
    port: 3000,
    hostname: 'localhost'
  };
  const serverPid = await system.spawn(props);

  // Get the actor instance
  const server = system.getActor(serverPid.id) as HttpServer;
  const router = server.getRouter();

  // Define routes
  router.get('/', () => ({
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/plain' }),
    body: 'Hello from Bactor Web!'
  }));

  router.get('/users/:id', (ctx: HttpContext) => ({
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: ctx.params.id,
      query: Object.fromEntries(ctx.query.entries())
    })
  }));

  router.post('/echo', async (ctx: HttpContext) => {
    const body = await new Response(ctx.request.body).text();
    return {
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ echo: body })
    };
  });

  // Start the server
  await system.send(serverPid, { type: 'start' });
  
  // Handle process termination
  process.on('SIGINT', async () => {
    await system.send(serverPid, { type: 'stop' });
    process.exit(0);
  });
}

main().catch(console.error); 