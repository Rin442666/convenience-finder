import { NextResponse } from 'next/server';
import { confirmPasswordChange } from '@/lib/server-auth';

/** POST /api/profile/password/confirm — xác nhận đổi mật khẩu bằng token trong email. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token || '');

    const result = await confirmPasswordChange(token);
    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json({ message: 'Đổi mật khẩu thành công. Hãy đăng nhập lại.' });
  } catch {
    return NextResponse.json({ message: 'Không thể xử lý yêu cầu lúc này.' }, { status: 500 });
  }
}
