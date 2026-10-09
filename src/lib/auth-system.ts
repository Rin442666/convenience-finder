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

// Tài khoản demo và logic đăng nhập nằm ở `server-auth.ts` (SQLite).
// Yêu cầu thêm cửa hàng nằm ở `store-requests.ts` (SQLite, server-only).
// File này chỉ giữ type, quyền và label — an toàn để import từ client.

export function hasPermission(user: Partial<AppUser> | null | undefined, permission: Permission): boolean {
  if (!user || !user.role) {
    return false;
  }

  const permissions = user.permissions || permissionByRole[user.role as UserRole] || [];
  return permissions.includes(permission);
}

export function getRoleLabel(role: UserRole): string {
  return role === 'admin' ? 'Admin' : 'Người dùng';
}
