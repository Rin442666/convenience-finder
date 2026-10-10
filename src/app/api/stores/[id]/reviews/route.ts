import { NextResponse } from 'next/server';
import { listStoreReviews } from '@/lib/store-db';

// Next.js 16: params là Promise, phải await.
type RouteParams = { params: Promise<{ id: string }> };

// Danh sách bình luận đánh giá của một cửa hàng (mới nhất trước).
// Public: ai cũng xem được, không cần đăng nhập.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const reviews = await listStoreReviews(id, 20);
  return NextResponse.json({ reviews });
}
