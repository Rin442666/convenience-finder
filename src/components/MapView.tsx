'use client';

import { useEffect, useRef } from 'react';
import { Store, UserLocation } from '../types/store';

interface MapViewProps {
  center: UserLocation;
  stores: Store[];
  selectedStore?: Store | null;
  onMapMoveEnd?: (newCenter: UserLocation) => void;
}

export default function MapView({ center, stores, selectedStore, onMapMoveEnd }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);

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
                <strong>${store.name}</strong><br/>
                <small>${store.address}</small>
              </div>
            `);
        }
      });

      // Xóa tuyến đường cũ nếu có
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      // Vẽ tuyến đường mới an toàn bằng L.polyline
      if (selectedStore && selectedStore.lat && selectedStore.lng && center.lat && center.lng) {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${center.lng},${center.lat};${selectedStore.lng},${selectedStore.lat}?overview=full&geometries=geojson`;

        fetch(osrmUrl)
          .then((res) => res.json())
          .then((data) => {
            if (data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates) {
              const coordinates = data.routes[0].geometry.coordinates;

              // Chuyển đổi [lng, lat] -> [lat, lng] cho L.polyline
              const latLngs = coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);

              if (latLngs.length > 0 && mapInstanceRef.current) {
                routeLayerRef.current = window.L.polyline(latLngs, {
                  color: '#2563eb',
                  weight: 5,
                  opacity: 0.8,
                }).addTo(map);

                map.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
              }
            }
          })
          .catch((err) => console.error('Lỗi lấy tuyến đường OSRM:', err));
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