import { NextResponse } from 'next/server';
import {
  changeServerUserPassword,
  getSessionFromRequest,
} from '@/lib/server-auth';

/** PATCH /api/profile/password — đổi mật khẩu. Yêu cầu đăng nhập. */
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
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');
    const result = await changeServerUserPassword(
      session.id,
      currentPassword,
      newPassword
    );

    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json({ message: 'Đổi mật khẩu thành công.' });
  } catch {
    return NextResponse.json(
      { message: 'Không thể đổi mật khẩu.' },
      { status: 500 }
    );
  }
}
