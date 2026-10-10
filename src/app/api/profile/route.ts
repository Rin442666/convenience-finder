import { NextResponse } from 'next/server';
import {
  getSessionFromRequest,
  toPublicUser,
  updateServerUserFullName,
} from '@/lib/server-auth';

/** PATCH /api/profile — đổi tên hiển thị. Yêu cầu đăng nhập. */
export async function PATCH(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { message: 'Bạn cần đăng nhập để thực hiện hành động này.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const fullName = String(body?.fullName || '');
    const result = await updateServerUserFullName(session.id, fullName);

    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json({ user: toPublicUser(result) });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật thông tin tài khoản.' },
      { status: 500 }
    );
  }
}
