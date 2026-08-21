'use client';

import { useEffect, useRef } from 'react';
import { Store, UserLocation } from '../types/store';

interface MapViewProps {
    center: UserLocation;
    stores: Store[];
    selectedStore?: Store | null; // Cửa hàng được chọn để chỉ đường
}

export default function MapView({ center, stores, selectedStore }: MapViewProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const routeLayerRef = useRef<any>(null);

    useEffect(() => {
        // Tải CSS Leaflet
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        const initMap = () => {
            if (!window.L || !mapContainerRef.current) return;

            if (!mapInstanceRef.current) {
                const map = window.L.map(mapContainerRef.current).setView([center.lat, center.lng], 14);

                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors',
                }).addTo(map);

                mapInstanceRef.current = map;
            }

            const map = mapInstanceRef.current;

            // Icon người dùng & cửa hàng
            const userIcon = window.L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41],
            });

            const storeIcon = window.L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41],
            });

            // Ghim vị trí người dùng
            window.L.marker([center.lat, center.lng], { icon: userIcon })
                .addTo(map)
                .bindPopup('<b>Vị trí của bạn</b>');

            // Ghim các cửa hàng
            stores.forEach((store) => {
                window.L.marker([store.lat, store.lng], { icon: storeIcon })
                    .addTo(map)
                    .bindPopup(`
            <div style="font-family: sans-serif;">
              <strong>${store.name}</strong><br/>
              <small>${store.address}</small>
            </div>
          `);
            });

            // Nếu có cửa hàng được chọn, tiến hành vẽ tuyến đường đi bằng OSRM
            if (selectedStore) {
                // Xóa tuyến đường cũ nếu có
                if (routeLayerRef.current) {
                    map.removeLayer(routeLayerRef.current);
                }

                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${center.lng},${center.lat};${selectedStore.lng},${selectedStore.lat}?overview=full&geometries=geojson`;

                fetch(osrmUrl)
                    .then((res) => res.json())
                    .then((data) => {
                        if (data.routes && data.routes.length > 0) {
                            const routeGeometry = data.routes[0].geometry;

                            // Vẽ tuyến đường màu xanh lam nõn chuối/xanh dương đậm
                            routeLayerRef.current = window.L.geoJSON(routeGeometry, {
                                style: {
                                    color: '#2563eb',
                                    weight: 5,
                                    opacity: 0.8,
                                },
                            }).addTo(map);

                            // Tự động zoom bản đồ bao trọn toàn bộ tuyến đường
                            map.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
                        }
                    })
                    .catch((err) => console.error('Lỗi tính đường đi:', err));
            }
        };

        if (window.L) {
            initMap();
        } else {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => initMap();
            document.head.appendChild(script);
        }
    }, [center, stores, selectedStore]);

    return <div ref={mapContainerRef} className="w-full h-full min-h-[500px] rounded-xl z-0" />;
}

declare global {
    interface Window {
        L: any;
    }
}