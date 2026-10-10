import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbRun } from '@/lib/db';
import { findServerUserByEmail } from '@/lib/server-auth';
import { isMailConfigured, sendPasswordResetEmail } from '@/lib/mail';

// Token sống 15 phút. Lưu ISO string để so sánh TEXT đúng trên cả
// SQLite và Postgres.
const RESET_TTL_MS = 15 * 60 * 1000;

/** POST /api/auth/forgot-password — gửi mail đặt lại mật khẩu. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim();
    if (!email) {
      return NextResponse.json({ message: 'Vui lòng nhập email.' }, { status: 400 });
    }
    if (!isMailConfigured()) {
      return NextResponse.json(
        { message: 'Chức năng gửi mail chưa được cấu hình.' },
        { status: 503 }
      );
    }

    const user = await findServerUserByEmail(email);
    // Luôn trả 200 kể cả khi email không tồn tại — không để lộ
    // tài khoản nào có trong hệ thống.
    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      const id = `prst-${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
      await dbRun(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
        [id, user.id, tokenHash, expiresAt]
      );
      const origin = new URL(request.url).origin;
      const resetUrl = `${origin}/dat-lai-mat-khau?token=${token}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch {
        // Gửi mail lỗi thì thu hồi token để user thử lại sạch sẽ.
        await dbRun(`DELETE FROM password_resets WHERE id = ?`, [id]);
        return NextResponse.json(
          { message: 'Không gửi được email. Vui lòng thử lại sau.' },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      message: 'Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi.',
    });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xử lý yêu cầu lúc này.' },
      { status: 500 }
    );
  }
}
