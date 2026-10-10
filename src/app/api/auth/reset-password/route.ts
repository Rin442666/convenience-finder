import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbGet, dbRun } from '@/lib/db';
import { findServerUserById, hashPassword } from '@/lib/server-auth';

type ResetRow = {
  id: string;
  user_id: string;
  expires_at: string;
  used: number;
};

/** POST /api/auth/reset-password — đặt mật khẩu mới bằng token trong email. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();
    const newPassword = String(body?.newPassword || '');

    if (!token) {
      return NextResponse.json({ message: 'Thiếu token đặt lại.' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: 'Mật khẩu phải có ít nhất 6 ký tự.' },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await dbGet<ResetRow>(
      `SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?`,
      [tokenHash]
    );
    if (!row || row.used) {
      return NextResponse.json(
        { message: 'Link đặt lại không hợp lệ hoặc đã được dùng.' },
        { status: 400 }
      );
    }
    if (row.expires_at <= new Date().toISOString()) {
      return NextResponse.json(
        { message: 'Link đặt lại đã hết hạn. Vui lòng yêu cầu link mới.' },
        { status: 400 }
      );
    }

    const user = await findServerUserById(row.user_id);
    if (!user || !user.isActive) {
      return NextResponse.json({ message: 'Tài khoản không tồn tại.' }, { status: 400 });
    }

    await dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [
      hashPassword(newPassword),
      user.id,
    ]);
    // Token dùng 1 lần duy nhất.
    await dbRun(`UPDATE password_resets SET used = 1 WHERE id = ?`, [row.id]);

    return NextResponse.json({ message: 'Đặt lại mật khẩu thành công. Hãy đăng nhập lại.' });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xử lý yêu cầu lúc này.' },
      { status: 500 }
    );
  }
}
