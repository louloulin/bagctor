import { ActorSystem, Actor, Props } from "@bactor/core";
import { HttpServer, HttpServerProps } from "../server";
import { HttpRequest, HttpResponse, HttpContext } from "../types";
import { Router } from "../router";
import autocannon from "autocannon";

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

// Helper function to run a benchmark scenario
async function runBenchmark(config: autocannon.Options): Promise<void> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(config, (err, results) => {
      if (err) {
        console.error(`Benchmark error for ${config.title}:`, err);
        reject(err);
        return;
      }

      console.log(`\nBenchmark results for ${config.title}:`);
      console.log("Requests/sec:", results.requests.average);
      console.log("Latency (ms):", results.latency.average);
      console.log("Throughput (MB/s):", results.throughput.average / 1024 / 1024);
      resolve();
    });

    autocannon.track(instance, {
      renderProgressBar: true,
      renderLatencyTable: true,
      renderResultsTable: true,
    });
  });
}

// Define benchmark scenarios
const scenarios: autocannon.Options[] = [
  {
    title: "Echo Endpoint (Low Load)",
    url: "http://localhost:3000/echo",
    connections: 10,
    pipelining: 1,
    duration: 10
  },
  {
    title: "Echo Endpoint (High Load)",
    url: "http://localhost:3000/echo",
    connections: 100,
    pipelining: 10,
    duration: 10
  },
  {
    title: "CPU Intensive (Fibonacci)",
    url: "http://localhost:3000/cpu/20",
    connections: 10,
    duration: 10
  },
  {
    title: "POST Data Test",
    url: "http://localhost:3000/data",
    method: "POST" as const,
    body: JSON.stringify({ test: "data" }),
    headers: {
      "content-type": "application/json"
    },
    connections: 10,
    duration: 10
  }
];

// Run all scenarios sequentially
async function runAllScenarios() {
  try {
    for (const scenario of scenarios) {
      await runBenchmark(scenario);
    }
    console.log("\nAll benchmark scenarios completed!");
    await system.stop();
    process.exit(0);
  } catch (error) {
    console.error("Error running benchmarks:", error);
    await system.stop();
    process.exit(1);
  }
}

// Handle process termination
process.once("SIGINT", async () => {
  console.log("\nBenchmark interrupted!");
  await system.stop();
  process.exit(0);
});

// Start benchmarks
runAllScenarios(); 