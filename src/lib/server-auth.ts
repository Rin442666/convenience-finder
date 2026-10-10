// Xác thực phía SERVER — module này chỉ được import từ API routes,
// không bao giờ import từ client component.
import crypto from 'crypto';
import { AppUser, Permission, UserRole, hasPermission, permissionByRole } from './auth-system';
import { dbAll, dbGet, dbRun } from './db';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // token sống 7 ngày

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.warn(
      '[auth] AUTH_SECRET chưa được cấu hình, đang dùng secret mặc định — ' +
        'chỉ an toàn cho môi trường dev, hãy đặt AUTH_SECRET khi deploy.'
    );
    return 'dev-secret-change-me';
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Hash mật khẩu bằng scrypt (có sẵn trong Node, không cần thêm dependency)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) {
    return false;
  }
  const derived = crypto.scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Session token tự chứa (HMAC-SHA256): server không cần lưu session,
// chỉ cần verify chữ ký là biết user id + role.
// ---------------------------------------------------------------------------
type SessionPayload = {
  sub: string; // user id
  role: UserRole;
  exp: number; // timestamp hết hạn (ms)
};

function base64UrlEncode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createSessionToken(user: AppUser): string {
  const payload: SessionPayload = {
    sub: user.id,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = base64UrlEncode(payload);
  const signature = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export type SessionInfo = {
  id: string;
  role: UserRole;
};

export function verifySessionToken(token: string): SessionInfo | null {
  const separatorIndex = token.lastIndexOf('.');
  if (separatorIndex <= 0) {
    return null;
  }
  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (!payload.sub || (payload.role !== 'user' && payload.role !== 'admin')) {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return null; // token hết hạn
    }
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

/** Đọc session từ header `Authorization: Bearer <token>`. */
export function getSessionFromRequest(req: Request): SessionInfo | null {
  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return verifySessionToken(header.slice(7).trim());
}

/** Kiểm tra quyền dựa trên session đã verify (không tin dữ liệu client gửi lên). */
export function sessionHasPermission(session: SessionInfo | null, permission: Permission): boolean {
  if (!session) {
    return false;
  }
  return hasPermission({ role: session.role } as AppUser, permission);
}

// ---------------------------------------------------------------------------
// User store phía server — SQLite (data/app.db). Tài khoản đăng ký được giữ
// lại kể cả khi restart server. Lần đầu chạy, 2 tài khoản demo được seed từ
// db/seed.sql (user@finder.local / admin@finder.local).
// ---------------------------------------------------------------------------
type UserRow = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: number;
};

function rowToAppUser(row: UserRow): AppUser {
  const role = (row.role === 'admin' ? 'admin' : 'user') as UserRole;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    password: row.password_hash,
    role,
    permissions: [...permissionByRole[role]],
    isActive: row.is_active === 1,
  };
}

export async function findServerUserById(id: string): Promise<AppUser | undefined> {
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? rowToAppUser(row) : undefined;
}

export async function findServerUserByEmail(email: string): Promise<AppUser | undefined> {
  const normalized = email.trim().toLowerCase();
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE lower(email) = ?', [normalized]);
  return row ? rowToAppUser(row) : undefined;
}

export async function loginServerUser(
  email: string,
  password: string
): Promise<AppUser | { locked: true } | null> {
  const user = await findServerUserByEmail(email);
  if (!user) {
    return null;
  }
  if (!user.isActive) {
    return { locked: true };
  }
  if (!verifyPassword(password, user.password)) {
    return null;
  }
  return user;
}

export async function registerServerUser(
  fullName: string,
  email: string,
  password: string
): Promise<AppUser | { error: string }> {
  const name = fullName.trim();
  const mail = email.trim();

  if (!name || !mail || !password) {
    return { error: 'Vui lòng nhập đầy đủ thông tin tài khoản.' };
  }
  if (password.length < 6) {
    return { error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }
  if (await findServerUserByEmail(mail)) {
    return { error: 'Tài khoản này đã tồn tại trong hệ thống.' };
  }

  const user: AppUser = {
    id: `user-${Date.now()}`,
    fullName: name,
    email: mail,
    password: hashPassword(password),
    role: 'user',
    permissions: [...permissionByRole.user],
    isActive: true,
  };
  await dbRun(
    'INSERT INTO users (id, full_name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [user.id, user.fullName, user.email, user.password, user.role, new Date().toISOString()]
  );
  return user;
}

/** Thông tin user trả về cho client — KHÔNG bao giờ gồm password. */
export function toPublicUser(user: AppUser): Omit<AppUser, 'password'> {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    permissions: [...user.permissions],
    isActive: user.isActive,
  };
}

/** Cập nhật tên hiển thị của user. */
export async function updateServerUserFullName(
  userId: string,
  fullName: string
): Promise<AppUser | { error: string }> {
  const name = fullName.trim();
  if (name.length < 2 || name.length > 50) {
    return { error: 'Tên hiển thị phải từ 2 đến 50 ký tự.' };
  }
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) {
    return { error: 'Không tìm thấy tài khoản.' };
  }
  await dbRun('UPDATE users SET full_name = ? WHERE id = ?', [name, userId]);
  return rowToAppUser({ ...row, full_name: name });
}

