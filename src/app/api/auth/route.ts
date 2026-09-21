import { NextResponse } from 'next/server';
import { loginDemoUser } from '@/lib/auth-system';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');

    const user = loginDemoUser(email, password);

    if (!user) {
      return NextResponse.json(
        { message: 'Email hoặc mật khẩu không đúng.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: 'Không thể xác thực người dùng.' },
      { status: 500 }
    );
  }
}
