import { NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/server-auth';

// Yêu thích lưu trong bảng favorites (theo user id) —
// đăng nhập máy nào cũng thấy, không còn phụ thuộc localStorage từng trình duyệt.
function requireSession(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return null;
  }
  return session;
}

// GET /api/favorites → danh sách storeId user đã yêu thích.
export async function GET(req: Request) {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ storeIds: [] }, { status: 401 });
  }

  const rows = await dbAll<{ store_id: string }>(
    'SELECT store_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    [session.id]
  );
  return NextResponse.json({ storeIds: rows.map((row) => row.store_id) });
}

// POST /api/favorites { storeId } → toggle yêu thích, trả về { favorited }.
export async function POST(req: Request) {
  const session = requireSession(req);
  if (!session) {
    return NextResponse.json({ message: 'Đăng nhập để lưu cửa hàng yêu thích.' }, { status: 401 });
  }

  let storeId = '';
  try {
    const body = await req.json();
    storeId = String(body.storeId || '');
  } catch {
    return NextResponse.json({ message: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  if (!storeId) {
    return NextResponse.json({ message: 'Thiếu storeId.' }, { status: 400 });
  }

  const existing = await dbGet<{ store_id: string }>(
    'SELECT store_id FROM favorites WHERE user_id = ? AND store_id = ?',
    [session.id, storeId]
  );

  if (existing) {
    await dbRun('DELETE FROM favorites WHERE user_id = ? AND store_id = ?', [session.id, storeId]);
    return NextResponse.json({ favorited: false });
  }
  await dbRun('INSERT INTO favorites (user_id, store_id, created_at) VALUES (?, ?, ?)', [
    session.id,
    storeId,
    new Date().toISOString(),
  ]);
  return NextResponse.json({ favorited: true });
}
