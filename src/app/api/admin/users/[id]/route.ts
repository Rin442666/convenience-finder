import { NextResponse } from 'next/server';
import { getSessionFromRequest, requireAdmin, setServerUserActive } from '@/lib/server-auth';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** PATCH /api/admin/users/[id] — khóa/mở khóa tài khoản (chỉ admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const body = await request.json();
    const isActive = body?.isActive;
    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { message: 'Thiếu trạng thái isActive (true/false).' },
        { status: 400 }
      );
    }
    const result = await setServerUserActive(admin.id, id, isActive);
    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật tài khoản.' },
      { status: 500 }
    );
  }
}
