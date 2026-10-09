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