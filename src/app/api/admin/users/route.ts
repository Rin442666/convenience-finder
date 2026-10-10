import { NextResponse } from 'next/server';
import { getSessionFromRequest, listServerUsers, requireAdmin } from '@/lib/server-auth';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** GET /api/admin/users — danh sách người dùng (chỉ admin). */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const users = await listServerUsers();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { message: 'Không thể tải danh sách người dùng.' },
      { status: 500 }
    );
  }
}
