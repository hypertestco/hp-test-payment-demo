import dotenv from "dotenv";
dotenv.config();

// Ensure critical environment variables exist
const requiredEnv = [
  "PORT",
  "REDIS_HOST",
  "REDIS_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
];

for (const envName of requiredEnv) {
  if (!process.env[envName]) {
    throw new Error(`[FATAL] Missing required environment variable: ${envName} inside .env file.`);
  }
}

export const CONFIG = {
  PORT: parseInt(process.env.PORT!, 10),
  REDIS_HOST: process.env.REDIS_HOST!,
  REDIS_PORT: parseInt(process.env.REDIS_PORT!, 10),
  DB_USER: process.env.DB_USER!,
  DB_PASSWORD: process.env.DB_PASSWORD!,
  DB_HOST: process.env.DB_HOST!,
  DB_PORT: parseInt(process.env.DB_PORT!, 10),
  DB_NAME: process.env.DB_NAME!,
};
