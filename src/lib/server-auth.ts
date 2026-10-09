// Xác thực phía SERVER — module này chỉ được import từ API routes,
// không bao giờ import từ client component.
import crypto from 'crypto';
import { AppUser, Permission, UserRole, hasPermission, permissionByRole } from './auth-system';

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
// User store phía server (thay cho localStorage ở client).
// Lưu ý: dữ liệu mất khi restart server — phù hợp cho dev/demo,
// khi lên production nên chuyển sang bảng Users trong SQL Server.
// ---------------------------------------------------------------------------
const serverUsers: AppUser[] = [
  {
    id: 'user-001',
    fullName: 'Nguyễn Văn User',
    email: 'user@finder.local',
    password: hashPassword('123456'),
    role: 'user',
    permissions: [...permissionByRole.user],
    isActive: true,
  },
  {
    id: 'admin-001',
    fullName: 'Quản trị viên',
    email: 'admin@finder.local',
    password: hashPassword('admin123'),
    role: 'admin',
    permissions: [...permissionByRole.admin],
    isActive: true,
  },
];

export function findServerUserById(id: string): AppUser | undefined {
  return serverUsers.find((user) => user.id === id);
}

export function findServerUserByEmail(email: string): AppUser | undefined {
  const normalized = email.trim().toLowerCase();
  return serverUsers.find((user) => user.email.toLowerCase() === normalized);
}

export function loginServerUser(email: string, password: string): AppUser | null {
  const user = findServerUserByEmail(email);
  if (!user || !user.isActive) {
    return null;
  }
  if (!verifyPassword(password, user.password)) {
    return null;
  }
  return user;
}

export function registerServerUser(
  fullName: string,
  email: string,
  password: string
): AppUser | { error: string } {
  const name = fullName.trim();
  const mail = email.trim();

  if (!name || !mail || !password) {
    return { error: 'Vui lòng nhập đầy đủ thông tin tài khoản.' };
  }
  if (password.length < 6) {
    return { error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }
  if (findServerUserByEmail(mail)) {
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
  serverUsers.push(user);
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
