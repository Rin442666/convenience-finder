import sql from 'mssql';

let sharedSqlPool: sql.ConnectionPool | null = null;

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
};

export type StoreFilters = {
  lat: number;
  lng: number;
  radius: number;
  brandIds?: string[];
  amenityIds?: string[];
  openOnly?: boolean;
  search?: string;
};

export const brands: Brand[] = [
  { id: 'circle-k', name: 'Circle K' },
  { id: 'winmart', name: 'WinMart+' },
  { id: 'gs25', name: 'GS25' },
  { id: 'familymart', name: 'FamilyMart' },
  { id: '7-eleven', name: '7-Eleven' },
];

export const amenities: Amenity[] = [
  { id: 'wifi', name: 'Wi‑Fi' },
  { id: 'parking', name: 'Bãi đậu xe' },
  { id: 'seating', name: 'Chỗ ngồi' },
  { id: '24h', name: '24/7' },
  { id: 'cashless', name: 'Có chuyển khoản' },
  { id: 'wc', name: 'Nhà vệ sinh' },
  { id: 'overnight', name: 'Cho phép qua đêm'},
];

export const defaultLocation = {
  lat: 21.03477,
  lng: 105.80266,
};

// Seed dữ liệu khởi tạo cho local DB / mock persistence.
// Đây là dữ liệu bắt đầu, không phải nguồn dữ liệu chính nếu sau này
// ta nối với SQLite/Postgres thật.
export const initialStoreSeed: StoreRecord[] = [
  {
    id: 'store-1',
    brandId: 'circle-k',
    name: 'Circle K Cầu Giấy',
    address: 'Số 12, Đường Cầu Giấy, Hà Nội',
    lat: 21.0368,
    lng: 105.7987,
    rating: 4.7,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'parking', 'cashless'],
  },
  {
    id: 'store-2',
    brandId: 'winmart',
    name: 'WinMart+ Quan Hoa',
    address: 'Ngõ 5, Phố Quan Hoa, Cầu Giấy, Hà Nội',
    lat: 21.0314,
    lng: 105.8041,
    rating: 4.5,
    isOpen: true,
    is24h: false,
    openHours: '06:00-23:00',
    amenities: ['wifi', 'seating', 'parking'],
  },
  {
    id: 'store-3',
    brandId: 'gs25',
    name: 'GS25 Nguyễn Khánh Toàn',
    address: 'Nguyễn Khánh Toàn, Cầu Giấy, Hà Nội',
    lat: 21.0389,
    lng: 105.8092,
    rating: 4.8,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'wc', 'cashless'],
  },
  {
    id: 'store-4',
    brandId: 'familymart',
    name: 'FamilyMart Đào Tấn',
    address: 'Đào Tấn, Ba Đình, Hà Nội',
    lat: 21.0295,
    lng: 105.8174,
    rating: 4.4,
    isOpen: false,
    is24h: false,
    openHours: '08:00-22:00',
    amenities: ['overnight', 'seating'],
  },
  {
    id: 'store-5',
    brandId: '7-eleven',
    name: '7-Eleven Phạm Hùng',
    address: 'Phạm Hùng, Nam Từ Liêm, Hà Nội',
    lat: 21.0187,
    lng: 105.7843,
    rating: 4.3,
    isOpen: true,
    is24h: false,
    openHours: '07:00-22:00',
    amenities: ['parking', 'cashless', 'wifi'],
  },
  {
    id: 'store-6',
    brandId: 'circle-k',
    name: 'Circle K Lê Văn Lương',
    address: 'Lê Văn Lương, Thanh Xuân, Hà Nội',
    lat: 20.9989,
    lng: 105.8158,
    rating: 4.6,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'parking', 'cashless', 'wc'],
  },
  {
    id: 'store-7',
    brandId: 'winmart',
    name: 'WinMart+ Xuân Đỉnh',
    address: 'Xuân Đỉnh, Bắc Từ Liêm, Hà Nội',
    lat: 21.0593,
    lng: 105.7966,
    rating: 4.5,
    isOpen: true,
    is24h: false,
    openHours: '06:30-22:30',
    amenities: ['parking', 'cashless', 'seating'],
  },
  {
    id: 'store-8',
    brandId: 'gs25',
    name: 'GS25 Hoàng Đạo Thúy',
    address: 'Hoàng Đạo Thúy, Hà Nội',
    lat: 21.0243,
    lng: 105.8035,
    rating: 4.7,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'seating', 'cashless'],
  },
  // --- Dữ liệu mẫu mở rộng rải khắp Hà Nội (đợt 2) ---
  {
    id: 'store-9',
    brandId: 'circle-k',
    name: 'Circle K Hàng Bài',
    address: 'Số 45, Phố Hàng Bài, Hoàn Kiếm, Hà Nội',
    lat: 21.0243,
    lng: 105.8536,
    rating: 4.6,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'cashless', 'wc'],
  },
  {
    id: 'store-10',
    brandId: 'winmart',
    name: 'WinMart+ Tràng Tiền',
    address: 'Số 12, Phố Tràng Tiền, Hoàn Kiếm, Hà Nội',
    lat: 21.0243,
    lng: 105.8575,
    rating: 4.4,
    isOpen: true,
    is24h: false,
    openHours: '06:00-23:00',
    amenities: ['cashless', 'parking'],
  },
  {
    id: 'store-11',
    brandId: 'gs25',
    name: 'GS25 Lý Thường Kiệt',
    address: 'Số 28, Phố Lý Thường Kiệt, Hoàn Kiếm, Hà Nội',
    lat: 21.0225,
    lng: 105.8485,
    rating: 4.8,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'seating', 'cashless', 'wc'],
  },
  {
    id: 'store-12',
    brandId: 'familymart',
    name: 'FamilyMart Kim Mã',
    address: 'Số 360, Phố Kim Mã, Ba Đình, Hà Nội',
    lat: 21.029,
    lng: 105.816,
    rating: 4.3,
    isOpen: true,
    is24h: false,
    openHours: '07:00-23:00',
    amenities: ['wifi', 'seating'],
  },
  {
    id: 'store-13',
    brandId: '7-eleven',
    name: '7-Eleven Liễu Giai',
    address: 'Số 15, Phố Liễu Giai, Ba Đình, Hà Nội',
    lat: 21.0335,
    lng: 105.8095,
    rating: 4.5,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'cashless', 'parking'],
  },
  {
    id: 'store-14',
    brandId: 'circle-k',
    name: 'Circle K Tây Sơn',
    address: 'Số 210, Phố Tây Sơn, Đống Đa, Hà Nội',
    lat: 21.0125,
    lng: 105.8245,
    rating: 4.4,
    isOpen: true,
    is24h: false,
    openHours: '22:00-06:00',
    amenities: ['wifi', 'overnight', 'cashless'],
  },
  {
    id: 'store-15',
    brandId: 'winmart',
    name: 'WinMart+ Chùa Bộc',
    address: 'Số 68, Phố Chùa Bộc, Đống Đa, Hà Nội',
    lat: 21.0085,
    lng: 105.8275,
    rating: 4.2,
    isOpen: true,
    is24h: false,
    openHours: '06:30-22:30',
    amenities: ['cashless', 'seating'],
  },
  {
    id: 'store-16',
    brandId: 'gs25',
    name: 'GS25 Bạch Mai',
    address: 'Số 175, Phố Bạch Mai, Hai Bà Trưng, Hà Nội',
    lat: 21.0075,
    lng: 105.8475,
    rating: 4.6,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'wc', 'cashless'],
  },
  {
    id: 'store-17',
    brandId: 'familymart',
    name: 'FamilyMart Minh Khai',
    address: 'Số 422, Phố Minh Khai, Hai Bà Trưng, Hà Nội',
    lat: 21.0055,
    lng: 105.857,
    rating: 4.3,
    isOpen: true,
    is24h: false,
    openHours: '08:00-22:00',
    amenities: ['parking', 'seating'],
  },
  {
    id: 'store-18',
    brandId: 'circle-k',
    name: 'Circle K Lạc Long Quân',
    address: 'Số 88, Phố Lạc Long Quân, Tây Hồ, Hà Nội',
    lat: 21.0515,
    lng: 105.811,
    rating: 4.5,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'parking', 'cashless'],
  },
  {
    id: 'store-19',
    brandId: 'winmart',
    name: 'WinMart+ Hoàng Quốc Việt',
    address: 'Số 105, Phố Hoàng Quốc Việt, Bắc Từ Liêm, Hà Nội',
    lat: 21.0455,
    lng: 105.7975,
    rating: 4.4,
    isOpen: true,
    is24h: false,
    openHours: '06:00-22:00',
    amenities: ['cashless', 'parking', 'wc'],
  },
  {
    id: 'store-20',
    brandId: '7-eleven',
    name: '7-Eleven Nguyễn Trãi',
    address: 'Số 250, Phố Nguyễn Trãi, Thanh Xuân, Hà Nội',
    lat: 20.9995,
    lng: 105.8155,
    rating: 4.6,
    isOpen: true,
    is24h: true,
    openHours: '24/7',
    amenities: ['wifi', 'seating', 'cashless'],
  },
];