/**
 * Đổi mật khẩu: phải nhập đúng mật khẩu hiện tại.
 * Mật khẩu mới được hash bằng scrypt giống lúc đăng ký.
 */
export async function changeServerUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<AppUser | { error: string }> {
  if (newPassword.length < 6) {
    return { error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  }
  if (currentPassword === newPassword) {
    return { error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' };
  }
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row || row.is_active !== 1) {
    return { error: 'Không tìm thấy tài khoản.' };
  }
  if (!verifyPassword(currentPassword, row.password_hash)) {
    return { error: 'Mật khẩu hiện tại không đúng.' };
  }
  await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [
    hashPassword(newPassword),
    userId,
  ]);
  return rowToAppUser(row);
}

/** Thông tin user cho trang admin — KHÔNG bao giờ gồm password. */
export type AdminUserItem = Omit<AppUser, 'password'> & { createdAt: string };

type UserRowWithCreated = UserRow & { created_at: string };

/**
 * Kiểm tra request có phải của admin đang hoạt động không.
 * Tra lại DB thay vì tin role trong token (phòng khi admin bị hạ quyền/khóa mà token còn hạn).
 */
export async function requireAdmin(request: Request): Promise<AppUser | null> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return null;
  }
  const user = await findServerUserById(session.id);
  if (!user || !user.isActive || user.role !== 'admin') {
    return null;
  }
  return user;
}

/** Liệt kê toàn bộ user cho admin (không trả password hash). */
export async function listServerUsers(): Promise<AdminUserItem[]> {
  const rows = await dbAll<UserRowWithCreated>(
    'SELECT id, full_name, email, password_hash, role, is_active, created_at FROM users ORDER BY created_at ASC'
  );
  return rows.map((row) => ({ ...toPublicUser(rowToAppUser(row)), createdAt: row.created_at }));
}

/** Admin khóa/mở khóa tài khoản. Không cho tự khóa chính mình và không cho khóa admin cuối cùng. */
export async function setServerUserActive(
  adminId: string,
  targetId: string,
  isActive: boolean
): Promise<{ ok: true } | { error: string }> {
  if (adminId === targetId) {
    return { error: 'Không thể tự khóa tài khoản của chính mình.' };
  }
  const target = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) {
    return { error: 'Không tìm thấy tài khoản.' };
  }
  if (!isActive && target.role === 'admin') {
    const remaining = await dbGet<{ count: number }>(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
      [targetId]
    );
    if (!remaining || remaining.count === 0) {
      return { error: 'Không thể khóa admin cuối cùng còn hoạt động.' };
    }
  }
  await dbRun('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, targetId]);
  return { ok: true };
}
