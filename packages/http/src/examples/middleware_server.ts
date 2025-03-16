import { ActorSystem } from '@bactor/core';
import { HttpServer, HttpServerProps } from '../server';
import { HttpContext } from '../types';
import { LoggerMiddleware, CorsMiddleware, AuthMiddleware } from '../middleware/common';

async function main() {
  console.log('Starting actor system...');
  const system = new ActorSystem();

  try {
    // Create HTTP server actor
    const props: HttpServerProps = {
      actorClass: HttpServer,
      port: 3000,
      hostname: 'localhost'
    };
    console.log('Creating HTTP server actor...');
    const serverPid = await system.spawn(props);
    console.log('Server actor created with ID:', serverPid.id);
    const server = system.getActor(serverPid.id) as HttpServer;
    const router = server.getRouter();

    // Create and add middleware
    console.log('Creating middleware actors...');
    const loggerPid = await system.spawn({
      actorClass: LoggerMiddleware,
      actorContext: { name: 'RequestLogger' }
    });
    console.log('Logger middleware created with ID:', loggerPid.id);

    const corsPid = await system.spawn({
      actorClass: CorsMiddleware,
      actorContext: { name: 'CORS' }
    });
    console.log('CORS middleware created with ID:', corsPid.id);

    const authPid = await system.spawn({
      actorClass: AuthMiddleware,
      actorContext: { name: 'Auth' }
    });
    console.log('Auth middleware created with ID:', authPid.id);

    // Add middleware to server
    console.log('Adding middleware to server...');
    console.log('Adding logger middleware...');
    await system.send(serverPid, { type: 'middleware.add', payload: loggerPid });
    console.log('Adding CORS middleware...');
    await system.send(serverPid, { type: 'middleware.add', payload: corsPid });
    console.log('Adding Auth middleware...');
    await system.send(serverPid, { type: 'middleware.add', payload: authPid });
    console.log('All middleware added');

    // Define protected routes
    console.log('Defining routes...');
    router.get('/api/protected', async (ctx: HttpContext) => {
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
    router.get('/', async () => ({
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      body: 'Hello from Bactor Web!'
    }));

    // Start the server
    console.log('Starting server...');
    await system.send(serverPid, { type: 'start' });
    console.log('Server started');
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('\nShutting down server...');
      await system.send(serverPid, { type: 'stop' });
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 