import { NextResponse } from 'next/server';
import { createSessionToken, loginServerUser, toPublicUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body?.email || body?.identifier || '').trim();
    const password = String(body?.password || '');

    if (!identifier || !password) {
      return NextResponse.json(
        { message: 'Vui lòng nhập đầy đủ thông tin đăng nhập.' },
        { status: 400 }
      );
    }

    const result = await loginServerUser(identifier, password);

    if (!result) {
      return NextResponse.json(
        { message: 'Username/email hoặc mật khẩu không đúng.' },
        { status: 401 }
      );
    }

    if ('locked' in result) {
      return NextResponse.json(
        { message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' },
        { status: 403 }
      );
    }

    const user = result;

    return NextResponse.json({
      token: createSessionToken(user),
      user: toPublicUser(user),
    });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xác thực người dùng.' },
      { status: 500 }
    );
  }
}
