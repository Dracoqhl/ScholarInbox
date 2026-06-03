import { execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";

let database: SqliteDatabase | null = null;
let databasePath: string | null = null;

export class SqliteDatabase {
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) {
      execSqlite(path, "PRAGMA user_version;");
    }
  }

  exec(sql: string): void {
    execSqlite(this.path, sql);
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.path, sql);
  }

  transaction<T>(operation: () => T): () => T {
    return () => {
      this.exec("BEGIN IMMEDIATE;");
      try {
        const result = operation();
        this.exec("COMMIT;");
        return result;
      } catch (error) {
        this.exec("ROLLBACK;");
        throw error;
      }
    };
  }
}

export class SqliteStatement {
  constructor(
    private readonly path: string,
    private readonly sql: string
  ) {}

  run(params?: Record<string, unknown> | unknown[]): void {
    execSqlite(this.path, interpolateSql(this.sql, params));
  }

  get<T>(params?: Record<string, unknown> | unknown[]): T | undefined {
    return this.all<T>(params)[0];
  }

  all<T>(params?: Record<string, unknown> | unknown[]): T[] {
    const sql = interpolateSql(this.sql, params);
    const output = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", this.path, sql], {
      encoding: "utf8"
    }).trim();
    return output ? (JSON.parse(output) as T[]) : [];
  }
}

export function resolveDatabasePath(value = process.env.DATABASE_PATH): string {
  const normalized = value?.trim();
  if (!normalized) {
    return resolve(process.cwd(), "data", "scholar-inbox.sqlite");
  }

  if (!isAbsolute(normalized)) {
    throw new Error("DATABASE_PATH must be an absolute path.");
  }

  return normalized;
}

export function getDatabase(path = resolveDatabasePath()): SqliteDatabase {
  if (database && databasePath === path) {
    return database;
  }

  database = new SqliteDatabase(path);
  database.exec("PRAGMA foreign_keys = ON;");
  databasePath = path;
  return database;
}

export function closeDatabase(): void {
  database = null;
  databasePath = null;
}

function interpolateSql(sql: string, params?: Record<string, unknown> | unknown[]): string {
  if (!params) return sql;

  if (Array.isArray(params)) {
    let index = 0;
    return sql.replace(/\?/g, () => toSqlLiteral(params[index++]));
  }

  return Object.entries(params)
    .sort(([left], [right]) => right.length - left.length)
    .reduce(
    (nextSql, [key, value]) => nextSql.replaceAll(`@${key}`, toSqlLiteral(value)),
    sql
    );
}

function execSqlite(path: string, sql: string): void {
  execFileSync("sqlite3", ["-cmd", ".timeout 5000", path, sql], { encoding: "utf8" });
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}
