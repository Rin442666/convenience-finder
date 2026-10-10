// Tầng database dùng chung (server-only, KHÔNG import từ client).
//
// Dual-mode:
// - Mặc định: SQLite file (data/app.db) qua node:sqlite — không cần cài gì,
//   phù hợp dev 2 người (schema + seed commit lên git, file .db gitignore
//   và tự tạo lần đầu chạy).
// - Production: set DATABASE_URL=postgres://... → tự dùng PostgreSQL
//   (cần `npm install pg`). Việc "lên đời" sau này chỉ là đổi biến môi trường.
//
// Mọi câu SQL trong app viết bằng placeholder `?`; helper tự dịch sang
// `$1, $2...` khi chạy Postgres. Tránh dùng hàm đặc thù của từng engine
// trong DML (dùng ISO string từ JS thay vì datetime('now')/now()).
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Pool } from 'pg';

export type DbMode = 'sqlite' | 'postgres';

/** Chế độ database hiện tại, suy ra từ biến môi trường. */
export function getDbMode(): DbMode {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgres' : 'sqlite';
}

type PgPoolLike = Pick<Pool, 'query'>;
// Pool thật từ package pg (chỉ load khi DATABASE_URL là postgres).

let sqliteDb: DatabaseSync | null = null;
let pgPool: PgPoolLike | null = null;
// Promise init dùng chung để chống race condition khi nhiều request
// gọi ensureInitialized() đồng thời (vd: Promise.all trong API route).
let initPromise: Promise<void> | null = null;

function getSchemaDir(): string {
  return path.join(process.cwd(), 'db');
}

function getSqlitePath(): string {
  return process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'app.db');
}

// Dịch placeholder ? -> $1, $2... cho Postgres.
// (SQL trong app không chứa ký tự ? trong string literal nên an toàn.)
function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function getPgPool(): Promise<PgPoolLike> {
  if (pgPool) {
    return pgPool;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[db] Thiếu DATABASE_URL cho chế độ Postgres.');
  }
  let pgModule: unknown;
  try {
    pgModule = await import('pg');
  } catch {
    throw new Error('[db] Chế độ Postgres cần package "pg". Chạy: npm install pg');
  }
  const PoolCtor = (pgModule as { Pool: new (config: { connectionString: string }) => PgPoolLike }).Pool;
  pgPool = new PoolCtor({ connectionString });
  return pgPool;
}

