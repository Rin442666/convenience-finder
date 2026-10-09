// Persistence đơn giản cho store requests và cửa hàng đã duyệt.
//
// Vấn đề: mọi thứ đang nằm trong bộ nhớ (in-memory) nên mỗi lần restart
// `npm run dev` là yêu cầu đã duyệt/từ chối quay về PENDING, cửa hàng đã
// duyệt cũng biến mất. Module này lưu 2 thứ ra file JSON trong thư mục
// `data/` (đã gitignore) và nạp lại khi server khởi động.
//
// Chỉ dùng ở phía server (API routes). Không import từ client component
// vì có dùng node:fs.
import fs from 'node:fs';
import path from 'node:path';
import {
  getAllStoreRequests,
  restoreStoreRequests,
  type StoreRequestRecord,
  type StoreRequestStatus,
} from './auth-system';
import { addStoreToSeed, listDynamicStores, type StoreRecord } from './store-db';

const DATA_DIR = path.join(process.cwd(), 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'store-requests.json');
const APPROVED_STORES_FILE = path.join(DATA_DIR, 'approved-stores.json');

let loaded = false;

function isValidRequest(item: unknown): item is StoreRequestRecord {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const record = item as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.storeName === 'string' &&
    typeof record.address === 'string' &&
    typeof record.lat === 'number' &&
    typeof record.lng === 'number' &&
    (record.status === 'PENDING' || record.status === 'APPROVED' || record.status === 'REJECTED')
  );
}

function normalizeRequest(item: StoreRequestRecord): StoreRequestRecord {
  const status: StoreRequestStatus =
    item.status === 'APPROVED' || item.status === 'REJECTED' ? item.status : 'PENDING';
  return {
    id: item.id,
    submittedBy: typeof item.submittedBy === 'string' ? item.submittedBy : '',
    submittedByName: typeof item.submittedByName === 'string' ? item.submittedByName : '',
    storeName: item.storeName,
    brandName: typeof item.brandName === 'string' ? item.brandName : '',
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    amenities: Array.isArray(item.amenities) ? item.amenities.filter((a): a is string => typeof a === 'string') : [],
    notes: typeof item.notes === 'string' ? item.notes : '',
    status,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  };
}

function isValidStore(item: unknown): item is StoreRecord {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const record = item as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.startsWith('store-req-') &&
    typeof record.name === 'string' &&
    typeof record.lat === 'number' &&
    typeof record.lng === 'number'
  );
}

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Nạp dữ liệu từ đĩa 1 lần duy nhất cho mỗi tiến trình server.
// Chưa có file (lần chạy đầu) thì giữ seed mặc định trong code.
export function ensurePersistenceLoaded(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const parsed = readJsonFile(REQUESTS_FILE);
      if (Array.isArray(parsed)) {
        const records = parsed.filter(isValidRequest).map(normalizeRequest);
        if (records.length > 0) {
          restoreStoreRequests(records);
        }
      }
    }
  } catch {
    // File hỏng thì bỏ qua, dùng seed trong code.
  }

  try {
    if (fs.existsSync(APPROVED_STORES_FILE)) {
      const parsed = readJsonFile(APPROVED_STORES_FILE);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidStore(item)) {
            addStoreToSeed(item);
          }
        }
      }
    }
  } catch {
    // Bỏ qua, cửa hàng đã duyệt lần này sẽ được lưu lại sau.
  }
}

// Lưu toàn bộ requests hiện tại ra file. Gọi sau khi tạo mới hoặc đổi trạng thái.
export function saveStoreRequests(): void {
  try {
    writeJsonFile(REQUESTS_FILE, getAllStoreRequests());
  } catch {
    // Ghi file thất bại thì vẫn giữ dữ liệu trong bộ nhớ cho phiên hiện tại.
  }
}

// Lưu các cửa hàng đã duyệt ra file. Gọi sau khi admin duyệt request.
export function saveApprovedStores(): void {
  try {
    writeJsonFile(APPROVED_STORES_FILE, listDynamicStores());
  } catch {
    // Bỏ qua, dữ liệu trong bộ nhớ vẫn dùng được cho phiên hiện tại.
  }
}
