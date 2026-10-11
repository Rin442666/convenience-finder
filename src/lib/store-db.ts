/* Tầng dữ liệu cửa hàng — dual-mode SQLite/Postgres qua src/lib/db.ts.
   Không cần cài SQL Server. Chế độ suy ra từ DATABASE_URL.

   Lưu ý: module này chỉ dùng ở phía server (API routes). */
import { dbAll, dbGet, dbRun } from './db';

export type Brand = {
  id: string;
  name: string;
  logo?: string;
};

export type Amenity = {
  id: string;
  name: string;
};

export type StoreRecord = {
  id: string;
  brandId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  isOpen: boolean;
  is24h: boolean;
  openHours?: string;
  amenities: string[];
  distanceMeters?: number;
  // Số lượt đánh giá (optional để không vỡ code cũ).
  ratingCount?: number;
};

export type StoreFilters = {
  lat: number;
  lng: number;
  radius: number;
  brandIds?: string[];
  amenityIds?: string[];
  openOnly?: boolean;
  search?: string;
  sort?: 'nearest' | 'rating';
  minRating?: number;
};

export const brands: Brand[] = [
  { id: 'circle-k', name: 'Circle K' },
  { id: 'winmart', name: 'WinMart+' },
  { id: 'gs25', name: 'GS25' },
  { id: 'familymart', name: 'FamilyMart' },
  { id: '7-eleven', name: '7-Eleven' },
  { id: 'other', name: 'Khác' },
];

export const amenities: Amenity[] = [
  { id: 'wifi', name: 'Wi-Fi' },
  { id: 'parking', name: 'Bãi xe' },
  { id: 'seating', name: 'Chỗ ngồi' },
  { id: 'cashless', name: 'Có chuyển khoản' },
  { id: 'wc', name: 'Nhà vệ sinh' },
  { id: 'overnight', name: 'Cho phép qua đêm' },
];

export const defaultLocation = {
  lat: 21.03477,
  lng: 105.80266,
};

export const STORE_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Lấy số phút từ 0h theo giờ Việt Nam, bất kể server đang chạy ở múi giờ nào.
function getMinutesInStoreTimezone(now: Date = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: STORE_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return now.getHours() * 60 + now.getMinutes();
    }
    return hour * 60 + minute;
}

