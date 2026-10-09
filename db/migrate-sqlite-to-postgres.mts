// Migrate dữ liệu từ SQLite (dev) sang PostgreSQL (production).
//
// Cách dùng (chạy 1 lần khi lên production):
//   DATABASE_URL=postgres://user:pass@host:5432/db npx tsx db/migrate-sqlite-to-postgres.mts
//   # hoặc chỉ định file SQLite khác:
//   SQLITE_PATH=data/app.db DATABASE_URL=postgres://... npx tsx db/migrate-sqlite-to-postgres.mts
//
// Script tự tạo schema Postgres nếu chưa có, rồi copy toàn bộ dữ liệu.
// Chạy lại cũng an toàn (ON CONFLICT DO NOTHING).
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const sqlitePath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'app.db');
const databaseUrl = process.env.DATABASE_URL || '';

if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
  console.error('Cần biến môi trường DATABASE_URL=postgres://...');
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error('Không tìm thấy file SQLite:', sqlitePath);
  process.exit(1);
}

const lite = new DatabaseSync(sqlitePath);
const pool = new Pool({ connectionString: databaseUrl });

try {
  // 1. Tạo schema Postgres nếu chưa có.
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.postgres.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Schema Postgres OK.');

  // 2. Copy dữ liệu từng bảng theo thứ tự phụ thuộc khóa ngoại.
  const tables = [
    'roles',
    'users',
    'brands',
    'amenities',
    'stores',
    'store_amenities',
    'store_requests',
    'reviews',
    'favorites',
  ];
  const BATCH = 500;

  for (const table of tables) {
    const rows = lite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`${table}: 0 dòng, bỏ qua.`);
      continue;
    }
    const cols = Object.keys(rows[0] as object);
    const colList = cols.map((c) => `"${c}"`).join(', ');

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders = batch
        .map((row, bi) => {
          const rowPh = cols.map((c, ci) => {
            values.push((row as Record<string, unknown>)[c]);
            return `$${bi * cols.length + ci + 1}`;
          });
          return `(${rowPh.join(', ')})`;
        })
        .join(', ');
      await pool.query(
        `INSERT INTO "${table}" (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        values
      );
    }
    console.log(`${table}: đã copy ${rows.length} dòng.`);
  }

  console.log('Migrate xong.');
} finally {
  await pool.end();
  lite.close();
}
