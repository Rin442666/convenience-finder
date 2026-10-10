import { NextResponse } from 'next/server';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { deleteBrand, updateBrandName } from '@/lib/store-db';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** PATCH /api/admin/brands/[slug] — đổi tên thương hiệu (chỉ admin). */
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
    const result = await updateBrandName(slug, String(body?.name || ''));
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể cập nhật thương hiệu.' },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/brands/[slug] — xóa thương hiệu chưa được dùng (chỉ admin). */
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
    const result = await deleteBrand(slug);
    if (result.error) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xóa thương hiệu.' },
      { status: 500 }
    );
  }
}
