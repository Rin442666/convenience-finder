'use client';

import { useEffect, useRef } from 'react';
import { Store, UserLocation } from '../types/store';

interface MapViewProps {
  center: UserLocation;
  stores: Store[];
  selectedStore?: Store | null;
  onMapMoveEnd?: (newCenter: UserLocation) => void;
  pickingEnabled?: boolean;
  onMapClick?: (location: UserLocation) => void;
}

/* Escape HTML để chống XSS khi tên/địa chỉ cửa hàng chứa ký tự đặc biệt
   (dữ liệu có thể đến từ yêu cầu do người dùng gửi lên). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function MapView({ center, stores, selectedStore, onMapMoveEnd, pickingEnabled, onMapClick }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const prevCenterRef = useRef<UserLocation | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  /* Ref cho callback chọn vị trí: bản đồ chỉ tạo 1 lần nên dùng ref để luôn
     gọi callback mới nhất mà không cần khởi tạo lại map. Gán trong effect
     (không gán trực tiếp lúc render) để đúng quy tắc react-hooks/refs. */
  const pickingEnabledRef = useRef(pickingEnabled);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    pickingEnabledRef.current = pickingEnabled;
    onMapClickRef.current = onMapClick;
  });

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
        const map = window.L.map(mapContainerRef.current, { attributionControl: false }).setView([center.lat, center.lng], 14);

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '',
        }).addTo(map);

        map.on('moveend', () => {
          const mapCenter = map.getCenter();
          if (onMapMoveEnd) {
            onMapMoveEnd({ lat: mapCenter.lat, lng: mapCenter.lng });
          }
        });

        map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
          if (pickingEnabledRef.current && onMapClickRef.current) {
            onMapClickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
          }
        });

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      if (mapContainerRef.current) {
        mapContainerRef.current.style.cursor = pickingEnabledRef.current ? 'crosshair' : '';
      }

      const centerChanged =
        !prevCenterRef.current ||
        prevCenterRef.current.lat !== center.lat ||
        prevCenterRef.current.lng !== center.lng;
      const selectedId = selectedStore?.id ?? null;
      const selectionChanged = prevSelectedIdRef.current !== selectedId;
      prevCenterRef.current = { lat: center.lat, lng: center.lng };
      prevSelectedIdRef.current = selectedId;

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
          weight: 4,
          opacity: 0.9,
          dashArray: '10, 8',
        }).addTo(map);

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

      /* Đường nối nét đứt từ vị trí người dùng tới cửa hàng đã chọn —
         minh họa trực quan (độ dài đúng bằng khoảng cách đường chim bay
         hiển thị trên thẻ). Chỉ đường chi tiết để Google Maps lo khi bấm
         nút "Chỉ đường". */
      if (selectedStore && Number.isFinite(selectedStore.lat) && Number.isFinite(selectedStore.lng) && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        drawRoute(
          [
            [center.lat, center.lng],
            [selectedStore.lat, selectedStore.lng],
          ],
          selectionChanged || centerChanged
        );
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