import { NextResponse } from 'next/server';
import { createSessionToken, registerServerUser, toPublicUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = registerServerUser(
      String(body?.fullName || ''),
      String(body?.email || ''),
      String(body?.password || '')
    );

    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        token: createSessionToken(result),
        user: toPublicUser(result),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { message: 'Không thể đăng ký tài khoản.' },
      { status: 500 }
    );
  }
}
