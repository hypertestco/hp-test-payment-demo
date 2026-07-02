import "./hyperprobe";
import express from "express";
import path from "path";
import { CONFIG } from "./config";
import { getLatestTransactions, initializeDatabase } from "./db";
import { metrics } from "./metrics";
import { initializeQueue, queueService } from "./queue";
import { webhookRouter } from "./webhook";

const app = express();
const PORT = CONFIG.PORT;

app.use(express.json());

// ==========================================
// REAL-TIME CONSOLE LOG INTERCEPTOR (SSE)
// ==========================================
const logBuffer: string[] = [];
const logListeners: ((msg: string) => void)[] = [];

const originalLog = console.log;
const originalError = console.error;

function captureAndBroadcastLog(type: "INFO" | "ERROR", args: any[]) {
  let message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");

  const duplicatePrefix = `[${type}]`;
  if (message.startsWith(duplicatePrefix)) {
    message = message.substring(duplicatePrefix.length).trim();
  }

  const formattedLog = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;

  logBuffer.push(formattedLog);
  if (logBuffer.length > 200) {
    logBuffer.shift(); // keep last 200 entries
  }

  // Notify any active browser clients listening to the stream
  logListeners.forEach((listener) => listener(formattedLog));
}

console.log = (...args: any[]) => {
  originalLog.apply(console, args);
  captureAndBroadcastLog("INFO", args);
};

console.error = (...args: any[]) => {
  originalError.apply(console, args);
  captureAndBroadcastLog("ERROR", args);
};

// ==========================================
// ROUTES
// ==========================================

// Webhook Router
app.use(webhookRouter);

// CPU Sampling variables
let lastCpuUsage = process.cpuUsage();
let lastCpuSampleTime = Date.now();

// Metrics endpoint (resolves queue size and processes genuine process telemetry)
app.get("/metrics", async (req, res) => {
  try {
    const queueSize = queueService ? await queueService.getPendingCount() : 0;

    // Get real Node.js process memory metrics
    const memUsage = process.memoryUsage();
    
    // Calculate real Node.js CPU utilization percentage
    const currentCpuUsage = process.cpuUsage();
    const currentSampleTime = Date.now();
    
    const userDiff = currentCpuUsage.user - lastCpuUsage.user;
    const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
    const timeDiffMs = currentSampleTime - lastCpuSampleTime;
    
    const totalCpuTimeMicrosec = userDiff + systemDiff;
    const timeDiffMicrosec = timeDiffMs * 1000;
    
    let cpuPercent = 0;
    if (timeDiffMicrosec > 0) {
      cpuPercent = parseFloat(((totalCpuTimeMicrosec / timeDiffMicrosec) * 100).toFixed(1));
    }
    
    lastCpuUsage = currentCpuUsage;
    lastCpuSampleTime = currentSampleTime;

    res.json({
      ...metrics.getMetrics(),
      queueSize,
      hostStats: {
        cpu: cpuPercent,
        rss: (memUsage.rss / 1024 / 1024).toFixed(1),
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
        heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(1),
        uptime: Math.round(process.uptime()),
        activeConnections: logListeners.length,
      }
    });
  } catch (err) {
    res.json({
      ...metrics.getMetrics(),
      queueSize: 0,
      hostStats: {
        cpu: 0,
        rss: "0.0",
        heapUsed: "0.0",
        heapTotal: "0.0",
        uptime: 0,
        activeConnections: 0,
      }
    });
  }
});

// Transactions endpoint (retrieves latest 50 database writes from Postgres)
app.get("/transactions", async (req, res) => {
  try {
    const transactions = await getLatestTransactions();
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch transactions from PostgreSQL" });
  }
});

// Server-Sent Events (SSE) Endpoint for Live Logs stream
app.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial buffer logs to fill terminal
  logBuffer.forEach((log) => {
    res.write(`data: ${log}\n\n`);
  });

  const listener = (msg: string) => {
    res.write(`data: ${msg}\n\n`);
  };

  logListeners.push(listener);

  req.on("close", () => {
    const index = logListeners.indexOf(listener);
    if (index !== -1) {
      logListeners.splice(index, 1);
    }
  });
});

// Serve index.html from static files folder
app.use(express.static(path.join(process.cwd(), "public")));

// ==========================================
// GLOBAL EXPRESS ERROR-HANDLING MIDDLEWARE
// ==========================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  metrics.incrementDirectWebhookErrors();

  console.error("[ERROR] Something went wrong.");

  // 3. Send 500 response immediately (prevents requests from hanging!)
  res.status(500).json({ error: "Something went wrong" });
});

// ==========================================
// UNCAUGHT EXCEPTION CRASH HANDLERS
// ==========================================
process.on("uncaughtException", (error) => {
  console.error("[ERROR] Something went wrong.");
});

process.on("unhandledRejection", (reason) => {
  console.error("[ERROR] Something went wrong.");
});

// ==========================================
// APP STARTUP
// ==========================================
async function startServer() {
  try {
    // 1. Initialize PostgreSQL database
    await initializeDatabase();

    // 2. Initialize Redis Queuing Service (requires Redis to be running)
    await initializeQueue();

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`[INFO] Server listening on port ${PORT}`);
    });
  } catch (err: any) {
    console.error(`[FATAL] Server failed to start: ${err.message}`);
    process.exit(1);
  }
}

startServer();
