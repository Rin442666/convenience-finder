'use client';

import { useEffect, useRef } from 'react';
import { Store, UserLocation } from '../types/store';

interface MapViewProps {
  center: UserLocation;
  stores: Store[];
  selectedStore?: Store | null;
  onMapMoveEnd?: (newCenter: UserLocation) => void;
}

// Escape HTML để chống XSS khi tên/địa chỉ cửa hàng chứa ký tự đặc biệt
// (dữ liệu có thể đến từ yêu cầu do người dùng gửi lên).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function MapView({ center, stores, selectedStore, onMapMoveEnd }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  // Ghi nhớ view trước đó để không reset góc nhìn khi chỉ đổi filter.
  const prevCenterRef = useRef<UserLocation | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  // Đánh số request vẽ đường đi để response cũ không ghi đè (race condition).
  const routeRequestIdRef = useRef<number>(0);

  useEffect(() => {
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

        map.on('moveend', () => {
          const mapCenter = map.getCenter();
          if (onMapMoveEnd) {
            onMapMoveEnd({ lat: mapCenter.lat, lng: mapCenter.lng });
          }
        });

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Chỉ reset góc nhìn khi vị trí trung tâm thật sự đổi (GPS mới),
      // không reset khi người dùng chỉ đổi filter/tìm kiếm.
      const centerChanged =
        !prevCenterRef.current ||
        prevCenterRef.current.lat !== center.lat ||
        prevCenterRef.current.lng !== center.lng;
      const selectedId = selectedStore?.id ?? null;
      const selectionChanged = prevSelectedIdRef.current !== selectedId;
      prevCenterRef.current = { lat: center.lat, lng: center.lng };
      prevSelectedIdRef.current = selectedId;

      // Xóa ghim cũ khi re-render
      if (markersGroupRef.current) {
        map.removeLayer(markersGroupRef.current);
      }
      markersGroupRef.current = window.L.layerGroup().addTo(map);

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

      window.L.marker([center.lat, center.lng], { icon: userIcon })
        .addTo(markersGroupRef.current)
        .bindPopup('<b>Vị trí của bạn</b>');

      stores.forEach((store) => {
        if (store.lat && store.lng) {
          window.L.marker([store.lat, store.lng], { icon: storeIcon })
            .addTo(markersGroupRef.current)
            .bindPopup(`
              <div style="font-family: sans-serif;">
                <strong>${escapeHtml(store.name)}</strong><br/>
                <small>${escapeHtml(store.address)}</small>
              </div>
            `);
        }
      });

      // Xóa tuyến đường cũ nếu có
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      const drawRoute = (latLngs: [number, number][], fitBoundsToRoute: boolean) => {
        if (!Array.isArray(latLngs) || latLngs.length < 2 || !mapInstanceRef.current) {
          return;
        }

        const safeLatLngs = latLngs.filter(
          (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
        ) as [number, number][];

        if (safeLatLngs.length < 2) {
          return;
        }

        const leafletLatLngs = safeLatLngs.map(([lat, lng]) => window.L.latLng(lat, lng));

        routeLayerRef.current = window.L.polyline(leafletLatLngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.8,
        }).addTo(map);

        // Chỉ fit bounds khi vừa chọn cửa hàng hoặc vị trí đổi;
        // đổi filter thì giữ nguyên góc nhìn người dùng đang xem.
        if (!fitBoundsToRoute) {
          return;
        }

        try {
          map.fitBounds(window.L.latLngBounds(leafletLatLngs), { padding: [40, 40] });
        } catch (error) {
          console.warn('Không thể fit bounds cho route:', error);
          map.setView(leafletLatLngs[0], 14);
        }
      };

      if (selectedStore && Number.isFinite(selectedStore.lat) && Number.isFinite(selectedStore.lng) && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        const directRoute: [number, number][] = [
          [center.lat, center.lng],
          [selectedStore.lat, selectedStore.lng],
        ];

        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${center.lng},${center.lat};${selectedStore.lng},${selectedStore.lat}?overview=full&geometries=geojson`;
        const routeRequestId = ++routeRequestIdRef.current;
        const shouldFitBounds = selectionChanged || centerChanged;

        fetch(osrmUrl)
          .then((res) => res.json())
          .then((data) => {
            // Bỏ qua response của request cũ (người dùng đã chọn cửa hàng khác).
            if (routeRequestIdRef.current !== routeRequestId) {
              return;
            }
            const coordinates = data?.routes?.[0]?.geometry?.coordinates;

            if (Array.isArray(coordinates) && coordinates.length > 0) {
              const latLngs = coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
              drawRoute(latLngs, shouldFitBounds);
              return;
            }

            drawRoute(directRoute, shouldFitBounds);
          })
          .catch(() => {
            if (routeRequestIdRef.current !== routeRequestId) {
              return;
            }
            drawRoute(directRoute, shouldFitBounds);
          });
      } else if (centerChanged) {
        map.setView([center.lat, center.lng], 14);
      }
    };

    if (window.L) {
      initMap();
      return;
    }

    const existingScript = document.getElementById('leaflet-js');
    if (existingScript) {
      existingScript.addEventListener('load', () => initMap(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, [center, stores, selectedStore]);

  return <div ref={mapContainerRef} className="w-full h-full min-h-[500px] rounded-xl z-0" />;
}

declare global {
  interface Window {
    L: any;
  }
}