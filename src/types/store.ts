export interface Brand {
    id: string;
    name: string;
}

export interface Amenity {
    id: string;
    name: string;
}

export interface Store {
    id: string;
    brandId?: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    rating?: number;
    ratingCount?: number;
    isOpen?: boolean;
    is24h?: boolean;
    amenities?: string[];
    openHours?: string;
    distanceMeters?: number;
}

export interface UserLocation {
    lat: number;
    lng: number;
}

/* Trạm xe buýt gần một cửa hàng (API /api/stores/[id]/bus-stops).
   withinRadius = false nghĩa là trạm gần nhất nhưng nằm NGOÀI bán kính
   500 m — UI phải ghi rõ thay vì im lặng coi như "gần". */
export interface BusStop {
    id: string;
    name: string;
    lat: number;
    lng: number;
    routes?: string | null;
    distanceMeters: number;
    withinRadius: boolean;
}

/* Trạm sạc xe điện gần một cửa hàng (API
   /api/stores/[id]/charging-stations). Khác trạm bus ở bán kính:
   1 km thay vì 500 m. operator là hãng vận hành (VinFast, ...). */
/* Cây xăng gần một cửa hàng (API /api/stores/[id]/gas-stations).
   Cùng khuôn với ChargingStation, tra theo bán kính 1 km. */
export interface GasStation {
    id: string;
    name: string;
    lat: number;
    lng: number;
    operator?: string | null;
    distanceMeters: number;
    withinRadius: boolean;
}

export interface ChargingStation {
    id: string;
    name: string;
    lat: number;
    lng: number;
    operator?: string | null;
    distanceMeters: number;
    withinRadius: boolean;
}

export interface StoreFilters {
    lat: number;
    lng: number;
    radius: number;
    brandIds?: string[];
    amenityIds?: string[];
    openOnly?: boolean;
    search?: string;
    sort?: 'nearest' | 'rating';
    minRating?: number;
}