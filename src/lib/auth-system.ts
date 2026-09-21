export type UserRole = 'user' | 'admin';

export type Permission =
  | 'search_stores'
  | 'view_store_details'
  | 'rate_store'
  | 'submit_store_request'
  | 'approve_store_request'
  | 'manage_stores'
  | 'manage_users';

export type AppUser = {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
};

export type StoreRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type StoreRequestRecord = {
  id: string;
  submittedBy: string;
  submittedByName: string;
  storeName: string;
  brandName: string;
  address: string;
  lat: number;
  lng: number;
  amenities: string[];
  notes: string;
  status: StoreRequestStatus;
  createdAt: string;
};

export const permissionByRole: Record<UserRole, Permission[]> = {
  user: ['search_stores', 'view_store_details', 'rate_store', 'submit_store_request'],
  admin: [
    'search_stores',
    'view_store_details',
    'rate_store',
    'submit_store_request',
    'approve_store_request',
    'manage_stores',
    'manage_users',
  ],
};

export const demoUsers: AppUser[] = [
  {
    id: 'user-001',
    fullName: 'Nguyễn Văn User',
    email: 'user@finder.local',
    password: '123456',
    role: 'user',
    permissions: permissionByRole.user,
    isActive: true,
  },
  {
    id: 'admin-001',
    fullName: 'Quản trị viên',
    email: 'admin@finder.local',
    password: 'admin123',
    role: 'admin',
    permissions: permissionByRole.admin,
    isActive: true,
  },
];

const storeRequests: StoreRequestRecord[] = [
  {
    id: 'req-001',
    submittedBy: 'user-001',
    submittedByName: 'Nguyễn Văn User',
    storeName: 'Mini Mart Hà Đông',
    brandName: 'FamilyMart',
    address: 'Đường Hà Đông, Hà Nội',
    lat: 20.9722,
    lng: 105.7778,
    amenities: ['wifi', 'parking'],
    notes: 'Cửa hàng mới trên tuyến xe buýt trung tâm.',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  },
];

export function loginDemoUser(email: string, password: string): AppUser | null {
  const user = demoUsers.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
  );

  if (!user || !user.isActive) {
    return null;
  }

  return {
    ...user,
    permissions: [...user.permissions],
  };
}

export function hasPermission(user: Partial<AppUser> | null | undefined, permission: Permission): boolean {
  if (!user || !user.role) {
    return false;
  }

  const permissions = user.permissions || permissionByRole[user.role as UserRole] || [];
  return permissions.includes(permission);
}

export function listPendingStoreRequests(): StoreRequestRecord[] {
  return storeRequests.filter((request) => request.status === 'PENDING');
}

export function createStoreRequest(payload: {
  submittedBy: string;
  submittedByName: string;
  storeName: string;
  brandName: string;
  address: string;
  lat: number;
  lng: number;
  amenities: string[];
  notes: string;
}): StoreRequestRecord {
  const request: StoreRequestRecord = {
    id: `req-${Date.now()}`,
    submittedBy: payload.submittedBy,
    submittedByName: payload.submittedByName,
    storeName: payload.storeName,
    brandName: payload.brandName,
    address: payload.address,
    lat: payload.lat,
    lng: payload.lng,
    amenities: payload.amenities,
    notes: payload.notes,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  storeRequests.unshift(request);
  return request;
}

export function updateStoreRequestStatus(requestId: string, status: StoreRequestStatus): StoreRequestRecord | null {
  const request = storeRequests.find((item) => item.id === requestId);

  if (!request) {
    return null;
  }

  request.status = status;
  return request;
}

export function getRoleLabel(role: UserRole): string {
  return role === 'admin' ? 'Admin' : 'Người dùng';
}

export const localSqlSchema = `
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo TEXT
);

CREATE TABLE IF NOT EXISTS amenities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS stores (
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

CREATE TABLE IF NOT EXISTS store_amenities (
  store_id TEXT NOT NULL,
  amenity_id TEXT NOT NULL,
  PRIMARY KEY (store_id, amenity_id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (amenity_id) REFERENCES amenities(id)
);

CREATE TABLE IF NOT EXISTS store_requests (
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

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, store_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS route_paths (
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
`;
