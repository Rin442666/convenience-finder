import { NextResponse } from 'next/server';
import {
  adminDeleteUser,
  adminUpdateUser,
  getSessionFromRequest,
  requireAdmin,
  type AdminUserUpdate,
} from '@/lib/server-auth';
import { vBool, vEmail, vText, vUsername } from '@/lib/validate';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/users/[id] — admin sửa tài khoản (chỉ admin).
 * Nhận một hoặc nhiều trường: fullName, email, username (null = xóa),
 * role ('user' | 'admin'), isActive (khóa/mở khóa). Trường nào gửi lên
 * đều được validate; sai định dạng → 400.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    const fields: AdminUserUpdate = {};

    if (body.fullName !== undefined) {
      const name = vText(body.fullName, 'Họ tên', { min: 2, max: 50 });
      if (!name.ok) {
        return NextResponse.json({ message: name.error }, { status: 400 });
      }
      fields.fullName = name.value;
    }
    if (body.email !== undefined) {
      const mail = vEmail(body.email);
      if (!mail.ok) {
        return NextResponse.json({ message: mail.error }, { status: 400 });
      }
      fields.email = mail.value;
    }
    if (body.username !== undefined) {
      const uname = vUsername(body.username);
      if (!uname.ok) {
        return NextResponse.json({ message: uname.error }, { status: 400 });
      }
      fields.username = uname.value;
    }
    if (body.role !== undefined) {
      if (body.role !== 'user' && body.role !== 'admin') {
        return NextResponse.json({ message: 'Vai trò không hợp lệ.' }, { status: 400 });
      }
      fields.role = body.role;
    }
    if (body.isActive !== undefined) {
      const active = vBool(body.isActive, 'Trạng thái hoạt động');
      if (!active.ok) {
        return NextResponse.json({ message: active.error }, { status: 400 });
      }
      fields.isActive = active.value;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ message: 'Không có gì để cập nhật.' }, { status: 400 });
    }

    const result = await adminUpdateUser(admin.id, id, fields);
    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, user: result.user });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật tài khoản.' },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/users/[id] — admin xóa hẳn tài khoản + dữ liệu liên quan (chỉ admin). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { id } = await params;
    const result = await adminDeleteUser(admin.id, id);
    if ('error' in result) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: 'Đã xóa tài khoản.' });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xóa tài khoản.' },
      { status: 500 }
    );
  }
}