// Import 1 lần dữ liệu cũ từ thời JSON file (patch-11: data/*.json) vào DB mới
// để không mất request/cửa hàng đã duyệt trước đó. Chỉ chạy ở chế độ SQLite.
function importLegacyJsonFiles(db: DatabaseSync): void {
  try {
    const requestsPath = path.join(process.cwd(), 'data', 'store-requests.json');
    if (fs.existsSync(requestsPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(requestsPath, 'utf-8'));
      if (Array.isArray(parsed)) {
        const insert = db.prepare(
          `INSERT OR IGNORE INTO store_requests
           (id, submitted_by, submitted_by_name, store_name, brand_name, address, lat, lng, amenities, notes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of parsed) {
          const rec = r as Record<string, unknown>;
          if (rec && typeof rec.id === 'string' && typeof rec.storeName === 'string') {
            const amenities = Array.isArray(rec.amenities)
              ? rec.amenities.filter((a): a is string => typeof a === 'string')
              : [];
            insert.run(
              rec.id,
              typeof rec.submittedBy === 'string' ? rec.submittedBy : 'user-001',
              typeof rec.submittedByName === 'string' ? rec.submittedByName : '',
              rec.storeName,
              typeof rec.brandName === 'string' ? rec.brandName : '',
              typeof rec.address === 'string' ? rec.address : '',
              Number(rec.lat) || 0,
              Number(rec.lng) || 0,
              JSON.stringify(amenities),
              typeof rec.notes === 'string' ? rec.notes : '',
              rec.status === 'APPROVED' || rec.status === 'REJECTED' ? rec.status : 'PENDING',
              typeof rec.createdAt === 'string' ? rec.createdAt : new Date().toISOString()
            );
          }
        }
      }
    }
  } catch {
    // File cũ hỏng/thiếu thì bỏ qua, không chặn khởi động.
  }

  try {
    const storesPath = path.join(process.cwd(), 'data', 'approved-stores.json');
    if (fs.existsSync(storesPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(storesPath, 'utf-8'));
      if (Array.isArray(parsed)) {
        const insert = db.prepare(
          `INSERT OR IGNORE INTO stores
           (id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
        );
        const insertAmenity = db.prepare(
          `INSERT OR IGNORE INTO store_amenities (store_id, amenity_slug) VALUES (?, ?)`
        );
        for (const s of parsed) {
          const rec = s as Record<string, unknown>;
          if (rec && typeof rec.id === 'string' && typeof rec.name === 'string') {
            insert.run(
              rec.id,
              typeof rec.brandId === 'string' ? rec.brandId : 'other',
              rec.name,
              typeof rec.address === 'string' ? rec.address : '',
              Number(rec.lat) || 0,
              Number(rec.lng) || 0,
              Number(rec.rating) || 0,
              rec.is24h ? 1 : 0,
              typeof rec.openHours === 'string' ? rec.openHours : null
            );
            if (Array.isArray(rec.amenities)) {
              for (const a of rec.amenities) {
                if (typeof a === 'string') {
                  insertAmenity.run(rec.id, a);
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // Bỏ qua.
  }
}

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = doInit().catch((err: unknown) => {
      // Init lỗi thì cho phép thử lại ở request sau thay vì kẹt vĩnh viễn.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function doInit(): Promise<void> {
  const schemaDir = getSchemaDir();

  if (getDbMode() === 'postgres') {
    const pool = await getPgPool();
    const check = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'"
    );
    if (check.rows.length === 0) {
      await pool.query(fs.readFileSync(path.join(schemaDir, 'schema.postgres.sql'), 'utf-8'));
      await pool.query(fs.readFileSync(path.join(schemaDir, 'seed.sql'), 'utf-8'));
    }
    await runMigrations();
    return;
  }

  const dbPath = getSqlitePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync: DatabaseSyncCtor } = await import('node:sqlite');
  const db = new DatabaseSyncCtor(dbPath);
  sqliteDb = db;
  const hasUsers = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (!hasUsers) {
    db.exec(fs.readFileSync(path.join(schemaDir, 'schema.sql'), 'utf-8'));
    db.exec(fs.readFileSync(path.join(schemaDir, 'seed.sql'), 'utf-8'));
    importLegacyJsonFiles(db);
  }
  await runMigrations();
}

// Migration lũy tiến cho DB đã tồn tại từ trước (không chạy lại schema).
// Mỗi migration tự kiểm tra đã áp dụng chưa nên gọi lại nhiều lần vẫn an toàn.
async function runMigrations(): Promise<void> {
  if (getDbMode() === 'postgres') {
    const pool = await getPgPool();
    // Postgres hỗ trợ IF NOT EXISTS cho ADD COLUMN.
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT ''`);
    // Bảng token đặt lại mật khẩu (quên mật khẩu qua email).
    await pool.query(`CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users (id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (now()::text)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token_hash)`);
    return;
  }
  // SQLite không có ADD COLUMN IF NOT EXISTS -> kiểm tra qua PRAGMA.
  const db = requireSqliteDb();
  const cols = db.prepare(`PRAGMA table_info(reviews)`).all() as { name: string }[];
  if (!cols.some((col) => col.name === 'comment')) {
    db.exec(`ALTER TABLE reviews ADD COLUMN comment TEXT NOT NULL DEFAULT ''`);
  }
  const hasResets = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_resets'`)
    .get();
  if (!hasResets) {
    db.exec(`CREATE TABLE password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users (id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX idx_password_resets_token ON password_resets (token_hash)`);
  }
}

function requireSqliteDb(): DatabaseSync {
  if (!sqliteDb) {
    throw new Error('[db] SQLite chưa được khởi tạo.');
  }
  return sqliteDb;
}

function toSqliteParams(params: unknown[]): SQLInputValue[] {
  return params as SQLInputValue[];
}

// SELECT nhiều dòng.
export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureInitialized();
  if (getDbMode() === 'postgres') {
    const pool = await getPgPool();
    const res = await pool.query(toPostgresPlaceholders(sql), params);
    return res.rows as T[];
  }
  return requireSqliteDb().prepare(sql).all(...toSqliteParams(params)) as T[];
}

// SELECT 1 dòng (hoặc undefined).
export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, params);
  return rows[0];
}

// INSERT/UPDATE/DELETE. Trả về số dòng bị ảnh hưởng.
export async function dbRun(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  await ensureInitialized();
  if (getDbMode() === 'postgres') {
    const pool = await getPgPool();
    const res = await pool.query(toPostgresPlaceholders(sql), params);
    return { changes: res.rowCount ?? 0 };
  }
  const info = requireSqliteDb().prepare(sql).run(...toSqliteParams(params));
  return { changes: Number(info.changes) };
}

// Chạy DDL/script không tham số (schema, seed).
export async function dbExec(sql: string): Promise<void> {
  await ensureInitialized();
  if (getDbMode() === 'postgres') {
    const pool = await getPgPool();
    await pool.query(sql);
    return;
  }
  requireSqliteDb().exec(sql);
}
