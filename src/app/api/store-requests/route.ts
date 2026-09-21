import { NextResponse } from 'next/server';
import { createStoreRequest, hasPermission, listPendingStoreRequests, updateStoreRequestStatus } from '@/lib/auth-system';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userRole = searchParams.get('role');

  if (userRole !== 'admin') {
    return NextResponse.json({ requests: [] });
  }

  return NextResponse.json({ requests: listPendingStoreRequests() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const currentUser = body.user;

    if (!currentUser || !hasPermission(currentUser, 'submit_store_request')) {
      return NextResponse.json({ message: 'Bạn không có quyền gửi yêu cầu thêm cửa hàng.' }, { status: 403 });
    }

    const createdRequest = createStoreRequest({
      submittedBy: currentUser.id,
      submittedByName: currentUser.fullName,
      storeName: String(body.storeName || '').trim(),
      brandName: String(body.brandName || '').trim(),
      address: String(body.address || '').trim(),
      lat: Number(body.lat || 0),
      lng: Number(body.lng || 0),
      amenities: Array.isArray(body.amenities) ? body.amenities : [],
      notes: String(body.notes || '').trim(),
    });

    return NextResponse.json({ request: createdRequest, message: 'Yêu cầu thêm cửa hàng đã được gửi cho Admin.' });
  } catch (error) {
    return NextResponse.json({ message: 'Không thể gửi yêu cầu thêm cửa hàng.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const actor = body.actor;

    if (!actor || !hasPermission(actor, 'approve_store_request')) {
      return NextResponse.json({ message: 'Chỉ Admin mới được xác nhận yêu cầu cửa hàng.' }, { status: 403 });
    }

    const updated = updateStoreRequestStatus(body.requestId, body.status);

    if (!updated) {
      return NextResponse.json({ message: 'Không tìm thấy yêu cầu cần cập nhật.' }, { status: 404 });
    }

    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ message: 'Không thể cập nhật trạng thái yêu cầu.' }, { status: 500 });
  }
}
