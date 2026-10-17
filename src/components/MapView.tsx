'use client';

import { useEffect, useRef, useState } from 'react';
import { Store, UserLocation } from '../types/store';
import { getBikeRoute } from '../lib/osrm';

interface MapViewProps {
  center: UserLocation;
  stores: Store[];
  selectedStore?: Store | null;
  onMapMoveEnd?: (newCenter: UserLocation) => void;
  pickingEnabled?: boolean;
  onMapClick?: (location: UserLocation) => void;
  /* Kiểu marker cửa hàng: 'pin' (ghim), 'dot' (chấm tròn),
     'auto' (zoom out → chấm, zoom in ≥15 → ghim). */
  markerMode?: 'pin' | 'dot' | 'auto';
  /* Callback khi bấm vào 1 điểm cửa hàng trên bản đồ. */
  onStoreSelect?: (store: Store) => void;
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

export default function MapView({ center, stores, selectedStore, onMapMoveEnd, pickingEnabled, onMapClick, markerMode = 'pin', onStoreSelect }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const bikeRouteLayerRef = useRef<any>(null);
  const bikeRouteGenRef = useRef(0);
  const prevStoresRef = useRef<Store[] | null>(null);
  const markersGroupRef = useRef<any>(null);
  /* Mức zoom hiện tại — chỉ dùng cho markerMode='auto'. */
  const [mapZoom, setMapZoom] = useState(14);
  const useDots = markerMode === 'dot' || (markerMode === 'auto' && mapZoom < 15);
  const prevCenterRef = useRef<UserLocation | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  /* Ref cho callback chọn vị trí: bản đồ chỉ tạo 1 lần nên dùng ref để luôn
     gọi callback mới nhất mà không cần khởi tạo lại map. Gán trong effect
     (không gán trực tiếp lúc render) để đúng quy tắc react-hooks/refs. */
  const pickingEnabledRef = useRef(pickingEnabled);
  const onMapClickRef = useRef(onMapClick);
  const onStoreSelectRef = useRef(onStoreSelect);
  useEffect(() => {
    pickingEnabledRef.current = pickingEnabled;
    onMapClickRef.current = onMapClick;
    onStoreSelectRef.current = onStoreSelect;
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

        map.on('zoomend', () => {
          setMapZoom(map.getZoom());
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
          const popupHtml = `
              <div style="font-family: sans-serif;">
                <strong>${escapeHtml(store.name)}</strong><br/>
                <small>${escapeHtml(store.address)}</small>
              </div>
            `;
          if (useDots) {
            /* Chấm tròn nhẹ, nhanh khi có hàng trăm điểm. */
            const isSelected = selectedStore?.id === store.id;
            window.L.circleMarker([store.lat, store.lng], {
              radius: isSelected ? 8 : 5,
              color: isSelected ? '#1d4ed8' : '#b91c1c',
              weight: 1.5,
              fillColor: isSelected ? '#3b82f6' : '#ef4444',
              fillOpacity: 0.9,
            })
              .addTo(markersGroupRef.current)
              .bindPopup(popupHtml)
              .on('click', () => {
                if (!pickingEnabledRef.current && onStoreSelectRef.current) {
                  onStoreSelectRef.current(store);
                }
              });
          } else {
              window.L.marker([store.lat, store.lng], { icon: storeIcon })
              .addTo(markersGroupRef.current)
              .bindPopup(popupHtml)
              .on('click', () => {
                if (!pickingEnabledRef.current && onStoreSelectRef.current) {
                  onStoreSelectRef.current(store);
                }
              });
          }
        }
      });

      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      /* Tuyến đường xe chỉ hợp lệ trong đúng "phiên chọn" hiện tại:
         chọn cửa hàng mới / đổi vị trí → vẽ lại;
         đổi bộ lọc (stores fetch lại) → xóa hẳn, không vẽ lại. */
      const filtersChanged = prevStoresRef.current !== null && prevStoresRef.current !== stores;
      prevStoresRef.current = stores;

      const bikeContextChanged = selectionChanged || centerChanged || filtersChanged;
      if (bikeContextChanged) {
        bikeRouteGenRef.current += 1;
        if (bikeRouteLayerRef.current) {
          map.removeLayer(bikeRouteLayerRef.current);
          bikeRouteLayerRef.current = null;
        }
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

      /* Đường xe đạp (xấp xỉ cho xe máy) từ vị trí người dùng tới cửa hàng
         đã chọn — nét liền xanh lá, vẽ đè lên trên đường nét đứt.
         Chỉ fetch khi vừa chọn cửa hàng mới hoặc vừa đổi vị trí.
         OSRM lỗi/timeout thì thôi, vẫn giữ đường nét đứt như cũ. */
      const shouldFetchBikeRoute =
        bikeContextChanged &&
        (selectionChanged || centerChanged) &&
        selectedStore != null &&
        Number.isFinite(selectedStore.lat) &&
        Number.isFinite(selectedStore.lng) &&
        Number.isFinite(center.lat) &&
        Number.isFinite(center.lng);

      if (shouldFetchBikeRoute && selectedStore) {
        const myGen = bikeRouteGenRef.current;
        const requestStoreId = selectedStore.id;
        const origin = { lat: center.lat, lng: center.lng };
        const destination = { lat: selectedStore.lat, lng: selectedStore.lng };
        getBikeRoute(origin, destination)
          .then((latLngs) => {
            /* Bỏ qua kết quả cũ: trong lúc chờ OSRM, người dùng đã chọn
               cửa hàng khác / đổi bộ lọc / đổi vị trí. */
            if (myGen !== bikeRouteGenRef.current) return;
            if (!latLngs || !mapInstanceRef.current || !window.L) return;
            if (prevSelectedIdRef.current !== requestStoreId) return;
            if (bikeRouteLayerRef.current) {
              mapInstanceRef.current.removeLayer(bikeRouteLayerRef.current);
            }
            bikeRouteLayerRef.current = window.L.polyline(
              latLngs.map(([lat, lng]) => window.L.latLng(lat, lng)),
              { color: '#16a34a', weight: 5, opacity: 0.9 }
            ).addTo(mapInstanceRef.current);
          })
          .catch(() => {
            /* OSRM lỗi: không vẽ gì thêm, đường nét đứt vẫn còn. */
          });
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
  }, [center, stores, selectedStore, useDots]);

  return <div ref={mapContainerRef} className="w-full h-full min-h-[500px] rounded-xl z-0" />;
}

declare global {
  interface Window {
    L: any;
  }
}