export function computeIsOpenNow(store: { isOpen: boolean; is24h: boolean; openHours?: string }, now?: Date): boolean {
    if (store.is24h) {
        return true;
    }
    const match = (store.openHours || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) {
        return store.isOpen;
    }
    const openMinutes = Number(match[1]) * 60 + Number(match[2]);
    const closeMinutes = Number(match[3]) * 60 + Number(match[4]);
    if (
        !Number.isFinite(openMinutes) || !Number.isFinite(closeMinutes) ||
        openMinutes < 0 || openMinutes >= 1440 || closeMinutes < 0 || closeMinutes >= 1440
    ) {
        return store.isOpen;
    }
    const nowMinutes = getMinutesInStoreTimezone(now);
    if (closeMinutes > openMinutes) {
        return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

export function applyRatingFilterAndSort<T extends { rating: number; distanceMeters?: number }>(
  stores: T[],
  filters: { sort?: 'nearest' | 'rating'; minRating?: number }
): T[] {
  const minRating = Number(filters.minRating) || 0;
  const filtered = minRating > 0 ? stores.filter((store) => store.rating >= minRating) : stores;
  if (filters.sort === 'rating') {
    return [...filtered].sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
    });
  }
  return [...filtered].sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* --- Đánh giá sao (lưu trong bảng reviews) ---
   Mỗi cửa hàng có điểm gốc (base_rating từ seed) + SEED_RATING_VOTES lượt "đệm"
   để 1-2 đánh giá mới không làm trung bình nhảy loạn — giữ nguyên cách tính
   của bản in-memory trước đây. */
const SEED_RATING_VOTES = 20;

type StoreRow = {
  id: string;
  brand_slug: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  base_rating: number;
  is_24h: number;
  open_hours: string | null;
};

async function getAmenitiesByStore(storeIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (storeIds.length === 0) {
    return map;
  }
  const placeholders = storeIds.map(() => '?').join(',');
  const rows = await dbAll<{ store_id: string; amenity_slug: string }>(
    `SELECT store_id, amenity_slug FROM store_amenities WHERE store_id IN (${placeholders})`,
    storeIds
  );
  for (const row of rows) {
    const existing = map.get(row.store_id) || [];
    existing.push(row.amenity_slug);
    map.set(row.store_id, existing);
  }
  return map;
}

function toStoreRecord(row: StoreRow, amenities: string[]): StoreRecord {
  return {
    id: row.id,
    brandId: row.brand_slug,
    name: row.name,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    rating: Number(row.base_rating) || 0,
    isOpen: true,
    is24h: Number(row.is_24h) === 1,
    openHours: row.open_hours || undefined,
    amenities,
  };
}

export async function getLiveRating(
  storeId: string,
  baseRating: number
): Promise<{ rating: number; ratingCount: number }> {
  const row = await dbGet<{ total: number; cnt: number }>(
    'SELECT COALESCE(SUM(rating), 0) AS total, COUNT(*) AS cnt FROM reviews WHERE store_id = ?',
    [storeId]
  );
  const userVotes = Number(row?.cnt) || 0;
  const userTotal = Number(row?.total) || 0;
  const count = SEED_RATING_VOTES + userVotes;
  const rating = round1((baseRating * SEED_RATING_VOTES + userTotal) / count);
  return { rating, ratingCount: count };
}

export async function getUserRating(storeId: string, userId: string): Promise<number | null> {
  const review = await getUserReview(storeId, userId);
  return review ? review.rating : null;
}

/* Tổng hợp đánh giá cho NHIỀU cửa hàng trong 1 query duy nhất —
   tránh N+1 query khi danh sách có hàng trăm cửa hàng. */
async function getReviewAggregates(
  storeIds: string[]
): Promise<Map<string, { total: number; cnt: number }>> {
  const map = new Map<string, { total: number; cnt: number }>();
  if (storeIds.length === 0) {
    return map;
  }
  // Chia chunk để không vượt giới hạn số params (SQLite ~999).
  const CHUNK = 500;
  for (let i = 0; i < storeIds.length; i += CHUNK) {
    const chunk = storeIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await dbAll<{ store_id: string; total: number; cnt: number }>(
      `SELECT store_id, COALESCE(SUM(rating), 0) AS total, COUNT(*) AS cnt
       FROM reviews WHERE store_id IN (${placeholders}) GROUP BY store_id`,
      chunk
    );
    for (const row of rows) {
      map.set(row.store_id, { total: Number(row.total) || 0, cnt: Number(row.cnt) || 0 });
    }
  }
  return map;
}

function liveRatingFromAggregate(
  baseRating: number,
  agg: { total: number; cnt: number } | undefined
): { rating: number; ratingCount: number } {
  const userVotes = agg?.cnt || 0;
  const userTotal = agg?.total || 0;
  const count = SEED_RATING_VOTES + userVotes;
  const rating = round1((baseRating * SEED_RATING_VOTES + userTotal) / count);
  return { rating, ratingCount: count };
}

export async function getUserReview(
  storeId: string,
  userId: string
): Promise<{ rating: number; comment: string } | null> {
  const row = await dbGet<{ rating: number; comment: string }>(
    'SELECT rating, comment FROM reviews WHERE store_id = ? AND user_id = ?',
    [storeId, userId]
  );
  return row ? { rating: Number(row.rating), comment: String(row.comment ?? '') } : null;
}

export const MAX_REVIEW_COMMENT_LENGTH = 500;

export async function submitStoreRating(
  storeId: string,
  userId: string,
  stars: number,
  baseRating: number,
  comment: string
): Promise<{ rating: number; ratingCount: number } | null> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return null;
  }
  const cleanComment = comment.trim().slice(0, MAX_REVIEW_COMMENT_LENGTH);
  /* Mỗi user 1 đánh giá/cửa hàng: chấm lại thì cập nhật (UPSERT).
     Dùng ISO string từ JS thay vì hàm giờ của từng engine để portable. */
  await dbRun(
    `INSERT INTO reviews (store_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (store_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
    [storeId, userId, stars, cleanComment, new Date().toISOString()]
  );
  return getLiveRating(storeId, baseRating);
}

export interface StoreReview {
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export async function listStoreReviews(storeId: string, limit = 20): Promise<StoreReview[]> {
  const rows = await dbAll<{
    user_id: string;
    user_name: string;
    rating: number;
    comment: string;
    created_at: string;
  }>(
    `SELECT r.user_id, u.full_name AS user_name, r.rating, r.comment, r.created_at
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.store_id = ? AND r.comment <> ''
     ORDER BY r.created_at DESC LIMIT ?`,
    [storeId, limit]
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    userName: String(row.user_name ?? 'Người dùng'),
    rating: Number(row.rating) || 0,
    comment: String(row.comment ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
}

export async function getStoreBaseRating(storeId: string): Promise<number | null> {
  const row = await dbGet<{ base_rating: number }>('SELECT base_rating FROM stores WHERE id = ?', [
    storeId,
  ]);
  return row ? Number(row.base_rating) || 0 : null;
}

export async function addStoreToSeed(store: StoreRecord): Promise<void> {
  const existing = await dbGet<{ id: string }>('SELECT id FROM stores WHERE id = ?', [store.id]);
  if (existing) {
    return;
  }
  await dbRun(
    `INSERT INTO stores
     (id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    [
      store.id,
      store.brandId || 'other',
      store.name,
      store.address,
      store.lat,
      store.lng,
      store.rating || 0,
      store.is24h ? 1 : 0,
      store.openHours || null,
      new Date().toISOString(),
    ]
  );
  for (const amenityId of store.amenities || []) {
    const amenityExists = await dbGet<{ slug: string }>(
      'SELECT slug FROM amenities WHERE slug = ?',
      [amenityId]
    );
    if (amenityExists) {
      await dbRun('INSERT INTO store_amenities (store_id, amenity_slug) VALUES (?, ?)', [
        store.id,
        amenityId,
      ]);
    }
  }
}

