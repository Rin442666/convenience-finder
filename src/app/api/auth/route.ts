import { NextResponse } from 'next/server';
import { createSessionToken, loginServerUser, toPublicUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');

    const user = await loginServerUser(email, password);

    if (!user) {
      return NextResponse.json(
        { message: 'Email hoặc mật khẩu không đúng.' },
        { status: 401 }
      );
    }

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
