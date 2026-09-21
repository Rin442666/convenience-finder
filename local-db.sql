CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo TEXT
);

CREATE TABLE amenities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  brand_id TEXT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  rating REAL DEFAULT 0,
  is_open INTEGER NOT NULL DEFAULT 1,
  is_24h INTEGER NOT NULL DEFAULT 0,
  open_hours TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE store_amenities (
  store_id TEXT NOT NULL,
  amenity_id TEXT NOT NULL,
  PRIMARY KEY (store_id, amenity_id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (amenity_id) REFERENCES amenities(id)
);

CREATE TABLE store_requests (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL,
  store_name TEXT NOT NULL,
  brand_name TEXT,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  amenities TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  FOREIGN KEY (submitted_by) REFERENCES users(id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, store_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE route_paths (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  end_lat REAL NOT NULL,
  end_lng REAL NOT NULL,
  geometry TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

INSERT INTO roles (name) VALUES ('user'), ('admin');

INSERT INTO users (id, full_name, email, password, role_id, is_active) VALUES
  ('user-001', 'Nguyễn Văn User', 'user@finder.local', '123456', 1, 1),
  ('admin-001', 'Quản trị viên', 'admin@finder.local', 'admin123', 2, 1);

INSERT INTO brands (id, name) VALUES
  ('circle-k', 'Circle K'),
  ('winmart', 'WinMart+'),
  ('gs25', 'GS25'),
  ('familymart', 'FamilyMart'),
  ('7-eleven', '7-Eleven');

INSERT INTO amenities (id, name) VALUES
  ('wifi', 'Wi‑Fi'),
  ('parking', 'Bãi đậu xe'),
  ('seating', 'Chỗ ngồi'),
  ('cashless', 'Thanh toán không tiền mặt'),
  ('wc', 'Nhà vệ sinh'),
  ('overnight', 'Cho phép qua đêm');

INSERT INTO stores (id, brand_id, name, address, lat, lng, rating, is_open, is_24h, open_hours, status, created_by) VALUES
  ('store-1', 'circle-k', 'Circle K Cầu Giấy', 'Số 12, Đường Cầu Giấy, Hà Nội', 21.0368, 105.7987, 4.7, 1, 1, '24/7', 'ACTIVE', 'admin-001'),
  ('store-2', 'winmart', 'WinMart+ Quan Hoa', 'Ngõ 5, Phố Quan Hoa, Cầu Giấy, Hà Nội', 21.0314, 105.8041, 4.5, 1, 0, '06:00-23:00', 'ACTIVE', 'admin-001'),
  ('store-3', 'gs25', 'GS25 Nguyễn Khánh Toàn', 'Nguyễn Khánh Toàn, Cầu Giấy, Hà Nội', 21.0389, 105.8092, 4.8, 1, 1, '24/7', 'ACTIVE', 'admin-001');

INSERT INTO store_amenities (store_id, amenity_id) VALUES
  ('store-1', 'wifi'),
  ('store-1', 'parking'),
  ('store-1', 'cashless'),
  ('store-2', 'wifi'),
  ('store-2', 'seating'),
  ('store-2', 'parking'),
  ('store-3', 'wifi'),
  ('store-3', 'wc'),
  ('store-3', 'cashless');

INSERT INTO store_requests (id, submitted_by, store_name, brand_name, address, lat, lng, amenities, notes, status) VALUES
  ('req-demo-1', 'user-001', 'Mini Mart Hà Đông', 'FamilyMart', 'Đường Hà Đông, Hà Nội', 20.9722, 105.7778, 'wifi,parking', 'Cửa hàng mới trên tuyến xe buýt trung tâm.', 'PENDING');
