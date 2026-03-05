import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "../config";

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export function initializeDatabase(): Database.Database {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      quicknode_id TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'starter',
      endpoint_id TEXT,
      chain TEXT,
      network TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deactivated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_instances_quicknode_id ON instances(quicknode_id);
    CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
  `);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
