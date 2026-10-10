-- =====================================================================
-- ConvenienceFinder — SQLite schema
-- File này được commit lên git. Database runtime (data/app.db) sẽ tự động
-- được tạo từ schema + seed khi server khởi động lần đầu, nên ai clone repo
-- về cũng có data dùng ngay mà không cần cài đặt gì thêm.
-- =====================================================================

CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS amenities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  brand_slug TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  base_rating REAL NOT NULL DEFAULT 0,
  is_24h INTEGER NOT NULL DEFAULT 0,
  open_hours TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_amenities (
  store_id TEXT NOT NULL REFERENCES stores (id),
  amenity_slug TEXT NOT NULL REFERENCES amenities (slug),
  PRIMARY KEY (store_id, amenity_slug)
);

CREATE TABLE IF NOT EXISTS store_requests (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL REFERENCES users (id),
  submitted_by_name TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL DEFAULT 0,
  lng REAL NOT NULL DEFAULT 0,
  amenities TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Đánh giá sao của user. Mỗi user 1 đánh giá / cửa hàng (PRIMARY KEY kép).
CREATE TABLE IF NOT EXISTS reviews (
  store_id TEXT NOT NULL REFERENCES stores (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users (id),
  store_id TEXT NOT NULL REFERENCES stores (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_stores_lat_lng ON stores (lat, lng);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores (status);
