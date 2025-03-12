import { ActorSystem, Actor, Props } from "@bactor/core";
import { HttpServer, HttpServerProps } from "../server";
import { HttpRequest, HttpResponse, HttpContext } from "../types";
import { Router } from "../router";
import autocannon from "autocannon";

// Helper function to run a benchmark scenario
async function runBenchmark(config: autocannon.Options): Promise<void> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(config, (err, results) => {
      if (err) {
        console.error(`Benchmark error for ${config.title}:`, err);
        reject(err);
        return;
      }

      console.log(`=== Results for ${config.title} ===`);
      console.log(`Latency (avg): ${results.latency.average} ms`);
      console.log(`Requests/sec: ${results.requests.average}`);
      console.log(`Throughput: ${results.throughput.average / 1024 / 1024} MB/sec`);
      console.log("");

      resolve();
    });

    instance.on('response', (response: any) => {
      if (response.statusCode !== 200) {
        console.error(`Error: ${response.statusCode}`);
      }
    });
  });
}

// Main function - everything happens here
async function main() {
  // Create a simple benchmark server
  const system = new ActorSystem("localhost:50051");

  // Create router with benchmark routes
  const router = new Router({});

  // Echo endpoint
  router.get("/echo", async (ctx: HttpContext) => {
    return {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Hello from echo!" })
    };
  });

  // CPU intensive endpoint (fibonacci)
  router.get("/cpu/:n", async (ctx: HttpContext) => {
    const n = parseInt(ctx.params.n) || 10;
    const fib = (n: number): number => {
      if (n <= 1) return n;
      return fib(n - 1) + fib(n - 2);
    };
    const result = fib(n);
    return {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ n, result })
    };
  });

  // Data endpoint
  router.post("/data", async (ctx: HttpContext) => {
    const text = await new Response(ctx.request.body).text();
    const body = JSON.parse(text);
    return {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ received: body })
    };
  });

  // Create server with router
  const serverPid = await system.spawn({
    actorClass: HttpServer,
    actorContext: {
      port: 3000,
      hostname: "localhost",
      router
    }
  } as HttpServerProps);

  // Start the system
  await system.start();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("Starting benchmark tests...");

  try {
    // Run all benchmark scenarios
    await runAllScenarios();
  } finally {
    // Cleanup and exit
    await system.stop();
    console.log("Benchmark completed.");
  }
}

async function runAllScenarios() {
  // Basic echo benchmark
  await runBenchmark({
    title: "Echo GET endpoint",
    url: "http://localhost:3000/echo",
    method: "GET",
    duration: 10,
    connections: 100
  });

  // Simple CPU benchmark - lower number for faster tests
  await runBenchmark({
    title: "CPU intensive endpoint (small)",
    url: "http://localhost:3000/cpu/20",
    method: "GET",
    duration: 10,
    connections: 50
  });

  // Data posting benchmark
  await runBenchmark({
    title: "Data POST endpoint",
    url: "http://localhost:3000/data",
    method: "POST",
    body: JSON.stringify({ test: "data", items: [1, 2, 3, 4, 5] }),
    headers: {
      "content-type": "application/json"
    },
    duration: 10,
    connections: 100
  });
}

// Run the main function
main().catch(error => {
  console.error("Benchmark failed:", error);
  process.exit(1);
}); 