'use client';

import { useEffect, useRef, useState } from 'react';
import { BusStop, ChargingStation, GasStation, Store, UserLocation } from '../types/store';
import { getBikeRoute } from '../lib/osrm';

interface MapViewProps {
  center: UserLocation;
  /* Vị trí thật của người dùng (đã qua GPS). Chỉ vẽ ghim xanh
     "Vị trí của bạn" khi có giá trị này — KHÔNG dùng center để giả
     làm vị trí người dùng. */
  userLocation?: UserLocation | null;
  stores: Store[];
  selectedStore?: Store | null;
  /* Trạm xe buýt gần cửa hàng đang chọn — chỉ truyền vào khi đã chọn
     một cửa hàng, nên marker trạm chỉ hiện lúc đó (tránh rối bản đồ). */
  busStops?: BusStop[];
  /* Trạm sạc xe điện gần cửa hàng đang chọn — lớp marker riêng, tách
     hẳn với lớp trạm bus ở trên. */
  chargingStations?: ChargingStation[];
  /* Cây xăng gần cửa hàng đang chọn — lớp marker riêng nữa, tách hẳn
     với lớp trạm bus và trạm sạc. */
  gasStations?: GasStation[];
  onMapMoveEnd?: (newCenter: UserLocation) => void;
  pickingEnabled?: boolean;
  onMapClick?: (location: UserLocation) => void;
  /* Kiểu marker cửa hàng: 'pin' (ghim), 'dot' (chấm tròn),
     'auto' (zoom out → chấm, zoom in ≥15 → ghim). */
  markerMode?: 'pin' | 'dot' | 'auto';
  /* Callback khi bấm vào 1 điểm cửa hàng trên bản đồ. */
  onStoreSelect?: (store: Store) => void;
  /* Có vẽ tuyến đường (nét đứt + tuyến xe đạp OSRM) từ tâm tới điểm đã
     chọn không. Mặc định true (trang chủ cần); trang chọn vị trí
     (/yeu-cau) tắt đi để bản đồ chỉ còn 1 điểm đánh dấu. */
  showRoute?: boolean;
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

export default function MapView({ center, userLocation, stores, selectedStore, busStops, chargingStations, gasStations, onMapMoveEnd, pickingEnabled, onMapClick, markerMode = 'pin', onStoreSelect, showRoute = true }: MapViewProps) {
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

      /* Ghim xanh "Vị trí của bạn" CHỈ vẽ khi có vị trí GPS thật —
         không bao giờ dùng tâm bản đồ để giả làm vị trí người dùng. */
      if (userLocation) {
        window.L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
          .addTo(markersGroupRef.current)
          .bindPopup('<b>Vị trí của bạn</b>');
      }

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

      /* Marker trạm xe buýt: vòng tròn nhỏ xanh dương có hình xe buýt,
         nhỏ hơn hẳn ghim cửa hàng. Chỉ vẽ khi có busStops (tức đang chọn
         một cửa hàng) — dữ liệu này do trang chủ nạp riêng cho cửa hàng
         đang chọn, không phải một lớp phủ thường trực. */
      if (busStops && busStops.length > 0) {
        const busIcon = window.L.divIcon({
          className: 'bus-stop-icon',
          html: '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#0284c7;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);font-size:12px;line-height:1;">🚌</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11],
        });
        busStops.forEach((stop) => {
          if (!stop.lat || !stop.lng) return;
          const distanceText =
            stop.distanceMeters < 1000
              ? `${Math.round(stop.distanceMeters)} m`
              : `${(stop.distanceMeters / 1000).toFixed(1)} km`;
          const popupHtml = `
              <div style="font-family: sans-serif;">
                <strong>🚌 ${escapeHtml(stop.name)}</strong><br/>
                <small>Cách cửa hàng đang chọn: ${distanceText}${stop.withinRadius ? '' : ' (trạm gần nhất, ngoài 500 m)'}</small>
                ${stop.routes ? `<br/><small>Tuyến: ${escapeHtml(stop.routes)}</small>` : ''}
              </div>
            `;
          window.L.marker([stop.lat, stop.lng], { icon: busIcon })
            .addTo(markersGroupRef.current)
            .bindPopup(popupHtml);
        });
      }

      /* Marker trạm sạc xe điện: lớp riêng tách hẳn với trạm bus —
         vòng tròn nhỏ xanh lá có tia sét. Cũng chỉ vẽ khi đang chọn
         một cửa hàng (dữ liệu do trang chủ nạp cho cửa hàng đó). */
      if (chargingStations && chargingStations.length > 0) {
        const chargingIcon = window.L.divIcon({
          className: 'charging-station-icon',
          html: '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#16a34a;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);font-size:12px;line-height:1;">⚡</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11],
        });
        chargingStations.forEach((station) => {
          if (!station.lat || !station.lng) return;
          const distanceText =
            station.distanceMeters < 1000
              ? `${Math.round(station.distanceMeters)} m`
              : `${(station.distanceMeters / 1000).toFixed(1)} km`;
          const popupHtml = `
              <div style="font-family: sans-serif;">
                <strong>⚡ ${escapeHtml(station.name)}</strong><br/>
                <small>Cách cửa hàng đang chọn: ${distanceText}${station.withinRadius ? '' : ' (trạm gần nhất, ngoài 1 km)'}</small>
                ${station.operator ? `<br/><small>Hãng: ${escapeHtml(station.operator)}</small>` : ''}
              </div>
            `;
          window.L.marker([station.lat, station.lng], { icon: chargingIcon })
            .addTo(markersGroupRef.current)
            .bindPopup(popupHtml);
        });
      }

      /* Marker cây xăng: lớp riêng thứ ba — vòng tròn nhỏ màu cam có
         hình cây xăng. Cũng chỉ vẽ khi đang chọn một cửa hàng. */
      if (gasStations && gasStations.length > 0) {
        const gasIcon = window.L.divIcon({
          className: 'gas-station-icon',
          html: '<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#ea580c;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);font-size:12px;line-height:1;">⛽</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11],
        });
        gasStations.forEach((station) => {
          if (!station.lat || !station.lng) return;
          const distanceText =
            station.distanceMeters < 1000
              ? `${Math.round(station.distanceMeters)} m`
              : `${(station.distanceMeters / 1000).toFixed(1)} km`;
          const popupHtml = `
              <div style="font-family: sans-serif;">
                <strong>⛽ ${escapeHtml(station.name)}</strong><br/>
                <small>Cách cửa hàng đang chọn: ${distanceText}${station.withinRadius ? '' : ' (cây xăng gần nhất, ngoài 1 km)'}</small>
                ${station.operator ? `<br/><small>Hãng: ${escapeHtml(station.operator)}</small>` : ''}
              </div>
            `;
          window.L.marker([station.lat, station.lng], { icon: gasIcon })
            .addTo(markersGroupRef.current)
            .bindPopup(popupHtml);
        });
      }

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
      if (showRoute && selectedStore && Number.isFinite(selectedStore.lat) && Number.isFinite(selectedStore.lng) && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
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
        showRoute &&
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
  }, [center, userLocation, stores, selectedStore, busStops, chargingStations, gasStations, useDots]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px] rounded-xl z-0" />
      {/* Chú thích (legend) cho 3 lớp marker trạm — chỉ hiện khi đang
          chọn một cửa hàng và có ít nhất một lớp đang vẽ marker. */}
      {selectedStore &&
        ((busStops && busStops.length > 0) ||
          (chargingStations && chargingStations.length > 0) ||
          (gasStations && gasStations.length > 0)) && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1100] space-y-1 rounded-xl bg-white/95 px-2.5 py-2 shadow-md ring-1 ring-black/5 dark:bg-gray-900/95">
            {busStops && busStops.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]" style={{ background: '#2563eb' }}>
                  🚌
                </span>
                Trạm xe buýt
              </p>
            )}
            {chargingStations && chargingStations.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]" style={{ background: '#16a34a' }}>
                  ⚡
                </span>
                Trạm sạc xe điện
              </p>
            )}
            {gasStations && gasStations.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]" style={{ background: '#ea580c' }}>
                  ⛽
                </span>
                Cây xăng
              </p>
            )}
          </div>
        )}
    </div>
  );
}

declare global {
  interface Window {
    L: any;
  }
}