export async function listDynamicStores(): Promise<StoreRecord[]> {
  const rows = await dbAll<StoreRow>(
    `SELECT id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours FROM stores WHERE id LIKE 'store-req-%'`
  );
  const amenityMap = await getAmenitiesByStore(rows.map((row) => row.id));
  return rows.map((row) => toStoreRecord(row, amenityMap.get(row.id) || []));
}

export async function getStoreCatalog() {
  return (
    (await getStoreCatalogFromDatabase()) || { brands, amenities, stores: [] as StoreRecord[] }
  );
}

export async function getStoreCatalogFromDatabase() {
  try {
    const brandRows = await dbAll<Brand>('SELECT slug AS id, name FROM brands ORDER BY name');
    const amenityRows = await dbAll<Amenity>('SELECT slug AS id, name FROM amenities ORDER BY name');
    return { brands: brandRows, amenities: amenityRows };
  } catch (error) {
    console.error('Không thể truy vấn catalog từ database:', error);
    return null;
  }
}

type EnrichedStore = StoreRecord & { distanceMeters: number };

async function enrichAndFilterStores(rows: StoreRow[], filters: StoreFilters): Promise<StoreRecord[]> {
  const {
    lat,
    lng,
    radius,
    brandIds = [],
    amenityIds = [],
    openOnly = false,
    search = '',
  } = filters;

  const amenityMap = await getAmenitiesByStore(rows.map((row) => row.id));
  const normalizedSearch = search.trim().toLowerCase();

  const voteMap = await getReviewAggregates(rows.map((row) => row.id));

  const enriched = rows.map((row) => {
    const base: StoreRecord = toStoreRecord(row, amenityMap.get(row.id) || []);
    const live = liveRatingFromAggregate(base.rating, voteMap.get(base.id));
    const enrichedStore: EnrichedStore = {
      ...base,
      rating: live.rating,
      ratingCount: live.ratingCount,
      isOpen: computeIsOpenNow(base),
      distanceMeters: haversineDistanceMeters(lat, lng, base.lat, base.lng),
    };
    return enrichedStore;
  });

  const filtered = enriched.filter((store) => {
    const withinRadius = store.distanceMeters <= radius;
    const matchesBrand = brandIds.length === 0 || brandIds.includes(store.brandId);
    const matchesAmenity =
      amenityIds.length === 0 || amenityIds.every((amenityId) => store.amenities.includes(amenityId));
    const matchesOpen = !openOnly || store.isOpen || store.is24h;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      store.name.toLowerCase().includes(normalizedSearch) ||
      store.address.toLowerCase().includes(normalizedSearch);

    return withinRadius && matchesBrand && matchesAmenity && matchesOpen && matchesSearch;
  });

  return applyRatingFilterAndSort(filtered, filters);
}

