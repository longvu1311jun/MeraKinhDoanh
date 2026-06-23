import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL environment variable");
    }

    pool = mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query<T>(
  sql: string,
  params?: (string | number | null | Date)[]
): Promise<T> {
  const p = getDbPool();
  const [rows] = await p.execute(sql, params);
  return rows as T;
}
