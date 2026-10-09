// Nghiệp vụ yêu cầu thêm cửa hàng — SQLite (server-only,
// KHÔNG import từ client component vì dùng node:sqlite qua getDb()).
import { dbAll, dbGet, dbRun } from './db';
import type { StoreRequestRecord, StoreRequestStatus } from './auth-system';

type RequestRow = {
  id: string;
  submitted_by: string;
  submitted_by_name: string;
  store_name: string;
  brand_name: string;
  address: string;
  lat: number;
  lng: number;
  amenities: string;
  notes: string;
  status: string;
  created_at: string;
};

function parseAmenities(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

function rowToRecord(row: RequestRow): StoreRequestRecord {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    storeName: row.store_name,
    brandName: row.brand_name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    amenities: parseAmenities(row.amenities),
    notes: row.notes,
    status: (row.status === 'APPROVED' || row.status === 'REJECTED' ? row.status : 'PENDING') as StoreRequestStatus,
    createdAt: row.created_at,
  };
}

export async function listPendingStoreRequests(): Promise<StoreRequestRecord[]> {
  const rows = await dbAll<RequestRow>(
    `SELECT * FROM store_requests WHERE status = 'PENDING' ORDER BY created_at DESC`
  );
  return rows.map(rowToRecord);
}

export async function createStoreRequest(payload: {
  submittedBy: string;
  submittedByName: string;
  storeName: string;
  brandName: string;
  address: string;
  lat: number;
  lng: number;
  amenities: string[];
  notes: string;
}): Promise<StoreRequestRecord> {
  const request: StoreRequestRecord = {
    id: `req-${Date.now()}`,
    submittedBy: payload.submittedBy,
    submittedByName: payload.submittedByName,
    storeName: payload.storeName,
    brandName: payload.brandName,
    address: payload.address,
    lat: payload.lat,
    lng: payload.lng,
    amenities: payload.amenities,
    notes: payload.notes,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  await dbRun(
    `INSERT INTO store_requests
     (id, submitted_by, submitted_by_name, store_name, brand_name, address, lat, lng, amenities, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [
      request.id,
      request.submittedBy,
      request.submittedByName,
      request.storeName,
      request.brandName,
      request.address,
      request.lat,
      request.lng,
      JSON.stringify(request.amenities),
      request.notes,
      request.createdAt,
    ]
  );
  return request;
}

export async function updateStoreRequestStatus(
  requestId: string,
  status: StoreRequestStatus
): Promise<StoreRequestRecord | null> {
  const info = await dbRun(`UPDATE store_requests SET status = ? WHERE id = ?`, [status, requestId]);
  if (info.changes === 0) {
    return null;
  }
  const row = await dbGet<RequestRow>(`SELECT * FROM store_requests WHERE id = ?`, [requestId]);
  return row ? rowToRecord(row) : null;
}
