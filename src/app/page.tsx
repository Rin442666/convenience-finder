'use client';

import { useState, useEffect } from 'react';
import MapView from '@/components/MapView';
import { Store, UserLocation } from '@/types/store';

export default function Home() {
    // Vị trí mặc định (Hà Nội)
    const [userLocation, setUserLocation] = useState<UserLocation>({
        lat: 21.03477,
        lng: 105.80266,
    });
    const [stores, setStores] = useState<Store[]>([]);
    const [radius, setRadius] = useState<number>(1000);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null); // Trạng thái cửa hàng được chọn

    // Lấy vị trí thực tế của người dùng từ trình duyệt
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                () => console.log('Không lấy được vị trí, dùng vị trí mặc định.')
            );
        }
    }, []);

    // Gọi API lấy danh sách cửa hàng
    useEffect(() => {
        // 1. Tạo AbortController để hủy các request bị trùng lặp
        const controller = new AbortController();
        const signal = controller.signal;

        async function fetchStores() {
            try {
                const res = await fetch(
                    `/api/stores?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${radius}`,
                    { signal } // Gắn signal vào fetch
                );
                
                // Bắt lỗi 429 từ backend trả về
                if (res.status === 429) {
                    console.warn('API đang quá tải (Rate Limit). Vui lòng đợi một lát!');
                    return;
                }

                const data = await res.json();
                setStores(data.stores || []);
            } catch (err: any) {
                // Bỏ qua lỗi nếu request bị chủ động hủy (AbortError)
                if (err.name !== 'AbortError') {
                    console.error('Lỗi lấy danh sách cửa hàng:', err);
                }
            }
        }

        // 2. Kỹ thuật Debounce: Chờ 800ms sau khi state thay đổi mới thực thi API
        const timeoutId = setTimeout(() => {
            fetchStores();
        }, 800);

        // 3. Hàm Cleanup: Chạy khi component unmount hoặc state thay đổi liên tục
        return () => {
            clearTimeout(timeoutId); // Xóa timeout cũ
            controller.abort();      // Hủy API cũ đang gọi dở
        };
        
    // 4. CHỈ theo dõi các thuộc tính cơ bản, không theo dõi nguyên object userLocation
    }, [userLocation.lat, userLocation.lng, radius]);

    // Hàm xử lý khi bấm nút "Chỉ đường"
    const handleDirections = (e: React.MouseEvent, store: Store) => {
        e.stopPropagation(); // Tránh bị trùng sự kiện bấm
        setSelectedStore(store); // Vẽ đường đi trên bản đồ web

        // Mở thêm tab Google Maps thực tế nếu muốn
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${store.lat},${store.lng}`;
        window.open(googleMapsUrl, '_blank');
    };

    return (
        <main className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                        📍 ConvenienceFinder
                    </h1>
                    <p className="text-gray-500 text-sm">Tìm cửa hàng tiện lợi gần bạn nhất</p>
                </div>

                {/* Bộ chọn bán kính */}
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Bán kính:</label>
                    <select
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        className="border rounded-lg px-3 py-1.5 text-sm bg-white text-gray-800 shadow-sm"
                    >
                        <option value={500}>500 m</option>
                        <option value={1000}>1 km</option>
                        <option value={2000}>2 km</option>
                    </select>
                </div>
            </div>

            {/* Grid chứa Map & Danh sách */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Khung bản đồ */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-md p-2 h-[550px]">
                    <MapView center={userLocation} stores={stores} selectedStore={selectedStore} />
                </div>

                {/* Danh sách cửa hàng */}
                <div className="bg-white rounded-2xl shadow-md p-4 h-[550px] overflow-y-auto">
                    <h2 className="font-bold text-lg mb-4 text-gray-800">
                        Danh sách cửa hàng ({stores.length})
                    </h2>

                    <div className="space-y-3">
                        {stores.map((store) => {
                            const isSelected = selectedStore?.id === store.id;
                            return (
                                <div
                                    key={store.id}
                                    onClick={() => setSelectedStore(store)}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer ${isSelected
                                            ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-semibold text-gray-900">{store.name}</h3>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{store.address}</p>

                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
                                        <span className="text-sm font-medium text-amber-500">
                                            ⭐ {store.rating}
                                        </span>
                                        <button
                                            onClick={(e) => handleDirections(e, store)}
                                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition"
                                        >
                                            🚀 Chỉ đường
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </main>
    );
}