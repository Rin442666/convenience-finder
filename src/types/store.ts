export interface Store {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    rating?: number;
    isOpen?: boolean;
}

export interface UserLocation {
    lat: number;
    lng: number;
}