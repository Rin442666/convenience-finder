import { NextResponse } from 'next/server';
import { getSessionFromRequest, sessionHasPermission } from '@/lib/server-auth';
import { getStoreBaseRating, getUserReview, submitStoreRating, MAX_REVIEW_COMMENT_LENGTH } from '@/lib/store-db';

// Next.js 16: params là Promise, phải await.
type RouteParams = { params: Promise<{ id: string }> };

// Lấy đánh giá của chính user đang đăng nhập cho cửa hàng này
// (để highlight sao đã chấm và điền sẵn bình luận cũ).
// Khách vãng lai luôn nhận myRating: null.
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = getSessionFromRequest(req);

  if (!session) {
    return NextResponse.json({ myRating: null, myComment: '' });
  }

  const review = await getUserReview(id, session.id);
  return NextResponse.json({
    myRating: review ? review.rating : null,
    myComment: review ? review.comment : '',
  });
}

// Chấm sao 1-5 kèm bình luận (không bắt buộc) cho cửa hàng.
// Yêu cầu đăng nhập + quyền rate_store (cả role user và admin đều có).
// Mỗi user 1 đánh giá/cửa hàng; chấm lại thì cập nhật thay vì cộng thêm lượt.
export async function POST(req: Request, { params }: RouteParams) {
  const session = getSessionFromRequest(req);

  if (!session || !sessionHasPermission(session, 'rate_store')) {
    return NextResponse.json(
      { message: 'Đăng nhập để đánh giá cửa hàng.' },
      { status: 401 }
    );
  }

  const { id } = await params;

  let stars: number;
  let comment = '';
  try {
    const body = await req.json();
    stars = Number(body.stars);
    if (typeof body.comment === 'string') {
      comment = body.comment;
    }
  } catch {
    return NextResponse.json(
      { message: 'Dữ liệu không hợp lệ.' },
      { status: 400 }
    );
  }

  if (comment.trim().length > MAX_REVIEW_COMMENT_LENGTH) {
    return NextResponse.json(
      { message: `Bình luận tối đa ${MAX_REVIEW_COMMENT_LENGTH} ký tự.` },
      { status: 400 }
    );
  }

  const baseRating = await getStoreBaseRating(id);

  if (baseRating === null) {
    return NextResponse.json(
      { message: 'Không tìm thấy cửa hàng.' },
      { status: 404 }
    );
  }

  const result = await submitStoreRating(id, session.id, stars, baseRating, comment);

  if (!result) {
    return NextResponse.json(
      { message: 'Số sao phải là số nguyên từ 1 đến 5.' },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}