// Thêm cửa hàng mới vào seed (dùng khi admin duyệt yêu cầu thêm cửa hàng).
// Không thêm trùng id để tránh nhân đôi khi duyệt lại.
export function addStoreToSeed(store: StoreRecord): void {
  if (!initialStoreSeed.some((item) => item.id === store.id)) {
    initialStoreSeed.push(store);
  }
}

// Tính trạng thái mở/đóng theo giờ hiện tại từ chuỗi openHours ("06:00-23:00").
// Xử lý cả khung giờ qua đêm ("22:00-06:00"). Nếu không parse được giờ thì
// giữ nguyên giá trị isOpen có sẵn (dữ liệu DB hoặc Google Places).
export function computeIsOpenNow(store: { isOpen: boolean; is24h: boolean; openHours?: string }): boolean {
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
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (closeMinutes > openMinutes) {
        return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }
    // Khung giờ qua đêm, ví dụ 22:00-06:00.
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

export function getStoreCatalog() {
  return {
    brands,
    amenities,
    stores: [...initialStoreSeed],
  };
}

function getSqlConfig() {
  const server = process.env.SQL_SERVER || 'LAPTOP-7QBE5ENO\\SQLEXPRESS';
  const database = process.env.SQL_DATABASE || 'ConvenienceFinder';
  const user = process.env.SQL_USERNAME;
  const password = process.env.SQL_PASSWORD;
  const instanceName = process.env.SQL_INSTANCE || (server.includes('\\') ? server.split('\\').pop() : undefined);
  const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined;

  const config: any = {
    server,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  if (instanceName && !server.includes('\\')) {
    config.options.instanceName = instanceName;
  }

  if (server.includes('\\') && instanceName) {
    config.options.instanceName = instanceName;
  }

  if (port && !server.includes('\\') && !instanceName) {
    config.port = port;
  }

  if (user && password) {
    config.user = user;
    config.password = password;
  }

  return config;
}

async function getSqlPool() {
  if (sharedSqlPool && sharedSqlPool.connected) {
    return sharedSqlPool;
  }

  const config = getSqlConfig();

  try {
    sharedSqlPool = await sql.connect(config);
    return sharedSqlPool;
  } catch (error) {
    console.error('Không thể kết nối SQL Server. Kiểm tra SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD, SQL_INSTANCE:', error);
    sharedSqlPool = null;
    return null;
  }
}

export async function getStoreCatalogFromDatabase() {
  const pool = await getSqlPool();

  if (!pool) {
    return null;
  }

  try {
    const [brandResult, amenityResult] = await Promise.all([
      pool.request().query(`SELECT Slug AS id, Name FROM dbo.Brands ORDER BY Name`),
      pool.request().query(`SELECT Slug AS id, Name FROM dbo.Amenities ORDER BY Name`),
    ]);

    return {
      brands: brandResult.recordset.map((item: any) => ({
        id: String(item.id),
        name: String(item.Name),
      })),
      amenities: amenityResult.recordset.map((item: any) => ({
        id: String(item.id),
        name: String(item.Name),
      })),
    };
  } catch (error) {
    console.error('Không thể truy vấn catalog từ SQL Server:', error);
    return null;
  }
}

export async function queryStoresFromDatabase(filters: StoreFilters): Promise<StoreRecord[] | null> {
  const pool = await getSqlPool();

  if (!pool) {
    return null;
  }

  try {
    // Lọc sơ bộ theo bounding-box ngay trong SQL để không phải tải cả bảng
    // về rồi mới lọc bằng haversine trong JS (rất đắt khi dữ liệu lớn).
    // 1 độ vĩ độ ≈ 111.32km; 1 độ kinh độ ≈ 111.32km * cos(vĩ độ).
    // Lọc chính xác theo bán kính tròn vẫn làm ở JS phía dưới.
    const latDelta = filters.radius / 111320;
    const lngDelta = filters.radius / (111320 * Math.cos((filters.lat * Math.PI) / 180));

    const storeResult = await pool
      .request()
      .input('minLat', sql.Float, filters.lat - latDelta)
      .input('maxLat', sql.Float, filters.lat + latDelta)
      .input('minLng', sql.Float, filters.lng - lngDelta)
      .input('maxLng', sql.Float, filters.lng + lngDelta)
      .query(`
      SELECT
        s.Id,
        b.Slug AS brandId,
        s.Name,
        s.Address,
        CAST(s.Latitude AS float) AS lat,
        CAST(s.Longitude AS float) AS lng,
        CAST(s.Rating AS float) AS rating,
        CAST(s.IsOpen AS bit) AS isOpen,
        CAST(s.Is24h AS bit) AS is24h,
        s.OpenHours
      FROM dbo.Stores s
      LEFT JOIN dbo.Brands b ON b.Id = s.BrandId
      WHERE s.Status = 'ACTIVE'
        AND s.Latitude BETWEEN @minLat AND @maxLat
        AND s.Longitude BETWEEN @minLng AND @maxLng
      ORDER BY s.Name
    `);

    const amenityResult = await pool.request().query(`
      SELECT sa.StoreId, a.Slug AS amenityId
      FROM dbo.StoreAmenities sa
      JOIN dbo.Amenities a ON a.Id = sa.AmenityId
      ORDER BY sa.StoreId, a.Slug
    `);

    const amenitiesByStore = new Map<string, string[]>();

    for (const item of amenityResult.recordset) {
      const storeId = String(item.StoreId);
      const amenityId = String(item.amenityId);
      const existing = amenitiesByStore.get(storeId) || [];
      existing.push(amenityId);
      amenitiesByStore.set(storeId, existing);
    }

    const mapped: StoreRecord[] = storeResult.recordset.map((store: any) => ({
      id: String(store.Id),
      brandId: store.brandId ? String(store.brandId) : '',
      name: String(store.Name),
      address: String(store.Address),
      lat: Number(store.lat),
      lng: Number(store.lng),
      rating: Number(store.rating) || 0,
      isOpen: Boolean(store.isOpen),
      is24h: Boolean(store.is24h),
      openHours: store.OpenHours ? String(store.OpenHours) : undefined,
      amenities: amenitiesByStore.get(String(store.Id)) || [],
    }));

    const normalizedSearch = (filters.search || '').trim().toLowerCase();

    return mapped
      .map((store: StoreRecord) => ({
        ...store,
        // Ưu tiên giờ mở cửa thực tế thay vì cột IsOpen có thể đã cũ trong DB.
        isOpen: computeIsOpenNow(store),
        distanceMeters: haversineDistanceMeters(filters.lat, filters.lng, store.lat, store.lng),
      }))
      .filter((store: StoreRecord & { distanceMeters: number }) => {
        const withinRadius = store.distanceMeters <= (filters.radius || 1000);
        const selectedBrands = filters.brandIds || [];
        const selectedAmenities = filters.amenityIds || [];
        const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(store.brandId);
        const matchesAmenity =
          selectedAmenities.length === 0 || selectedAmenities.every((amenityId) => store.amenities.includes(amenityId));
        const matchesOpen = !(filters.openOnly) || store.isOpen || store.is24h;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          store.name.toLowerCase().includes(normalizedSearch) ||
          store.address.toLowerCase().includes(normalizedSearch);

        return withinRadius && matchesBrand && matchesAmenity && matchesOpen && matchesSearch;
      })
      .sort((a: StoreRecord & { distanceMeters: number }, b: StoreRecord & { distanceMeters: number }) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  } catch (error) {
    console.error('Không thể truy vấn cửa hàng từ SQL Server:', error);
    return null;
  }
}

export function queryStores(filters: StoreFilters): StoreRecord[] {
  const {
    lat,
    lng,
    radius,
    brandIds = [],
    amenityIds = [],
    openOnly = false,
    search = '',
  } = filters;

  const normalizedSearch = search.trim().toLowerCase();

  return initialStoreSeed
    .map((store) => ({
      ...store,
      // Ghi đè trạng thái mở/đóng theo giờ hiện tại thay vì dùng giá trị cứng trong seed.
      isOpen: computeIsOpenNow(store),
      distanceMeters: haversineDistanceMeters(lat, lng, store.lat, store.lng),
    }))
    .filter((store) => {
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
    })
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
}
