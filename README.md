# Payment Webhook RCA Demo

This TypeScript Express service accepts payment webhooks, queues valid nested
payloads in Redis/BullMQ, and writes them to PostgreSQL. The RCA scenario keeps
an intentional compatibility defect for a legacy flat webhook payload.

## Prerequisites

- Node.js 20 or newer
- Docker with Compose
- A local `.env` based on `.env.example`, with non-placeholder database and
  observability settings where those integrations are required

## Run The RCA Demo

Run these commands from the repository root:

```bash
docker compose up -d --wait
npm ci
npm run build
npm run start:prod
```

## Trigger The Defect

Send the synthetic legacy flat payload with a safe correlation ID:

```bash
curl -i http://localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: rca-demo-001' \
  --data '{"event":"payment.succeeded","transaction_id":4242,"amount_in_cents":1999,"payment_type":"one_time"}'
```

Expected result:

- HTTP `500` with `X-Request-Id: rca-demo-001` in the response
- The request fails at the intentional `data.transaction_id` access
- No BullMQ job is queued
- No transaction is written to PostgreSQL

## Privacy

Webhook bodies can contain customer data. Do not log payloads or email
addresses, and do not place secrets in request IDs, URLs, probe conditions, or
captured variables. Sentry request bodies, headers, cookies, query strings, and
users are disabled and redacted defensively, but operators must still review
all telemetry and HyperProbe probe targets before using real data.

## Coding agent usage

Use your coding agent and debug the problem by giving the following prompt.
Use Hyperprobe mcp and debug the 500 response on post request on /webhook route.

## Traffic trigger

Trigger the same curl again when asked for to replicate and catch the issue in runtime.