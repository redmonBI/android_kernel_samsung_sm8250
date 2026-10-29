import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { SCHEMA } from "./schema";
import { seedIfEmpty } from "./seed";

export type Sql = Database.Database;

const globalForDb = globalThis as unknown as { fkDb?: Sql };

export function openDatabase(filename: string): Sql {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(SCHEMA);
  return db;
}

export function databaseFile(): string {
  return path.join(process.cwd(), "data", "app.db");
}

export function getDb(): Sql {
  if (!globalForDb.fkDb) {
    const db = openDatabase(databaseFile());
    seedIfEmpty(db);
    globalForDb.fkDb = db;
  }
  return globalForDb.fkDb;
}

export function now(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return crypto.randomUUID();
}

export function audit(
  db: Sql,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uid(),
    userId,
    action,
    entity,
    entityId,
    before === undefined ? null : JSON.stringify(before),
    after === undefined ? null : JSON.stringify(after),
    now(),
  );
}

export function immediate<T>(db: Sql, fn: () => T): T {
  try {
    db.exec("BEGIN IMMEDIATE");
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("database is locked") || message.includes("SQLITE_BUSY")) {
      throw new Error("다른 사용자가 같은 재고를 처리하고 있습니다. 다시 시도해 주세요.");
    }
    throw error;
  }
}
