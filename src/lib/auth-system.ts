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