export async function queryStoresFromDatabase(filters: StoreFilters): Promise<StoreRecord[] | null> {
  try {
    /* Lọc sơ bộ theo bounding-box ngay trong SQL để không phải tải cả bảng
       về rồi mới lọc bằng haversine trong JS.
       1 độ vĩ độ ≈ 111.32km; 1 độ kinh độ ≈ 111.32km * cos(vĩ độ).
       Lọc chính xác theo bán kính tròn vẫn làm ở JS phía dưới. */
    const latDelta = filters.radius / 111320;
    const lngDelta = filters.radius / (111320 * Math.cos((filters.lat * Math.PI) / 180));

    const rows = await dbAll<StoreRow>(
      `SELECT id, brand_slug, name, address, lat, lng, base_rating, is_24h, open_hours
       FROM stores
       WHERE status = 'ACTIVE'
         AND lat BETWEEN ? AND ?
         AND lng BETWEEN ? AND ?
       ORDER BY name`,
      [
        filters.lat - latDelta,
        filters.lat + latDelta,
        filters.lng - lngDelta,
        filters.lng + lngDelta,
      ]
    );

    return enrichAndFilterStores(rows, filters);
  } catch (error) {
    console.error('Không thể truy vấn cửa hàng từ database:', error);
    return null;
  }
}

export async function queryStores(filters: StoreFilters): Promise<StoreRecord[]> {
  return (await queryStoresFromDatabase(filters)) || [];
}


export interface AdminReviewItem extends StoreReview {
  storeId: string;
  storeName: string;
}

