# Payment Webhook Receiver

This project is a TypeScript (Express) application designed to receive payment webhooks asynchronously using a **Redis & BullMQ** message queue and write transaction records to a strict **PostgreSQL** database. 

---

## 🚀 Architectural Design (The API Version Matrix)

The application logic is extremely clean and standard. Every webhook request received is pushed into a **Redis Queue** for asynchronous worker execution. 


## 🛠️ Setup & Running

### 1. Install Dependencies
```bash
npm install
```

---

## 🔍 How to Debug these Issues in Seconds with Hyperprobe

Add the mcp server to your AI coding tool and login to the hyperprobe.

Describe the issues you are seeing at the demo link to your AI agent and tell it to do a root cause analysis using hyperprobe