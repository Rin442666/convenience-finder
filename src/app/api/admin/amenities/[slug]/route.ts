import { NextResponse } from 'next/server';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { deleteAmenity, updateAmenityName } from '@/lib/store-db';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** PATCH /api/admin/amenities/[slug] — đổi tên tiện ích (chỉ admin). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { slug } = await params;
    const body = await request.json();
    const result = await updateAmenityName(slug, String(body?.name || ''));
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật tiện ích.' },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/amenities/[slug] — xóa tiện ích chưa được dùng (chỉ admin). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { slug } = await params;
    const result = await deleteAmenity(slug);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xóa tiện ích.' },
      { status: 500 }
    );
  }
}
