import { Router } from "express";
import { metrics } from "./metrics";
import { queueService, QueueJobData } from "./queue";

export const webhookRouter = Router();

// ==========================================
// CENTRAL LATENCY & PERFORMANCE MIDDLEWARE
// ==========================================
webhookRouter.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith("/webhook")) {
      // 1. Record response time latency in metrics
      metrics.incrementWebhookRequests(duration, res.statusCode);

      // 2. Log response time to server terminal
      console.log(
        `[INFO] Webhook ${req.method} responded in ${duration}ms (Status: ${res.statusCode})`
      );
    }
  });
  next();
});

// Helper wrapper to safely forward async handler exceptions to the global error middleware
const asyncHandler = (fn: any) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================
// WEBHOOK RECEIVER ROUTE (QUEUE-FIRST ONLY)
// ==========================================
webhookRouter.post(
  "/webhook",
  asyncHandler(async (req: any, res: any) => {
    console.log("[INFO] Webhook received");

    const body = req.body;
    const event = body.event;

    if (event === "payment.succeeded") {
      const data = body.data;
      const transactionId = data.transaction_id;
      const amountInCents = data.amount_in_cents;
      const paymentType = data.payment_type;
      
      const email = data.customer?.email;

      const jobId = `job_${Math.random().toString(36).substring(2, 9)}`;

      const jobData: QueueJobData = {
        transactionId,
        amountInCents,
        paymentType,
        email,
      };

      // Push all webhook requests directly to the Redis BullMQ queue!
      await queueService.addJob(jobId, jobData);
      console.log(`[INFO] Webhook parsed. Job ${jobId} pushed to queue.`);

      res.status(202).json({
        status: "accepted",
        message: "Webhook queued for processing asynchronously",
        jobId,
      });
    } else {
      console.log(`[INFO] Ignoring unsupported event: ${event}`);
      res
        .status(400)
        .json({ status: "ignored", message: "Unsupported event type" });
    }
  })
);
