import { NextResponse } from 'next/server';
import { dbRun } from '@/lib/db';
import {
  createPasswordChangeRequest,
  findServerUserById,
  getSessionFromRequest,
} from '@/lib/server-auth';
import { isMailConfigured, sendPasswordChangeConfirmEmail } from '@/lib/mail';

/**
 * POST /api/profile/password/request — yêu cầu đổi mật khẩu.
 * Kiểm tra mật khẩu hiện tại rồi gửi mail xác nhận; mật khẩu mới
 * chỉ có hiệu lực sau khi user bấm link trong mail.
 */
export async function POST(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { message: 'Bạn cần đăng nhập để thực hiện hành động này.' },
        { status: 401 }
      );
    }
    if (!isMailConfigured()) {
      return NextResponse.json(
        { message: 'Chức năng gửi mail chưa được cấu hình.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');

    const result = await createPasswordChangeRequest(session.id, currentPassword, newPassword);
    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    const user = await findServerUserById(session.id);
    if (!user) {
      return NextResponse.json({ message: 'Không tìm thấy tài khoản.' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const confirmUrl = `${origin}/xac-nhan-doi-mat-khau?token=${result.token}`;
    try {
      await sendPasswordChangeConfirmEmail(user.email, confirmUrl);
    } catch {
      // Gửi mail lỗi thì thu hồi token để user thử lại sạch sẽ.
      await dbRun(`DELETE FROM password_resets WHERE id = ?`, [result.requestId]);
      return NextResponse.json(
        { message: 'Không gửi được email. Vui lòng thử lại sau.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: 'Đã gửi mail xác nhận tới email của bạn. Bấm vào link trong mail để hoàn tất.',
    });
  } catch {
    return NextResponse.json({ message: 'Không thể xử lý yêu cầu lúc này.' }, { status: 500 });
  }
}