/** Liệt kê mọi đánh giá trong hệ thống cho admin (kể cả bình luận trống). */
export async function listAllReviews(limit = 100): Promise<AdminReviewItem[]> {
  const rows = await dbAll<{
    store_id: string;
    store_name: string;
    user_id: string;
    user_name: string;
    rating: number;
    comment: string;
    created_at: string;
  }>(
    `SELECT r.store_id, s.name AS store_name, r.user_id, u.full_name AS user_name,
            r.rating, r.comment, r.created_at
     FROM reviews r
     JOIN stores s ON s.id = r.store_id
     JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((row) => ({
    storeId: String(row.store_id),
    storeName: String(row.store_name ?? row.store_id),
    userId: String(row.user_id),
    userName: String(row.user_name ?? 'Người dùng'),
    rating: Number(row.rating) || 0,
    comment: String(row.comment ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
}

/** Admin xóa một đánh giá vi phạm. Trả true nếu có dòng bị xóa. */
export async function deleteReview(storeId: string, userId: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM reviews WHERE store_id = ? AND user_id = ?', [
    storeId,
    userId,
  ]);
  return result.changes > 0;
}

/** Slug hợp lệ: chữ thường, số, gạch ngang ngăn cách (vd: "circle-k"). */
export function normalizeSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 40) {
    return null;
  }
  return slug;
}

function validateCatalogName(name: string, label: string): { error?: string; clean?: string } {
  const clean = name.trim();
  if (!clean || clean.length > 60) {
    return { error: `${label} phải từ 1 đến 60 ký tự.` };
  }
  return { clean };
}

export async function listBrandsDb(): Promise<Brand[]> {
  return dbAll<Brand>('SELECT slug AS id, name FROM brands ORDER BY name');
}

export async function listAmenitiesDb(): Promise<Amenity[]> {
  return dbAll<Amenity>('SELECT slug AS id, name FROM amenities ORDER BY name');
}

/** Tìm brand theo tên (không phân biệt hoa thường) — dùng khi duyệt yêu cầu thêm cửa hàng. */
export async function findBrandByName(name: string): Promise<Brand | null> {
  const row = await dbGet<Brand>(
    'SELECT slug AS id, name FROM brands WHERE lower(name) = lower(?)',
    [name.trim()]
  );
  return row ?? null;
}

export async function createBrand(slug: string, name: string): Promise<{ error?: string }> {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) {
    return { error: 'Slug chỉ gồm chữ thường, số và gạch ngang (vd: circle-k).' };
  }
  const checked = validateCatalogName(name, 'Tên thương hiệu');
  if (checked.error || !checked.clean) {
    return { error: checked.error };
  }
  const exists = await dbGet('SELECT slug FROM brands WHERE slug = ?', [cleanSlug]);
  if (exists) {
    return { error: 'Slug này đã tồn tại.' };
  }
  await dbRun('INSERT INTO brands (slug, name) VALUES (?, ?)', [cleanSlug, checked.clean]);
  return {};
}

export async function updateBrandName(slug: string, name: string): Promise<{ error?: string }> {
  const checked = validateCatalogName(name, 'Tên thương hiệu');
  if (checked.error || !checked.clean) {
    return { error: checked.error };
  }
  const result = await dbRun('UPDATE brands SET name = ? WHERE slug = ?', [checked.clean, slug]);
  if (result.changes === 0) {
    return { error: 'Không tìm thấy thương hiệu.' };
  }
  return {};
}

export async function deleteBrand(slug: string): Promise<{ error?: string }> {
  const inUse = await dbGet<{ count: number }>(
    'SELECT COUNT(*) AS count FROM stores WHERE brand_slug = ?',
    [slug]
  );
  if (inUse && inUse.count > 0) {
    return { error: `Đang có ${inUse.count} cửa hàng dùng thương hiệu này, không thể xóa.` };
  }
  const result = await dbRun('DELETE FROM brands WHERE slug = ?', [slug]);
  if (result.changes === 0) {
    return { error: 'Không tìm thấy thương hiệu.' };
  }
  return {};
}

export async function createAmenity(slug: string, name: string): Promise<{ error?: string }> {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) {
    return { error: 'Slug chỉ gồm chữ thường, số và gạch ngang (vd: cho-phep-qua-dem).' };
  }
  const checked = validateCatalogName(name, 'Tên tiện ích');
  if (checked.error || !checked.clean) {
    return { error: checked.error };
  }
  const exists = await dbGet('SELECT slug FROM amenities WHERE slug = ?', [cleanSlug]);
  if (exists) {
    return { error: 'Slug này đã tồn tại.' };
  }
  await dbRun('INSERT INTO amenities (slug, name) VALUES (?, ?)', [cleanSlug, checked.clean]);
  return {};
}

export async function updateAmenityName(slug: string, name: string): Promise<{ error?: string }> {
  const checked = validateCatalogName(name, 'Tên tiện ích');
  if (checked.error || !checked.clean) {
    return { error: checked.error };
  }
  const result = await dbRun('UPDATE amenities SET name = ? WHERE slug = ?', [checked.clean, slug]);
  if (result.changes === 0) {
    return { error: 'Không tìm thấy tiện ích.' };
  }
  return {};
}

export async function deleteAmenity(slug: string): Promise<{ error?: string }> {
  const inUse = await dbGet<{ count: number }>(
    'SELECT COUNT(*) AS count FROM store_amenities WHERE amenity_slug = ?',
    [slug]
  );
  if (inUse && inUse.count > 0) {
    return { error: `Đang có ${inUse.count} cửa hàng dùng tiện ích này, không thể xóa.` };
  }
  const result = await dbRun('DELETE FROM amenities WHERE slug = ?', [slug]);
  if (result.changes === 0) {
    return { error: 'Không tìm thấy tiện ích.' };
  }
  return {};
}
