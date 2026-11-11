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
  username TEXT UNIQUE,
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

-- Trạm xe buýt (dữ liệu OpenStreetMap). "Gần trạm" của 1 cửa hàng được
-- tính bằng haversine lúc chạy (xem getNearbyBusStops trong store-db.ts),
-- không lưu sẵn khoảng cách; riêng cờ lọc near_bus_stop nằm ở
-- store_amenities như một tiện ích bình thường.
CREATE TABLE IF NOT EXISTS bus_stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  routes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bus_stops_lat_lng ON bus_stops (lat, lng);

-- Trạm sạc xe điện (dữ liệu OpenStreetMap). Cách tính "gần" giống
-- bus_stops nhưng bán kính 1 km — xem getNearbyChargingStations trong
-- store-db.ts; cờ lọc là tiện ích ev_charging có sẵn trong amenities.
CREATE TABLE IF NOT EXISTS charging_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  operator TEXT
);

CREATE INDEX IF NOT EXISTS idx_charging_stations_lat_lng ON charging_stations (lat, lng);

-- Cây xăng gần cửa hàng: cùng khuôn với bus_stops / charging_stations
-- nhưng tra theo bán kính 1 km — xem getNearbyGasStations trong
-- store-db.ts; cờ lọc là tiện ích near_gas_station trong amenities.
CREATE TABLE IF NOT EXISTS gas_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  operator TEXT
);

CREATE INDEX IF NOT EXISTS idx_gas_stations_lat_lng ON gas_stations (lat, lng);

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

-- Token đặt lại mật khẩu (quên mật khẩu qua email). Token thô chỉ tồn tại
-- trong email gửi đi, DB chỉ lưu SHA-256 của token, hết hạn sau 15 phút.
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token_hash);
