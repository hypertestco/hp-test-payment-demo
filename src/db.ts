import { Pool, QueryResult } from "pg";
import { CONFIG } from "./config";
import { metrics } from "./metrics";

export interface DbTransaction {
  id: number;
  payment_id: number;
  email: string;
  payment_type: "one_time" | "auto_renewal";
  amount: number;
  created_at: string;
}

// Create a Postgres connection pool
export const pool = new Pool({
  user: CONFIG.DB_USER,
  host: CONFIG.DB_HOST,
  database: CONFIG.DB_NAME,
  password: CONFIG.DB_PASSWORD,
  port: CONFIG.DB_PORT,
  connectionTimeoutMillis: 5000, // Timeout after 5s if Postgres is offline
});

// Suppress unhandled pool errors
pool.on("error", () => {});

// ==========================================
// GENERIC QUERY HELPER METHOD
// ==========================================
export async function dbQuery(text: string, params?: any[]): Promise<QueryResult> {
  try {
    return await pool.query(text, params);
  } catch (err) {
    // Increment DB metrics on any SQL failure whatsoever, irrespective of the cause
    metrics.incrementDatabaseErrors();
    throw err;
  }
}

// ==========================================
// DATABASE INITIALIZATION
// ==========================================
export async function initializeDatabase(): Promise<void> {
  console.log(
    `[INFO] Checking PostgreSQL server at ${CONFIG.DB_HOST}:${CONFIG.DB_PORT}...`
  );

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        payment_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        payment_type VARCHAR(50) NOT NULL,
        amount INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(
      "[INFO] PostgreSQL connection successful! Schema initialized successfully."
    );
  } catch (err: any) {
    console.error(
      `[FATAL] Failed to connect or initialize PostgreSQL: ${err.message}`
    );
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// TRANS_INSERT (EXECUTES ACTUAL SQL INSERT)
// ==========================================
export async function insertTransaction(data: {
  payment_id: number;
  email: string;
  payment_type: "one_time" | "auto_renewal";
  amount: number;
}): Promise<DbTransaction> {
  const query = `
    INSERT INTO transactions (payment_id, email, payment_type, amount)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const result = await dbQuery(query, [
    data.payment_id,
    data.email,
    data.payment_type,
    data.amount,
  ]);
  return result.rows[0];
}

// ==========================================
// RETRIEVE LATEST 50 TRANSACTIONS
// ==========================================
export async function getLatestTransactions(): Promise<DbTransaction[]> {
  const query = `
    SELECT * FROM transactions
    ORDER BY created_at DESC, id DESC
    LIMIT 50;
  `;
  const result = await dbQuery(query);
  return result.rows;
}
