import { NextResponse } from 'next/server';
import { getSessionFromRequest, requireAdmin } from '@/lib/server-auth';
import { deleteReview, listAllReviews } from '@/lib/store-db';

function deny(request: Request) {
  const session = getSessionFromRequest(request);
  return NextResponse.json(
    { message: session ? 'Bạn không có quyền thực hiện hành động này.' : 'Bạn cần đăng nhập.' },
    { status: session ? 403 : 401 }
  );
}

/** GET /api/admin/reviews — mọi đánh giá trong hệ thống (chỉ admin). */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const reviews = await listAllReviews(100);
    return NextResponse.json({ reviews });
  } catch {
    return NextResponse.json(
      { message: 'Không thể tải danh sách đánh giá.' },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/reviews?storeId=..&userId=.. — xóa đánh giá vi phạm (chỉ admin). */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return deny(request);
    }
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') || '';
    const userId = searchParams.get('userId') || '';
    if (!storeId || !userId) {
      return NextResponse.json(
        { message: 'Thiếu storeId hoặc userId.' },
        { status: 400 }
      );
    }
    const deleted = await deleteReview(storeId, userId);
    if (!deleted) {
      return NextResponse.json({ message: 'Không tìm thấy đánh giá.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xóa đánh giá.' },
      { status: 500 }
    );
  }
}
