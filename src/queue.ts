import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { CONFIG } from "./config";
import { insertTransaction } from "./db";
import { metrics } from "./metrics";

export interface QueueJobData {
  transactionId: any;
  amountInCents: number;
  paymentType: "one_time" | "auto_renewal";
  email: string;
}

export interface IPaymentQueue {
  addJob(jobId: string, data: QueueJobData): Promise<void>;
  getPendingCount(): Promise<number>;
}

// ==========================================
// REDIS + BULLMQ QUEUE IMPLEMENTATION
// ==========================================
class BullPaymentQueue implements IPaymentQueue {
  private queue: Queue;
  private worker: Worker;

  constructor() {
    const connectionOptions = {
      host: CONFIG.REDIS_HOST,
      port: CONFIG.REDIS_PORT,
      maxRetriesPerRequest: null,
    };

    this.queue = new Queue("payment-processing", {
      connection: connectionOptions,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });

    this.worker = new Worker(
      "payment-processing",
      async (job: Job) => {
        console.log(
          `[INFO] Queue Consumer (BullMQ Worker) processing Job ${job.id}...`
        );
        const { transactionId, amountInCents, paymentType, email } = job.data;

        const normalizedEmail = (email || "anonymous@example.com").toLowerCase();

        await insertTransaction({
          payment_id: transactionId,
          email: normalizedEmail,
          payment_type: paymentType,
          amount: amountInCents,
        });

        metrics.incrementSuccessfulPayments();
        if (paymentType === "one_time") {
          metrics.incrementOneTimePayments();
        } else {
          metrics.incrementAutoRenewals();
        }

        console.log(
          `[INFO] Consumer successfully processed Job ${job.id} for user ${normalizedEmail}`
        );
      },
      { connection: connectionOptions }
    );

    // BullMQ failed event listener handles thrown exceptions inside the worker
    this.worker.on("failed", (job, err) => {
      metrics.incrementConsumerErrors();
      console.error(`[ERROR] Something went wrong in Job ${job?.id}`);
    });
  }

  async addJob(jobId: string, data: QueueJobData): Promise<void> {
    await this.queue.add("process-payment", data, { jobId });
  }

  async getPendingCount(): Promise<number> {
    const counts = await this.queue.getJobCounts("wait", "active");
    return (counts.wait || 0) + (counts.active || 0);
  }
}

// ==========================================
// QUEUE INITIALIZER (REQUIRES REDIS)
// ==========================================
export let queueService: IPaymentQueue;

export async function initializeQueue(): Promise<void> {
  console.log(
    `[INFO] Connecting to Redis server at ${CONFIG.REDIS_HOST}:${CONFIG.REDIS_PORT}...`
  );

  const testConnection = new IORedis({
    host: CONFIG.REDIS_HOST,
    port: CONFIG.REDIS_PORT,
    connectTimeout: 5000, // Timeout after 5s if offline
    lazyConnect: true,
  });

  try {
    await testConnection.connect();
    console.log("[INFO] Redis connection successful! Using BullMQ for queuing.");
    queueService = new BullPaymentQueue();
    testConnection.disconnect();
  } catch (err: any) {
    console.error(
      `[FATAL] Failed to connect to Redis server: ${err.message}. Please start Redis before running the app.`
    );
    throw err;
  }
}
