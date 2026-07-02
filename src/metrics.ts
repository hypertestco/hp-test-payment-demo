export interface MinuteBucket {
  timestamp: string; // HH:MM:SS format
  webhookRequests: number;
  totalLatency: number; // Accumulated latency in ms
  successfulPayments: number;
  directWebhookErrors: number;
  consumerErrors: number;
  databaseErrors: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
}

export interface AppMetrics {
  cumulative: {
    webhookRequests: number;
    successfulPayments: number;
    directWebhookErrors: number;
    consumerErrors: number;
    databaseErrors: number;
    oneTimePayments: number;
    autoRenewals: number;
    status2xx: number;
    status4xx: number;
    status5xx: number;
  };
  hourly: (MinuteBucket & { avgLatency: number })[]; // Kept as 'hourly' for frontend backward-compatibility
  lastHourSummary: { // Kept as 'lastHourSummary' for frontend backward-compatibility, but represents last 5 mins
    throughput: number;
    avgLatency: number;
  };
}

class MetricsManager {
  private cumulative = {
    webhookRequests: 0,
    successfulPayments: 0,
    directWebhookErrors: 0,
    consumerErrors: 0,
    databaseErrors: 0,
    oneTimePayments: 0,
    autoRenewals: 0,
    status2xx: 0,
    status4xx: 0,
    status5xx: 0,
  };

  // We store 60 buckets, each representing 5 seconds.
  // 60 * 5s = 300s = exactly 5 minutes of high-resolution metrics!
  private buckets: { timestamp: number; data: Omit<MinuteBucket, "timestamp"> }[] = [];

  constructor() {
    this.initializeBuckets();
  }

  private initializeBuckets() {
    const now = Date.now();
    const currentFiveSecEpoch = Math.floor(now / 5000);
    for (let i = 0; i < 60; i++) {
      // Pre-populate last 5 minutes with 5s slots chronologically
      const ts = (currentFiveSecEpoch - (59 - i)) * 5000;
      this.buckets.push({
        timestamp: ts,
        data: {
          webhookRequests: 0,
          totalLatency: 0,
          successfulPayments: 0,
          directWebhookErrors: 0,
          consumerErrors: 0,
          databaseErrors: 0,
          status2xx: 0,
          status4xx: 0,
          status5xx: 0,
        },
      });
    }
  }

  private getBucketIndex(epochFiveSec: number): number {
    return epochFiveSec % 60;
  }

  private getCurrentBucket(): Omit<MinuteBucket, "timestamp"> {
    const now = Date.now();
    const epochFiveSec = Math.floor(now / 5000);
    const index = this.getBucketIndex(epochFiveSec);
    const bucketTimestamp = epochFiveSec * 5000;

    const bucket = this.buckets[index];
    if (bucket.timestamp !== bucketTimestamp) {
      // This is an expired bucket from 5 minutes ago. Reset it.
      bucket.timestamp = bucketTimestamp;
      bucket.data = {
        webhookRequests: 0,
        totalLatency: 0,
        successfulPayments: 0,
        directWebhookErrors: 0,
        consumerErrors: 0,
        databaseErrors: 0,
        status2xx: 0,
        status4xx: 0,
        status5xx: 0,
      };
    }
    return bucket.data;
  }

  private cleanOldBuckets() {
    const now = Date.now();
    const currentFiveSecEpoch = Math.floor(now / 5000);
    const cutoff = (currentFiveSecEpoch - 59) * 5000;

    for (let i = 0; i < 60; i++) {
      if (this.buckets[i].timestamp < cutoff) {
        this.buckets[i].timestamp = (currentFiveSecEpoch - (59 - i)) * 5000;
        this.buckets[i].data = {
          webhookRequests: 0,
          totalLatency: 0,
          successfulPayments: 0,
          directWebhookErrors: 0,
          consumerErrors: 0,
          databaseErrors: 0,
          status2xx: 0,
          status4xx: 0,
          status5xx: 0,
        };
      }
    }
  }

  incrementWebhookRequests(latencyMs: number, statusCode: number): void {
    this.cumulative.webhookRequests++;
    const current = this.getCurrentBucket();
    current.webhookRequests++;
    current.totalLatency += latencyMs;

    // Track status code ranges
    if (statusCode >= 200 && statusCode < 300) {
      this.cumulative.status2xx++;
      current.status2xx++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.cumulative.status4xx++;
      current.status4xx++;
    } else if (statusCode >= 500 && statusCode < 600) {
      this.cumulative.status5xx++;
      current.status5xx++;
    }
  }

  incrementSuccessfulPayments(): void {
    this.cumulative.successfulPayments++;
    this.getCurrentBucket().successfulPayments++;
  }

  incrementDirectWebhookErrors(): void {
    this.cumulative.directWebhookErrors++;
    this.getCurrentBucket().directWebhookErrors++;
  }

  incrementConsumerErrors(): void {
    this.cumulative.consumerErrors++;
    this.getCurrentBucket().consumerErrors++;
  }

  incrementDatabaseErrors(): void {
    this.cumulative.databaseErrors++;
    this.getCurrentBucket().databaseErrors++;
  }

  incrementOneTimePayments(): void {
    this.cumulative.oneTimePayments++;
  }

  incrementAutoRenewals(): void {
    this.cumulative.autoRenewals++;
  }

  getMetrics(): AppMetrics {
    this.cleanOldBuckets();

    // Sum stats for the last 5 minutes
    let totalRequestsLast5Mins = 0;
    let totalLatencyLast5Mins = 0;

    const sortedBuckets = [...this.buckets]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((b) => {
        const date = new Date(b.timestamp);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");

        totalRequestsLast5Mins += b.data.webhookRequests;
        totalLatencyLast5Mins += b.data.totalLatency;

        const avgLatency =
          b.data.webhookRequests > 0
            ? Math.round(b.data.totalLatency / b.data.webhookRequests)
            : 0;

        return {
          timestamp: `${hours}:${minutes}:${seconds}`, // Added seconds resolution for 5s ticks
          ...b.data,
          avgLatency,
        };
      });

    const last5MinsAvgLatency =
      totalRequestsLast5Mins > 0
        ? Math.round(totalLatencyLast5Mins / totalRequestsLast5Mins)
        : 0;

    return {
      cumulative: { ...this.cumulative },
      hourly: sortedBuckets,
      lastHourSummary: {
        throughput: totalRequestsLast5Mins,
        avgLatency: last5MinsAvgLatency,
      },
    };
  }
}

export const metrics = new MetricsManager();
