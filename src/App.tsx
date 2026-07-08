/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Compass,
  AlertTriangle,
  Camera,
  Hammer,
  ChevronRight,
  Gauge,
  Layers,
  Database,
  Radio,
  Clock,
  Navigation,
  CheckCircle,
  HelpCircle,
  PlusCircle,
  MapPin,
  RefreshCw,
  Sliders,
  Send,
  Terminal,
  ChevronUp,
  Map as MapIcon,
  Trash2,
  Save
} from 'lucide-react';

import {
  TrafficLevel,
  RoutePoint,
  TrafficSegment,
  TrafficEvent,
  NavState,
  SimulationLog,
  RouteAnalysis
} from './types';

import {
  CHECKPOINTS,
  HIGH_RES_ROUTE,
  TRAFFIC_SEGMENTS,
  INITIAL_EVENTS,
  getDistance,
  getHeading,
  generateSmoothRoute
} from './mockData';

import { PRESET_ROUTES, PresetRoute } from './presetRoutes';

import DriverCockpit from './components/DriverCockpit';
import { supabase } from './utils/supabaseClient';

export default function App() {
  // Route selection and designer states
  const [activeRouteId, setActiveRouteId] = useState<string>('motc_loop');
  const [checkpoints, setCheckpoints] = useState<RoutePoint[]>(PRESET_ROUTES[0].checkpoints);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>(HIGH_RES_ROUTE);
  const [availableRoutes, setAvailableRoutes] = useState<PresetRoute[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('motc_custom_routes_v1');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const customOnly = parsed.filter(p => !PRESET_ROUTES.some(r => r.id === p.id));
            return [...PRESET_ROUTES, ...customOnly];
          }
        } catch (e) {
          console.error('Failed to load custom routes:', e);
        }
      }
    }
    return PRESET_ROUTES;
  });

  // Selected checkpoint index for highlighting or centering
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState<number | null>(null);

  // State for creating a manual checkpoint
  const [newCheckpointStreetName, setNewCheckpointStreetName] = useState<string>('');
  const [newCheckpointSpeedLimit, setNewCheckpointSpeedLimit] = useState<number>(50);
  const [newCheckpointInstruction, setNewCheckpointInstruction] = useState<string>('');
  const [newCheckpointIsElevated, setNewCheckpointIsElevated] = useState<boolean>(false);
  const [newCheckpointLat, setNewCheckpointLat] = useState<string>('');
  const [newCheckpointLng, setNewCheckpointLng] = useState<string>('');

  // Tab state for Route Designer and Map Click Popup
  const [designerTab, setDesignerTab] = useState<'presets' | 'designer'>('presets');
  const [clickPopupTab, setClickPopupTab] = useState<'event' | 'checkpoint'>('event');

  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('zh-TW', { hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);
  const [trafficSegments, setTrafficSegments] = useState<TrafficSegment[]>(TRAFFIC_SEGMENTS);
  const [events, setEvents] = useState<TrafficEvent[]>(INITIAL_EVENTS);
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const [apiTerminalLogs, setApiTerminalLogs] = useState<string[]>([]);
  
  // View mode state: 2D overhead map, 3D tilted HUD map, 1st-person simulated driving cabin view, or route analysis view
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'driver' | 'analysis'>('2d');
  
  // Route Analysis states
  const [routeAnalyses, setRouteAnalyses] = useState<RouteAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  
  // Navigation State
  const [nav, setNav] = useState<NavState>({
    currentPointIndex: 0,
    progressAlongSegment: 0,
    currentSpeed: 0,
    isDriving: false,
    isPaused: false,
    simSpeedMultiplier: 5, // Default is 5x to make the car move nicely
    hudTilt: false, // Start with normal 2D, let users toggle 3D tilt
    isMuted: true, // Start muted to follow browser autoplay policy
    heading: 0,
  });

  // Target coordinates clicked on map for custom event creation
  const [customEventLat, setCustomEventLat] = useState<number | null>(null);
  const [customEventLng, setCustomEventLng] = useState<number | null>(null);
  const [customEventType, setCustomEventType] = useState<'accident' | 'construction' | 'speed_camera'>('accident');
  const [customEventTitle, setCustomEventTitle] = useState<string>('');

  // Proximity details
  const [nearestEvent, setNearestEvent] = useState<{ event: TrafficEvent; distance: number } | null>(null);
  const [lastSpeechTriggeredEventId, setLastSpeechTriggeredEventId] = useState<string>('');
  const [lastSpeechInstructionIndex, setLastSpeechInstructionIndex] = useState<number>(-1);

  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const carMarkerRef = useRef<L.Marker | null>(null);
  const eventMarkersRef = useRef<{ [key: string]: L.Marker }>({});
  const segmentPolylinesRef = useRef<L.Polyline[]>([]);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const checkpointMarkersRef = useRef<L.Marker[]>([]);
  
  // Route Analysis refs
  const analysisPolylineRef = useRef<L.Polyline | null>(null);
  const analysisStartMarkerRef = useRef<L.Marker | null>(null);
  const analysisEndMarkerRef = useRef<L.Marker | null>(null);
  
  // Simulation Loop Ref
  const timerRef = useRef<any>(null);

  // Initialize Speak Function
  const speak = (text: string) => {
    addLog('voice', `🗣️ [語音播報] "${text}"`);
    if (nav.isMuted) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 0.95; // Slightly slower for clear nav sound
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
      }
    }
  };

  // Helper to add logs
  const addLog = (type: 'info' | 'warning' | 'alert' | 'voice', message: string) => {
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    const newLog: SimulationLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  // API Terminal Log Helper
  const addTerminalLog = (endpoint: string, method: string = 'GET') => {
    const timeStr = new Date().toISOString();
    const logMsg = `[${timeStr}] ${method} ${endpoint} - Status: 200 OK (Latency: ${Math.floor(Math.random() * 30) + 10}ms)`;
    setApiTerminalLogs((prev) => [logMsg, ...prev.slice(0, 19)]);
  };

  // Load data from Supabase and listen to real-time events
  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        // 1. Fetch static routes
        const { data: dbRoutes, error: routesError } = await supabase
          .from('static_routes')
          .select('*');
        
        if (dbRoutes && dbRoutes.length > 0 && !routesError) {
          const formattedRoutes = dbRoutes.map(r => ({
            id: r.id || Math.random().toString(),
            name: r.name,
            description: r.description || '',
            checkpoints: r.checkpoints as RoutePoint[]
          }));
          
          setAvailableRoutes(prev => {
            const customOnly = prev.filter(p => !PRESET_ROUTES.some(r => r.id === p.id) && !formattedRoutes.some(r => r.id === p.id));
            return [...formattedRoutes, ...customOnly];
          });
          
          // Set first route checkpoints as active
          setCheckpoints(formattedRoutes[0].checkpoints);
          setRoutePoints(generateSmoothRoute(formattedRoutes[0].checkpoints, 10));
          addLog('info', `📡 已從 Supabase 載入 ${formattedRoutes.length} 條行車路線！`);
        } else {
          addLog('warning', `⚠️ Supabase 中無靜態路線，使用本地 Mock 路線。`);
        }

        // 2. Fetch static segments
        const { data: dbSegments, error: segmentsError } = await supabase
          .from('static_segments')
          .select('*');
        
        if (dbSegments && dbSegments.length > 0 && !segmentsError) {
          const formattedSegments: TrafficSegment[] = dbSegments.map(s => ({
            id: s.id,
            name: s.name,
            coordinates: s.coordinates as [number, number][],
            status: s.status as TrafficLevel,
            speedLimit: s.speed_limit,
            averageSpeed: s.average_speed
          }));
          setTrafficSegments(formattedSegments);
          addLog('info', `📡 已從 Supabase 載入 ${formattedSegments.length} 個路段流量狀態！`);
        }

        // 3. Fetch static landmarks & dynamic alerts
        const { data: dbLandmarks, error: landmarksError } = await supabase
          .from('static_landmarks')
          .select('*');
        
        const { data: dbAlerts, error: alertsError } = await supabase
          .from('dynamic_alerts')
          .select('*')
          .eq('is_active', true);
        
        let loadedEvents: TrafficEvent[] = [];
        
        if (dbLandmarks && !landmarksError) {
          loadedEvents = loadedEvents.concat(dbLandmarks.map(l => ({
            id: l.id,
            type: l.type as any,
            title: l.title,
            description: l.description || '',
            lat: l.latitude,
            lng: l.longitude,
            roadName: l.road_name || '',
            severity: 'low',
            createdAt: l.created_at
          })));
        }
        
        if (dbAlerts && !alertsError) {
          loadedEvents = loadedEvents.concat(dbAlerts.map(a => ({
            id: a.id,
            type: a.type as any,
            title: a.title,
            description: a.description || '',
            lat: a.latitude,
            lng: a.longitude,
            roadName: a.road_name || '',
            severity: a.severity as any,
            createdAt: new Date(a.created_at).toLocaleTimeString('zh-TW', { hour12: false })
          })));
        }
        
        if (loadedEvents.length > 0) {
          setEvents(loadedEvents);
          addLog('info', `📡 已從 Supabase 載入 ${loadedEvents.length} 個路況事件與測速點！`);
        }

        // 4. Fetch route analyses
        const { data: dbAnalyses, error: analysesError } = await supabase
          .from('route_analyses')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (dbAnalyses && !analysesError) {
          const formattedAnalyses = dbAnalyses.map(a => ({
            id: a.id,
            name: a.name,
            start_name: a.start_name,
            end_name: a.end_name,
            mode: a.mode,
            coordinates: a.coordinates,
            distance_meters: a.distance_meters,
            duration_seconds: a.duration_seconds,
            created_at: a.created_at
          }));
          setRouteAnalyses(formattedAnalyses);
          addLog('info', `📡 已從 Supabase 載入 ${formattedAnalyses.length} 條跨路網 analysis 線路！`);
        }
      } catch (err) {
        console.error('Supabase initial fetch error:', err);
        addLog('warning', `⚠️ 無法從 Supabase 讀取資料，系統回退至本地離線模擬模式。`);
      }
    };

    fetchStaticData();

    // 4. Supabase Realtime Channels
    const alertsChannel = supabase
      .channel('realtime_alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dynamic_alerts' },
        (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const eventType = payload.eventType;

          if (eventType === 'INSERT') {
            if (newRecord.is_active) {
              const newEvt: TrafficEvent = {
                id: newRecord.id,
                type: newRecord.type,
                title: newRecord.title,
                description: newRecord.description || '',
                lat: newRecord.latitude,
                lng: newRecord.longitude,
                roadName: newRecord.road_name || '',
                severity: newRecord.severity,
                createdAt: new Date(newRecord.created_at).toLocaleTimeString('zh-TW', { hour12: false })
              };
              setEvents(prev => {
                if (prev.some(e => e.id === newEvt.id)) return prev;
                return [newEvt, ...prev];
              });
              addLog('alert', `📡 [實時路況] 新增事件：${newEvt.roadName} 發生「${newEvt.title}」！`);
            }
          } else if (eventType === 'UPDATE') {
            if (!newRecord.is_active) {
              setEvents(prev => prev.filter(e => e.id !== newRecord.id));
              addLog('info', `📡 [實時路況] 排除事件：${newRecord.title} 已排除解除。`);
            } else {
              const updatedEvt: TrafficEvent = {
                id: newRecord.id,
                type: newRecord.type,
                title: newRecord.title,
                description: newRecord.description || '',
                lat: newRecord.latitude,
                lng: newRecord.longitude,
                roadName: newRecord.road_name || '',
                severity: newRecord.severity,
                createdAt: new Date(newRecord.created_at).toLocaleTimeString('zh-TW', { hour12: false })
              };
              setEvents(prev => prev.map(e => e.id === updatedEvt.id ? updatedEvt : e));
              addLog('info', `📡 [實時路況] 更新事件：${newRecord.title} 詳情已修改。`);
            }
          } else if (eventType === 'DELETE') {
            const deleteId = oldRecord ? oldRecord.id : null;
            if (deleteId) {
              setEvents(prev => prev.filter(e => e.id !== deleteId));
              addLog('info', `📡 [實時路況] 移除事件：ID ${deleteId} 已自資料庫刪除。`);
            }
          }
        }
      )
      .subscribe();

    const segmentsChannel = supabase
      .channel('realtime_segments')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'static_segments' },
        (payload) => {
          const updated = payload.new as any;
          setTrafficSegments(prev => prev.map(s => {
            if (s.id === updated.id) {
              addLog('info', `📡 [路段更新] ${updated.name} 車流變化：限速 ${updated.speed_limit}km/h，平均車速 ${updated.average_speed}km/h (${updated.status})`);
              return {
                ...s,
                status: updated.status as TrafficLevel,
                speedLimit: updated.speed_limit,
                averageSpeed: updated.average_speed
              };
            }
            return s;
          }));
        }
      )
      .subscribe();

    const analysesChannel = supabase
      .channel('realtime_analyses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_analyses' },
        (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const eventType = payload.eventType;

          if (eventType === 'INSERT') {
            const newAnalysis = {
              id: newRecord.id,
              name: newRecord.name,
              start_name: newRecord.start_name,
              end_name: newRecord.end_name,
              mode: newRecord.mode,
              coordinates: newRecord.coordinates,
              distance_meters: newRecord.distance_meters,
              duration_seconds: newRecord.duration_seconds,
              created_at: newRecord.created_at
            };
            setRouteAnalyses(prev => {
              if (prev.some(a => a.id === newAnalysis.id)) return prev;
              return [newAnalysis, ...prev];
            });
            addLog('info', `📡 [路網分析] 接收到全新規劃路徑：${newAnalysis.name}！`);
          } else if (eventType === 'DELETE') {
            const deleteId = oldRecord ? oldRecord.id : null;
            if (deleteId) {
              setRouteAnalyses(prev => prev.filter(a => a.id !== deleteId));
              addLog('info', `📡 [路網分析] 刪除規劃路徑 ID: ${deleteId}`);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(segmentsChannel);
      supabase.removeChannel(analysesChannel);
    };
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center map around MOTC building Taipei
    const initialCenter: [number, number] = [25.0395, 121.5280];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark-themed tiles to make traffic colors & HUD look extremely gorgeous and high-tech
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Log map setup
    addLog('info', '🗺️ 數位地圖系統初始化成功：載入 Leaflet & OpenStreetMap 向量網格');
    addTerminalLog('/api/v2/map/tiles');

    // Add map click handler for spawning custom events
    map.on('click', (e: L.LeafletMouseEvent) => {
      setCustomEventLat(e.latlng.lat);
      setCustomEventLng(e.latlng.lng);
      // Pre-fill some default title
      setCustomEventTitle('自訂交通事件');
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync / Draw Route Path
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old route polyline if any
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
    }

    // Draw high resolution driving route (dotted semi-transparent path)
    const latlngs = routePoints.map(p => L.latLng(p.lat, p.lng));
    const polyline = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.4,
      dashArray: '8, 8'
    }).addTo(map);

    routePolylineRef.current = polyline;

    // Set map bounds to fit the route on first load
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

  }, [routePoints]);

  // Sync / Draw Route Checkpoints Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous checkpoint markers
    checkpointMarkersRef.current.forEach(m => m.remove());
    checkpointMarkersRef.current = [];

    // Draw active checkpoints
    const newMarkers = checkpoints.map((cp, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === checkpoints.length - 1;
      
      let badgeColor = 'bg-blue-600 border-blue-400';
      let textChar = (idx + 1).toString();
      
      if (isStart) {
        badgeColor = 'bg-emerald-600 border-emerald-400';
        textChar = 'S';
      } else if (isEnd) {
        badgeColor = 'bg-purple-600 border-purple-400';
        textChar = 'E';
      }

      const htmlContent = `
        <div class="relative flex items-center justify-center w-6 h-6 rounded-full ${badgeColor} border-2 text-white font-bold text-[10px] font-mono shadow-md hover:scale-115 transition-all cursor-pointer">
          ${textChar}
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-checkpoint-icon',
        html: htmlContent,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([cp.lat, cp.lng], { icon: markerIcon }).addTo(map);

      marker.bindPopup(`
        <div class="p-2 font-sans text-xs bg-gray-950 text-slate-100 rounded border border-slate-800">
          <p class="font-bold text-white border-b border-slate-800 pb-1 mb-1">📍 節點 ${idx + 1}：${cp.streetName}</p>
          <p class="text-slate-400 mb-0.5">速限: <span class="font-mono text-sky-400 font-bold">${cp.speedLimit} km/h</span></p>
          <p class="text-slate-300 leading-normal">${cp.instruction}</p>
        </div>
      `, { closeButton: false });

      return marker;
    });

    checkpointMarkersRef.current = newMarkers;

  }, [checkpoints]);

  // Sync / Draw Traffic Congestion Segments
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous polylines
    segmentPolylinesRef.current.forEach(p => p.remove());
    segmentPolylinesRef.current = [];

    // Draw each segment with speed colors
    const newPolylines = trafficSegments.map(seg => {
      let color = '#22c55e'; // smooth green
      let weight = 5;
      let opacity = 0.75;

      if (seg.status === 'heavy') {
        color = '#eab308'; // heavy yellow
        weight = 7;
      } else if (seg.status === 'jammed') {
        color = '#ef4444'; // jammed red
        weight = 8;
        opacity = 0.9;
      }

      const poly = L.polyline(seg.coordinates, {
        color,
        weight,
        opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // Create a nice popup with road details
      poly.bindPopup(`
        <div class="p-1 font-sans text-xs bg-gray-900 text-white rounded">
          <p class="font-bold border-b border-gray-700 pb-1 mb-1">${seg.name}</p>
          <p>道路速限: <span class="font-mono text-emerald-400 font-bold">${seg.speedLimit} km/h</span></p>
          <p>當前均速: <span class="font-mono text-yellow-400 font-bold">${seg.averageSpeed} km/h</span></p>
          <p>路況狀態: <span class="font-bold" style="color: ${color}">${seg.status === 'smooth' ? '暢通' : seg.status === 'heavy' ? '車多擁擠' : '極度塞車'}</span></p>
        </div>
      `, { closeButton: false });

      return poly;
    });

    segmentPolylinesRef.current = newPolylines;
    addTerminalLog('/api/v2/traffic/segments');

  }, [trafficSegments]);

  // Sync / Draw Event Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear removed markers
    Object.keys(eventMarkersRef.current).forEach(id => {
      if (!events.find(e => e.id === id)) {
        eventMarkersRef.current[id].remove();
        delete eventMarkersRef.current[id];
      }
    });

    // Draw active events
    events.forEach(evt => {
      const existingMarker = eventMarkersRef.current[evt.id];

      // Define visual icons using Tailwind CSS with beautiful micro-animations
      let bgClass = 'bg-red-500';
      let iconChar = '⚠️';
      let pingClass = 'bg-red-400';

      if (evt.type === 'construction') {
        bgClass = 'bg-amber-500';
        iconChar = '🚧';
        pingClass = 'bg-amber-400';
      } else if (evt.type === 'speed_camera') {
        bgClass = 'bg-blue-600';
        iconChar = '📸';
        pingClass = 'bg-blue-400';
      } else if (evt.type === 'flooding') {
        bgClass = 'bg-cyan-600';
        iconChar = '🌧️';
        pingClass = 'bg-cyan-400';
      } else if (evt.type === 'road_closure') {
        bgClass = 'bg-red-700';
        iconChar = '🚫';
        pingClass = 'bg-red-500';
      } else if (evt.type === 'landmark') {
        bgClass = 'bg-indigo-600';
        iconChar = '🏛️';
        pingClass = 'bg-indigo-400';
      } else if (evt.type === 'poi') {
        bgClass = 'bg-emerald-600';
        if (evt.title.includes('星巴克') || evt.title.toLowerCase().includes('starbucks')) {
          iconChar = '☕';
        } else if (evt.title.includes('7-Eleven') || evt.title.includes('全家')) {
          iconChar = '🏪';
        } else {
          iconChar = '🏬';
        }
        pingClass = 'bg-emerald-400';
      } else if (evt.type === 'parking') {
        bgClass = 'bg-blue-700';
        iconChar = '🅿️';
        pingClass = 'bg-blue-500';
      }

      const pulsePing = evt.severity === 'high' ? 
        `<div class="absolute inset-0 rounded-full ${pingClass} opacity-40 animate-ping"></div>` : '';

      const htmlContent = `
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${bgClass} border-2 border-white text-white shadow-xl">
          ${pulsePing}
          <span class="text-sm font-mono flex items-center justify-center">${iconChar}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-traffic-icon',
        html: htmlContent,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (existingMarker) {
        existingMarker.setLatLng([evt.lat, evt.lng]);
        existingMarker.setIcon(customIcon);
      } else {
        const marker = L.marker([evt.lat, evt.lng], { icon: customIcon }).addTo(map);
        
        marker.bindPopup(`
          <div class="p-2 font-sans text-xs bg-gray-900 text-slate-100 rounded max-w-xs">
            <div class="flex items-center gap-1 border-b border-gray-700 pb-1 mb-1">
              <span class="text-base">${iconChar}</span>
              <p class="font-bold text-white text-sm">${evt.title}</p>
            </div>
            <p class="text-slate-300 font-medium mb-1">${evt.roadName}</p>
            <p class="text-slate-400 leading-relaxed">${evt.description}</p>
            <div class="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>威脅等級: <strong class="${evt.severity === 'high' ? 'text-red-400' : 'text-amber-400'}">${evt.severity.toUpperCase()}</strong></span>
              <span>${evt.createdAt}</span>
            </div>
          </div>
        `, { closeButton: false });

        eventMarkersRef.current[evt.id] = marker;
      }
    });

    addTerminalLog('/api/v2/traffic/events');

  }, [events]);

  // Main Vehicle Position Sync Loop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPoint = routePoints[nav.currentPointIndex];
    if (!currentPoint) return;

    // Dynamic Heading calculations
    let heading = nav.heading;
    if (nav.currentPointIndex < routePoints.length - 1) {
      const nextPoint = routePoints[nav.currentPointIndex + 1];
      heading = getHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);
    }

    // Vehicle Marker Icon: Elegant directional blue arrows with radar sonar ring
    const carIconHtml = `
      <div class="relative flex items-center justify-center w-12 h-12">
        <div class="absolute inset-0 bg-sky-500 rounded-full opacity-30 animate-ping"></div>
        <div class="relative bg-sky-600 text-white rounded-full p-2 border-2 border-white shadow-2xl flex items-center justify-center transition-transform duration-300" 
             style="transform: rotate(${heading}deg);">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `;

    const carIcon = L.divIcon({
      className: 'car-vehicle-marker',
      html: carIconHtml,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (carMarkerRef.current) {
      carMarkerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      carMarkerRef.current.setIcon(carIcon);
    } else {
      carMarkerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon: carIcon, zIndexOffset: 1000 }).addTo(map);
    }

    // Centering behaviors
    // In driving mode, we center map around the car.
    // If Tilt / Heading mode is on, we tilt map pane.
    if (nav.isDriving && !nav.isPaused) {
      map.panTo([currentPoint.lat, currentPoint.lng], { animate: true, duration: 0.1 });
    }

    // Compute Nearest Event and trigger alerts
    let minDistance = Infinity;
    let closest: TrafficEvent | null = null;

    events.forEach(evt => {
      const dist = getDistance(currentPoint.lat, currentPoint.lng, evt.lat, evt.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closest = evt;
      }
    });

    if (closest && minDistance < 400) {
      setNearestEvent({ event: closest, distance: Math.round(minDistance) });
      
      // Proximity Trigger for voice alert and flashing warning (within 250 meters)
      const closestEvent = closest as TrafficEvent;
      if (minDistance < 250 && lastSpeechTriggeredEventId !== closestEvent.id) {
        setLastSpeechTriggeredEventId(closestEvent.id);
        
        let speechText = '';
        if (closestEvent.type === 'accident') {
          speechText = `前方 200 公尺處有${closestEvent.title}，已佔用內側車道，請減速慢行。`;
          addLog('alert', `⚠️ [車禍預警] 距離車禍僅 ${Math.round(minDistance)} 公尺，系統建議時速降至 15 km/h！`);
        } else if (closestEvent.type === 'construction') {
          speechText = `注意，前方 200 公尺處有${closestEvent.title}，請往左靠邊。`;
          addLog('warning', `🚧 [施工預警] 距離施工區 ${Math.round(minDistance)} 公尺，請注意路肩收縮。`);
        } else if (closestEvent.type === 'speed_camera') {
          const limit = currentPoint.speedLimit;
          speechText = `前方 200 公尺有${closestEvent.title}，速限 ${limit} 公里。`;
          addLog('info', `📸 [測速預警] 前方測速照相，速限 ${limit} km/h`);
        } else if (closestEvent.type === 'flooding') {
          speechText = `注意，前方 200 公尺處有${closestEvent.title}，路段已淹水積水，請減速慢行或改道。`;
          addLog('alert', `🌧️ [淹水警報] 距離積水區僅 ${Math.round(minDistance)} 公尺，請注意行車安全。`);
        } else if (closestEvent.type === 'road_closure') {
          speechText = `危險，前方 200 公尺處有${closestEvent.title}，路段已封閉，請立即改道。`;
          addLog('alert', `🚫 [封路警報] 距離封路區僅 ${Math.round(minDistance)} 公尺，請立即改道！`);
        } else if (closestEvent.type === 'landmark') {
          speechText = `您即將行經地標：${closestEvent.title}。`;
          addLog('info', `🏛️ [地標提示] 距離地標「${closestEvent.title}」約 ${Math.round(minDistance)} 公尺。`);
        } else if (closestEvent.type === 'poi') {
          speechText = `前方有 ${closestEvent.title}。`;
          addLog('info', `🏪 [店家提示] 鄰近「${closestEvent.title}」約 ${Math.round(minDistance)} 公尺。`);
        } else if (closestEvent.type === 'parking') {
          speechText = `前方有 ${closestEvent.title}，${closestEvent.description}`;
          addLog('info', `🅿️ [停車提示] 鄰近「${closestEvent.title}」約 ${Math.round(minDistance)} 公尺。`);
        }

        speak(speechText);
      }
    } else {
      setNearestEvent(null);
    }

    // Trigger turn instructions speech
    if (lastSpeechInstructionIndex !== nav.currentPointIndex) {
      // Find a natural turn check: when instruction updates
      const hasMajorInstruction = currentPoint.instruction && 
                                  !currentPoint.instruction.includes('繼續直行') &&
                                  !currentPoint.instruction.includes('直行通過') &&
                                  (nav.currentPointIndex === 0 || routePoints[nav.currentPointIndex - 1].instruction !== currentPoint.instruction);
      
      if (hasMajorInstruction) {
        setLastSpeechInstructionIndex(nav.currentPointIndex);
        speak(currentPoint.instruction);
      }
    }

  }, [nav.currentPointIndex, events]);

  // Simulation Ticker
  useEffect(() => {
    if (!nav.isDriving || nav.isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Frame rates & smooth driving transition
    // A point represents 10 meters. If speed is v km/h, distance covered per second is v / 3.6 meters.
    // Ticking every 200ms.
    const tickIntervalMs = 200;
    
    timerRef.current = setInterval(() => {
      setNav(prev => {
        if (!prev.isDriving || prev.isPaused) return prev;

        const nextIndex = prev.currentPointIndex + 1;
        if (nextIndex >= routePoints.length) {
          // Loop or stop
          clearInterval(timerRef.current);
          speak("您已抵達目的地交通部，本輪模擬導航圓滿結束。");
          return {
            ...prev,
            isDriving: false,
            currentPointIndex: 0,
            currentSpeed: 0,
          };
        }

        const currentPoint = routePoints[prev.currentPointIndex];
        const nextPoint = routePoints[nextIndex];

        // DYNAMIC VEHICLE SPEED CALCULATOR (Super realistic!)
        let targetSpeed = currentPoint.speedLimit;

        // 1. Check traffic segments congestion at current point
        const activeSegment = trafficSegments.find(seg => {
          // Check if coordinate is near currentPoint
          const dist = getDistance(currentPoint.lat, currentPoint.lng, seg.coordinates[0][0], seg.coordinates[0][1]);
          return dist < 200; // rough proximity
        });

        if (activeSegment) {
          if (activeSegment.status === 'heavy') {
            targetSpeed = Math.round(targetSpeed * 0.55); // slow down to 55%
          } else if (activeSegment.status === 'jammed') {
            targetSpeed = Math.round(targetSpeed * 0.25); // slow down to 25% (traffic jam)
          }
        }

        // 2. Slow down near active accident/construction (within 150m)
        events.forEach(evt => {
          const dist = getDistance(currentPoint.lat, currentPoint.lng, evt.lat, evt.lng);
          if (dist < 150) {
            if (evt.type === 'accident') {
              targetSpeed = Math.min(targetSpeed, 15); // crawls past crash
            } else if (evt.type === 'construction') {
              targetSpeed = Math.min(targetSpeed, 25);
            }
          }
        });

        // 3. Speed transition physics (accelerate/decelerate gradually toward target)
        const speedDelta = targetSpeed - prev.currentSpeed;
        const accelerationRate = 6; // max km/h change per tick
        let newSpeed = prev.currentSpeed + Math.sign(speedDelta) * Math.min(Math.abs(speedDelta), accelerationRate);
        newSpeed = Math.max(0, newSpeed); // cannot be negative

        // Calculate heading
        const heading = getHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);

        // Advance indices based on speed and multiplier
        // Distance per tick in real life: (newSpeed / 3.6) * (tickIntervalMs / 1000)
        // With speed multiplier, we advance multiple points in our high-res 10-meter spacing path
        const distanceCoveredMeters = (newSpeed / 3.6) * (tickIntervalMs / 1000) * prev.simSpeedMultiplier;
        
        // 10 meters per point spacing
        const pointsToAdvance = Math.max(1, Math.round(distanceCoveredMeters / 10));
        const finalNextIndex = Math.min(routePoints.length - 1, prev.currentPointIndex + pointsToAdvance);

        // Push polling API logs intermittently in simulation
        if (finalNextIndex % 15 === 0) {
          addTerminalLog('/api/v2/vehicle/telemetry', 'PUT');
          addTerminalLog('/api/v2/traffic/segments', 'GET');
        }

        return {
          ...prev,
          currentPointIndex: finalNextIndex,
          currentSpeed: Math.round(newSpeed),
          heading,
        };
      });
    }, tickIntervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [nav.isDriving, nav.isPaused, nav.simSpeedMultiplier, trafficSegments, events]);

  // Apply tilt rotation styling on Leaflet Map Element directly
  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return;

    if (viewMode === '3d') {
      // Create a gorgeous tilted 3D HUD visual view with css transforms
      mapContainer.style.transform = 'perspective(900px) rotateX(50deg) translateY(-20px)';
      mapContainer.style.transformOrigin = 'center bottom';
      mapContainer.style.borderRadius = '1rem';
      mapContainer.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.7)';
    } else if (viewMode === 'driver') {
      // Small PIP map inside the cockpit, no 3D distortion
      mapContainer.style.transform = 'none';
      mapContainer.style.borderRadius = '0.75rem';
      mapContainer.style.boxShadow = 'none';
    } else {
      mapContainer.style.transform = 'none';
      mapContainer.style.borderRadius = '0';
      mapContainer.style.boxShadow = 'none';
    }
    mapContainer.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

    // Refresh map viewport because dimensions changed visual boundaries
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        const currentPoint = routePoints[nav.currentPointIndex];
        if (currentPoint) {
          mapRef.current.panTo([currentPoint.lat, currentPoint.lng], { animate: true });
          if (viewMode === 'driver') {
            mapRef.current.setZoom(16, { animate: true });
          } else {
            mapRef.current.setZoom(15, { animate: true });
          }
        }
      }
    }, 600);

  }, [viewMode, nav.currentPointIndex]);

  // Sync / Draw Selected Route Analysis on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Clear previous layers
    if (analysisPolylineRef.current) {
      analysisPolylineRef.current.remove();
      analysisPolylineRef.current = null;
    }
    if (analysisStartMarkerRef.current) {
      analysisStartMarkerRef.current.remove();
      analysisStartMarkerRef.current = null;
    }
    if (analysisEndMarkerRef.current) {
      analysisEndMarkerRef.current.remove();
      analysisEndMarkerRef.current = null;
    }

    if (viewMode !== 'analysis' || !selectedAnalysisId) return;

    const activeAnalysis = routeAnalyses.find(r => r.id === selectedAnalysisId);
    if (!activeAnalysis || !activeAnalysis.coordinates || activeAnalysis.coordinates.length === 0) return;

    const latlngs = activeAnalysis.coordinates.map(c => L.latLng(c[0], c[1]));

    // Determine color based on mode
    let color = '#a78bfa'; // purple default
    let dashArray = undefined;
    if (activeAnalysis.mode === 'walk') {
      color = '#f97316'; // orange-red
      dashArray = '5, 8';
    } else if (activeAnalysis.mode === 'bike') {
      color = '#10b981'; // emerald
      dashArray = '8, 8';
    } else if (activeAnalysis.mode === 'drive') {
      color = '#8b5cf6'; // violet/purple
    }

    // Draw path
    const polyline = L.polyline(latlngs, {
      color,
      weight: 6,
      opacity: 0.85,
      dashArray,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    analysisPolylineRef.current = polyline;

    // Draw Start Marker
    const startHtml = `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border-2 border-emerald-500 text-emerald-400 font-bold shadow-xl animate-pulse flex items-center justify-center">
        <span class="text-xs select-none">🟢</span>
      </div>
    `;
    const startIcon = L.divIcon({
      className: 'analysis-start-icon',
      html: startHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const startMarker = L.marker(latlngs[0], { icon: startIcon }).addTo(map);
    startMarker.bindPopup(`
      <div class="p-1 font-sans text-xs bg-slate-950 text-white rounded">
        <p class="font-bold text-emerald-400 border-b border-slate-800 pb-0.5 mb-1">🟢 起點 (Departure)</p>
        <p class="text-slate-300 font-medium">${activeAnalysis.start_name}</p>
      </div>
    `, { closeButton: false });
    analysisStartMarkerRef.current = startMarker;

    // Draw End Marker
    const endHtml = `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border-2 border-red-500 text-red-400 font-bold shadow-xl flex items-center justify-center">
        <span class="text-xs select-none">🏁</span>
      </div>
    `;
    const endIcon = L.divIcon({
      className: 'analysis-end-icon',
      html: endHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const endMarker = L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(map);
    endMarker.bindPopup(`
      <div class="p-1 font-sans text-xs bg-slate-950 text-white rounded">
        <p class="font-bold text-red-400 border-b border-slate-800 pb-0.5 mb-1">🏁 終點 (Destination)</p>
        <p class="text-slate-300 font-medium">${activeAnalysis.end_name}</p>
      </div>
    `, { closeButton: false });
    analysisEndMarkerRef.current = endMarker;

    // Fit map bounds
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

  }, [viewMode, selectedAnalysisId, routeAnalyses]);

  // Import Analysis Route to Simulation checkpoints
  const handleImportRouteForSimulation = () => {
    if (!selectedAnalysisId) return;
    const activeAnalysis = routeAnalyses.find(r => r.id === selectedAnalysisId);
    if (!activeAnalysis || !activeAnalysis.coordinates || activeAnalysis.coordinates.length === 0) return;

    // Convert OSMnx coordinate path (which is already high resolution) to RoutePoint[]
    const mappedRoutePoints = activeAnalysis.coordinates.map((c, idx) => ({
      lat: c[0],
      lng: c[1],
      streetName: idx === 0 
        ? `${activeAnalysis.start_name} (起點)` 
        : idx === activeAnalysis.coordinates.length - 1 
          ? `${activeAnalysis.end_name} (終點)` 
          : `${activeAnalysis.name} 路段`,
      speedLimit: activeAnalysis.mode === 'walk' ? 10 : activeAnalysis.mode === 'bike' ? 20 : 50,
      instruction: idx === 0 
        ? `出發：從 ${activeAnalysis.start_name} 開始模擬移動` 
        : idx === activeAnalysis.coordinates.length - 1 
          ? `抵達：已安全抵達 ${activeAnalysis.end_name}` 
          : `行經 ${activeAnalysis.name} 路段`,
    }));

    // Update simulation routes state
    setRoutePoints(mappedRoutePoints);
    // Create minimal checkpoints for simulation HUD
    setCheckpoints([
      mappedRoutePoints[0],
      mappedRoutePoints[Math.floor(mappedRoutePoints.length / 2)],
      mappedRoutePoints[mappedRoutePoints.length - 1]
    ]);

    // Update navigation states
    setNav(prev => ({
      ...prev,
      currentPointIndex: 0,
      currentSpeed: 0,
      isDriving: true,
      isPaused: false
    }));

    // Re-center map to the first point
    const map = mapRef.current;
    if (map) {
      map.setView([mappedRoutePoints[0].lat, mappedRoutePoints[0].lng], 16);
    }

    // Switch view mode to driver cockpit
    setViewMode('driver');
    addLog('info', `🚗 成功將路網分析「${activeAnalysis.name}」匯入模擬器！開始行車模擬。`);
    speak(`導航已匯入：從 ${activeAnalysis.start_name} 至 ${activeAnalysis.end_name}。即將開始行駛模擬。`);
  };

  // Trigger simulated voice play
  const playManualVoiceHelp = () => {
    const currentPoint = routePoints[nav.currentPointIndex];
    if (currentPoint) {
      speak(currentPoint.instruction);
    }
  };

  // Toggle Driving
  const handleStartDriving = () => {
    if (!nav.isDriving) {
      setNav(prev => ({
        ...prev,
        isDriving: true,
        isPaused: false,
        currentPointIndex: 0,
      }));
      addLog('info', '🟢 啟動自動駕駛模擬：規劃從「交通部」出發之都會環狀路網');
      addTerminalLog('/api/v2/navigation/start', 'POST');
    } else {
      setNav(prev => ({ ...prev, isPaused: !prev.isPaused }));
      addLog('info', nav.isPaused ? '▶️ 恢復路段導航駕駛模擬' : '⏸️ 暫停路面模擬行駛');
    }
  };

  const handleResetDriving = () => {
    setNav(prev => ({
      ...prev,
      isDriving: false,
      isPaused: false,
      currentPointIndex: 0,
      currentSpeed: 0,
    }));
    addLog('info', '🔄 導航模擬重設：重置車輛位置至交通部起點');
    addTerminalLog('/api/v2/navigation/reset', 'POST');
  };

  // Add a brand-new Traffic Event
  const handleCreateCustomEvent = () => {
    if (customEventLat === null || customEventLng === null) return;
    
    const newEvent: TrafficEvent = {
      id: `evt_${Date.now()}`,
      type: customEventType,
      title: customEventTitle || (customEventType === 'accident' ? '即時通報車禍' : customEventType === 'construction' ? '緊急搶修工程' : '測速照相點'),
      description: customEventType === 'accident' ? 
        '民意代表與用路人透過 Waze 回報：路段車流回堵，目前正由交警前往處理中。' : 
        customEventType === 'construction' ? 
        '營建署緊急路面孔蓋調校與防滑係數重測，請注意變換車道。' : 
        'TDX 資料庫更新：新增常態性移動式測速照相攔檢點。',
      lat: customEventLat,
      lng: customEventLng,
      roadName: '地圖標記路段 (經緯度偵測點)',
      severity: customEventType === 'accident' ? 'high' : customEventType === 'construction' ? 'medium' : 'low',
      createdAt: new Date().toLocaleTimeString('zh-TW', { hour12: false }) + ' (即時通報)',
    };

    setEvents(prev => [newEvent, ...prev]);
    
    // Find nearest route segment and turn it RED or YELLOW dynamically
    // This replicates real-time traffic dynamic pricing/routing updates!
    setTrafficSegments(prev => {
      return prev.map(seg => {
        // Find if event is very close to any segment coordinate
        const isNearSegment = seg.coordinates.some(coord => {
          return getDistance(newEvent.lat, newEvent.lng, coord[0], coord[1]) < 300;
        });

        if (isNearSegment) {
          addLog('warning', `⚡ [動態路況更新] 偵測到事件鄰近「${seg.name}」，該路網線段即時路況調升為【${newEvent.type === 'accident' ? '紅色壅塞' : '黃色車多'}】`);
          return {
            ...seg,
            status: newEvent.type === 'accident' ? 'jammed' : 'heavy',
            averageSpeed: newEvent.type === 'accident' ? 10 : 25,
          };
        }
        return seg;
      });
    });

    addLog('alert', `📢 [派遣中心] 新增 ${newEvent.title} 至地圖座標 (${newEvent.lat.toFixed(5)}, ${newEvent.lng.toFixed(5)})`);
    addTerminalLog('/api/v2/traffic/dispatch', 'POST');

    // Clean custom event trigger
    setCustomEventLat(null);
    setCustomEventLng(null);
    setCustomEventTitle('');
  };

  // Clear Events
  const handleClearEvents = () => {
    setEvents([]);
    // Restore traffic segments speed limits
    setTrafficSegments(TRAFFIC_SEGMENTS.map(s => ({ ...s, status: s.id === 'seg_3' ? 'jammed' : s.id === 'seg_2' ? 'heavy' : 'smooth' })));
    addLog('info', '🧹 已清除地圖所有路況事件，路網恢復預設運作狀態');
    addTerminalLog('/api/v2/traffic/events/clear', 'DELETE');
  };

  // Route Designer Handlers
  const handleApplyRoute = (newCheckpoints: RoutePoint[], routeId: string) => {
    // Stop active simulation first to avoid index-out-of-bounds errors
    setNav(prev => ({
      ...prev,
      isDriving: false,
      currentPointIndex: 0,
      currentSpeed: 0,
    }));
    if (timerRef.current) clearInterval(timerRef.current);

    // Generate smooth route points
    const smoothPoints = generateSmoothRoute(newCheckpoints, 10);
    setCheckpoints(newCheckpoints);
    setRoutePoints(smoothPoints);
    setActiveRouteId(routeId);
    setSelectedCheckpointIndex(null);

    const routeName = availableRoutes.find(r => r.id === routeId)?.name || '自訂客製化行車路線';
    addLog('info', `🗺️ 已加載新路線「${routeName}」：包含 ${newCheckpoints.length} 個控制點，已流暢化生成 ${smoothPoints.length} 個高精細模擬導航航點。`);
    addTerminalLog(`/api/v2/navigation/route?id=${routeId}`, 'POST');

    // Refit map bounds to encompass the new route
    if (mapRef.current && smoothPoints.length > 0) {
      const latlngs = smoothPoints.map(p => L.latLng(p.lat, p.lng));
      const bounds = L.polyline(latlngs).getBounds();
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  const handleMoveCheckpoint = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === checkpoints.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newCheckpoints = [...checkpoints];
    const temp = newCheckpoints[index];
    newCheckpoints[index] = newCheckpoints[targetIndex];
    newCheckpoints[targetIndex] = temp;

    setCheckpoints(newCheckpoints);
    addLog('info', `🔁 行車路線控制點 ${index + 1} 與控制點 ${targetIndex + 1} 已調換順序，請點擊「應用當前行車線」來更新導航。`);
  };

  const handleDeleteCheckpoint = (index: number) => {
    const deleted = checkpoints[index];
    const newCheckpoints = checkpoints.filter((_, idx) => idx !== index);
    setCheckpoints(newCheckpoints);
    addLog('info', `🗑️ 已移除控制點：${deleted.streetName}，請點擊「應用當前行車線」使修改生效。`);
    if (selectedCheckpointIndex === index) {
      setSelectedCheckpointIndex(null);
    }
  };

  const handleAddCheckpoint = () => {
    const latNum = parseFloat(newCheckpointLat);
    const lngNum = parseFloat(newCheckpointLng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      alert("請輸入有效的經緯度座標！");
      return;
    }
    if (!newCheckpointStreetName.trim()) {
      alert("請輸入路段/點位名稱！");
      return;
    }

    const newCp: RoutePoint = {
      lat: latNum,
      lng: lngNum,
      streetName: newCheckpointStreetName.trim(),
      speedLimit: newCheckpointSpeedLimit,
      instruction: newCheckpointInstruction.trim() || `行經${newCheckpointStreetName.trim()}，道路速限為 ${newCheckpointSpeedLimit} 公里。`,
      isElevated: newCheckpointIsElevated
    };

    setCheckpoints(prev => [...prev, newCp]);
    addLog('info', `➕ 已手動新增行車控制點：${newCp.streetName} (${newCp.lat.toFixed(5)}, ${newCp.lng.toFixed(5)})`);

    // Reset fields
    setNewCheckpointLat('');
    setNewCheckpointLng('');
    setNewCheckpointStreetName('');
    setNewCheckpointInstruction('');
    setNewCheckpointIsElevated(false);
  };

  const handleSaveCustomRoute = () => {
    if (checkpoints.length < 2) return;
    const name = prompt("請輸入這條自訂行車路線的名稱：", `自訂行車線 (${checkpoints.length} 點)`);
    if (!name || !name.trim()) return;

    const description = prompt("請輸入此路線的簡短描述：", `由使用者設計，共 ${checkpoints.length} 個控制點的自訂行駛航段。`);

    const newRoute: PresetRoute = {
      id: `custom_route_${Date.now()}`,
      name: name.trim(),
      description: description || `由使用者設計，共 ${checkpoints.length} 個控制點的自訂行駛航段。`,
      checkpoints: [...checkpoints]
    };

    setAvailableRoutes(prev => {
      const updated = [...prev, newRoute];
      localStorage.setItem('motc_custom_routes_v1', JSON.stringify(updated));
      return updated;
    });

    setActiveRouteId(newRoute.id);
    addLog('info', `💾 已成功將「${newRoute.name}」路線儲存至本地瀏覽器 LocalStorage`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Geometric Balance Top Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md z-50 shrink-0">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 mr-3 shrink-0 animate-pulse">
            <Navigation className="w-5 h-5 text-white transform -rotate-45" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider uppercase text-slate-100">
                台灣都市路網動態導航與 HUD 模擬器
              </span>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.2 rounded">
                TDX v3
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium font-mono">
              MOTC Toby Wang • 臺北市中心環線動態監控
            </div>
          </div>
        </div>

        {/* Right HUD status stats */}
        <div className="flex items-center gap-5">
          {/* Dynamic clock in elegant display */}
          <div className="hidden md:flex items-center gap-1.5 text-xs font-mono bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">SYSTEM TIME:</span>
            <span className="text-blue-400 font-bold tracking-widest">{currentTime || "00:00:00"}</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-slate-400 font-bold">GPS LOCKED</span>
              <span className="text-slate-500 text-[10px] bg-slate-900 px-1 py-0.2 rounded border border-slate-800">12 SAT</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-5 p-5 max-w-[1700px] w-full mx-auto overflow-hidden">
        
        {/* LEFT COLUMN: Map HUD and Active Guidance (8/12 Columns) */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          
          {/* Dynamic Top Sign / Turn-by-turn Banner */}
          <div className="bg-blue-600 text-white p-4 rounded-xl border border-blue-400/20 shadow-xl shadow-blue-950/10 flex items-center justify-between transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="bg-blue-500/50 border border-blue-300/30 rounded-lg p-3 flex items-center justify-center text-white shadow">
                {routePoints[nav.currentPointIndex]?.isElevated ? (
                  <Sliders className="w-6 h-6 animate-bounce text-yellow-300" />
                ) : (
                  <Compass className="w-6 h-6 text-white animate-spin" style={{ animationDuration: '6s' }} />
                )}
              </div>
              <div>
                <span className="text-blue-100 text-[10px] font-mono font-bold tracking-widest uppercase block">
                  {routePoints[nav.currentPointIndex]?.isElevated ? "🛣️ 當前行駛：快速道路高架路段" : "🗺️ 當前行駛路段"}
                </span>
                <span className="text-lg font-bold tracking-tight block font-sans">
                  {routePoints[nav.currentPointIndex]?.streetName || "正在定位中..."}
                </span>
                <p className="text-blue-50/90 text-xs mt-0.5 max-w-xl font-medium font-sans">
                  {routePoints[nav.currentPointIndex]?.instruction || "點擊「開始行駛模擬」按鈕啟動路線導航。"}
                </p>
              </div>
            </div>

            <button
              onClick={playManualVoiceHelp}
              className="bg-blue-500/50 hover:bg-blue-500 hover:scale-105 active:scale-95 border border-blue-300/30 rounded-lg p-3 flex items-center gap-2 text-white font-mono text-xs font-bold transition-all shrink-0 cursor-pointer shadow-md"
              title="播報語音導航指引"
            >
              <Volume2 className="w-5 h-5 animate-pulse" />
              <span className="hidden sm:inline">語音播報</span>
            </button>
          </div>

          {/* Map Viewer Shell */}
          <div className="relative bg-slate-950 rounded-xl border border-slate-800/80 overflow-hidden flex-1 min-h-[450px] lg:min-h-[580px] flex flex-col shadow-inner group bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px]">
            
            {/* First-Person Driver Simulated Windshield & Dashboard Cockpit */}
            {viewMode === 'driver' && (
              <DriverCockpit
                currentSpeed={nav.currentSpeed}
                speedLimit={routePoints[nav.currentPointIndex]?.speedLimit || 50}
                streetName={routePoints[nav.currentPointIndex]?.streetName || "都會環線道路"}
                instruction={routePoints[nav.currentPointIndex]?.instruction || "導航啟動中..."}
                heading={nav.heading}
                isElevated={!!routePoints[nav.currentPointIndex]?.isElevated}
                isDriving={nav.isDriving}
                isPaused={nav.isPaused}
                nearestEvent={nearestEvent}
                simSpeedMultiplier={nav.simSpeedMultiplier}
              />
            )}

            {/* Interactive Leaflet Map Container. Conditionally placed inside PIP when viewMode === 'driver' */}
            <div className={`transition-all duration-500 ease-in-out ${
              viewMode === 'driver' 
                ? 'absolute bottom-4 right-4 w-44 h-32 md:w-60 md:h-40 z-40 rounded-xl border-2 border-slate-800 shadow-2xl overflow-hidden'
                : 'absolute inset-0 z-0'
            }`}>
              <div ref={mapContainerRef} className="w-full h-full" id="leaflet-map-element" />
              {viewMode === 'driver' && (
                <div className="absolute top-2 left-2 bg-slate-900/95 text-[8px] font-mono font-bold text-blue-400 border border-slate-800 rounded px-1.5 py-0.5 select-none z-[1000] flex items-center gap-1 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                  GPS NAV MAP
                </div>
              )}
            </div>

            {/* Speed Camera Warning Popup Alert Overlay - Only shown in 2D/3D Map views since Driver has its own detailed HUD overlay */}
            {viewMode !== 'driver' && nearestEvent && nearestEvent.distance < 200 && (
              <div className="absolute top-4 left-4 right-4 mx-auto max-w-md bg-red-950/90 backdrop-blur-md text-red-200 py-3 px-4 rounded-lg border border-red-500/40 shadow-xl shadow-red-950/40 z-[1000] animate-bounce flex items-center gap-3.5">
                <div className="bg-red-900/60 p-2.5 rounded-lg text-red-400 border border-red-700/60 shrink-0">
                  {nearestEvent.event.type === 'accident' && <AlertTriangle className="w-5 h-5 text-red-400" />}
                  {nearestEvent.event.type === 'construction' && <Hammer className="w-5 h-5 text-amber-400" />}
                  {nearestEvent.event.type === 'speed_camera' && <Camera className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] text-red-400 font-bold tracking-widest block font-mono uppercase">🚨 PROXIMITY WARNING 鄰近路況預警</span>
                  <p className="font-bold text-xs text-white truncate">
                    {nearestEvent.event.title} • 距離 {nearestEvent.distance}m
                  </p>
                  <p className="text-[10px] text-red-300/90 mt-0.5 leading-relaxed truncate">
                    {nearestEvent.event.description}
                  </p>
                </div>
              </div>
            )}

            {/* View Mode Segmented Selector (Always visible, overlaying at top-left) */}
            <div className="absolute top-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-800 flex items-center gap-1 shadow-xl">
              <button
                onClick={() => {
                  setViewMode('2d');
                  setNav(p => ({ ...p, hudTilt: false }));
                  addLog('info', '🗺️ 切換為：2D 俯視平面地圖視角');
                }}
                className={`py-1 px-2.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2D Map
              </button>
              <button
                onClick={() => {
                  setViewMode('3d');
                  setNav(p => ({ ...p, hudTilt: true }));
                  addLog('info', '🚘 切換為：3D HUD 傾斜投影視角');
                }}
                className={`py-1 px-2.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === '3d'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3D HUD
              </button>
              <button
                onClick={() => {
                  setViewMode('driver');
                  setNav(p => ({ ...p, hudTilt: false }));
                  addLog('info', '🏎️ 切換為：第一人稱駕駛艙模擬視角');
                }}
                className={`py-1 px-2.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'driver'
                    ? 'bg-emerald-600 text-white shadow shadow-emerald-950/25'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping shrink-0" />
                模擬開車 (Driver)
              </button>
              <button
                onClick={() => {
                  setViewMode('analysis');
                  setNav(p => ({ ...p, hudTilt: false }));
                  addLog('info', '📍 切換為：OSM 拓撲路網規劃與分析視角');
                }}
                className={`py-1 px-2.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === 'analysis'
                    ? 'bg-purple-600 text-white shadow shadow-purple-950/25'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                路網分析 (OSM)
              </button>
            </div>

            {/* Dashboard Telemetry Widget on top of Map - Hidden in driver mode to avoid double instrumentation */}
            {viewMode !== 'driver' && (
              <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md p-3.5 rounded-lg border border-slate-800 shadow-xl w-64 transition-all hover:opacity-20">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-[10px] text-slate-400 font-bold font-mono tracking-widest uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    🚘 TELEMETRY (即時行車指標)
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>

                {/* Speed dial mockup */}
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-full border-2 border-slate-800 flex flex-col items-center justify-center bg-slate-950">
                    <span className="text-lg font-bold text-white font-mono leading-none">{nav.currentSpeed}</span>
                    <span className="text-[8px] text-slate-500 font-mono mt-0.5 font-bold">KM/H</span>
                    
                    {/* Dynamic speed arc pointer */}
                    <div 
                      className="absolute inset-0 rounded-full border-t-2 border-sky-400 transition-transform"
                      style={{ transform: `rotate(${(nav.currentSpeed / 120) * 180}deg)` }}
                    />
                  </div>
                  
                  <div className="flex-1 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">ROAD LIMIT</span>
                      <span className="text-slate-200 font-bold bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                        {routePoints[nav.currentPointIndex]?.speedLimit || 50}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">HEADING</span>
                      <span className="text-sky-400 font-bold">{Math.round(nav.heading)}° N</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">PROGRESS</span>
                      <span className="text-emerald-400 font-bold">
                        {Math.round((nav.currentPointIndex / routePoints.length) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warnings and alerts inside vehicle */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 text-[10px] flex items-center justify-between font-mono">
                  <span className="text-slate-500">自動駕駛狀態 (ODD):</span>
                  {nav.currentSpeed > (routePoints[nav.currentPointIndex]?.speedLimit || 50) ? (
                    <span className="text-red-400 font-bold animate-pulse">⚠️ OVER SPEED SPEEDING</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">NORMAL 暢通</span>
                  )}
                </div>
              </div>
            )}

            {/* Quick action buttons overlay on the Map (Right corner or top right depending on mode) */}
            <div className={`absolute z-[500] flex gap-2 transition-all duration-300 ${
              viewMode === 'driver'
                ? 'top-4 right-4 flex-row'
                : 'bottom-4 right-4 flex-col'
            }`}>
              {/* HUD 3D TILT BUTTON - Hidden in driver cabin mode to reduce redundant dials */}
              {viewMode !== 'driver' && (
                <button
                  id="toggle-3d-button"
                  onClick={() => {
                    const nextTilt = !nav.hudTilt;
                    setNav(p => ({ ...p, hudTilt: nextTilt }));
                    setViewMode(nextTilt ? '3d' : '2d');
                  }}
                  className={`p-2.5 rounded-lg border text-white font-semibold transition-all shadow-md flex items-center gap-2 text-xs ${
                    viewMode === '3d' 
                      ? 'bg-blue-600 border-blue-400 hover:bg-blue-500 scale-102' 
                      : 'bg-slate-900/90 border-slate-800 hover:bg-slate-800'
                  }`}
                  title="切換 3D HUD 傾斜駕駛視角"
                >
                  <Layers className={`w-4 h-4 ${viewMode === '3d' ? 'animate-bounce text-yellow-300' : 'text-slate-400'}`} />
                  <span className="text-[11px] font-mono">{viewMode === '3d' ? '3D HUD' : '2D Map'}</span>
                </button>
              )}

              {/* SPEECH SYNTHESIS MUTE/UNMUTE */}
              <button
                id="toggle-mute-button"
                onClick={() => {
                  const newMuted = !nav.isMuted;
                  setNav(p => ({ ...p, isMuted: newMuted }));
                  addLog('info', newMuted ? '🔇 語音播報靜音' : '🔊 語音播報已啟用');
                  if (!newMuted) {
                    speak("導航語音系統已開啟，祝您行車平安。");
                  }
                }}
                className={`p-2.5 rounded-lg border text-white transition-all shadow-md flex items-center gap-2 text-xs cursor-pointer ${
                  !nav.isMuted 
                    ? 'bg-emerald-600 border-emerald-400 hover:bg-emerald-500' 
                    : 'bg-slate-900/90 border-slate-800 hover:bg-slate-800 text-slate-400'
                }`}
                title="語音導航喇叭"
              >
                {!nav.isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-[11px] font-mono">{!nav.isMuted ? '語音開' : '靜音'}</span>
              </button>

              {/* MANUAL VOICE CALL REPLAY */}
              <button
                id="replay-voice-button"
                onClick={playManualVoiceHelp}
                className="p-2.5 bg-slate-900/90 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-all shadow-md flex items-center gap-2 text-xs cursor-pointer"
                title="手動播報當前路口導航"
              >
                <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
                <span className="text-[11px] font-mono">重播語音</span>
              </button>
            </div>


            {customEventLat !== null && customEventLng !== null && (
              <div className="absolute top-4 right-4 z-[500] bg-slate-950/95 p-4 rounded-xl border-2 border-sky-500 shadow-2xl max-w-sm animate-fade-in text-xs">
                {/* Header with Close and Tabs */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                    <button
                      onClick={() => setClickPopupTab('event')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                        clickPopupTab === 'event'
                          ? 'bg-sky-600/30 text-sky-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      即時派遣
                    </button>
                    <button
                      onClick={() => setClickPopupTab('checkpoint')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                        clickPopupTab === 'checkpoint'
                          ? 'bg-sky-600/30 text-sky-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      設為控制點
                    </button>
                  </div>
                  <button 
                    onClick={() => setCustomEventLat(null)}
                    className="text-slate-500 hover:text-slate-300 font-mono text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                {clickPopupTab === 'event' ? (
                  <>
                    <p className="text-slate-300 mb-2.5">
                      您點擊了地圖位置。請選擇事件類型，將即時路況事件派發至該經緯度：
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">事件名稱</label>
                        <input
                          type="text"
                          value={customEventTitle}
                          onChange={(e) => setCustomEventTitle(e.target.value)}
                          placeholder="e.g. 內側車道爆胎故障、移動測速"
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">事件類別</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['accident', 'construction', 'speed_camera'] as const).map(type => (
                            <button
                              key={type}
                              onClick={() => setCustomEventType(type)}
                              className={`py-1.5 px-1 rounded border text-center font-medium capitalize transition-all ${
                                customEventType === type 
                                  ? 'bg-sky-600/30 text-sky-400 border-sky-500/70' 
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {type === 'accident' ? '車禍 ⚠️' : type === 'construction' ? '施工 🚧' : '測速 📸'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-1.5 flex gap-2">
                        <button
                          onClick={handleCreateCustomEvent}
                          className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-1.5 px-3 rounded text-center shadow transition-all cursor-pointer"
                        >
                          確認派遣
                        </button>
                        <button
                          onClick={() => setCustomEventLat(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 px-3 rounded text-center transition-all cursor-pointer"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-slate-300 mb-2.5">
                      地圖點擊經緯度已捕獲：<span className="text-sky-400 font-mono font-bold">{customEventLat.toFixed(5)}, {customEventLng.toFixed(5)}</span>
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">路段 / 控制點標題</label>
                        <input
                          type="text"
                          placeholder="e.g. 中山南路口 / 中正紀念堂旁"
                          value={newCheckpointStreetName}
                          onChange={(e) => setNewCheckpointStreetName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">道路速限</label>
                          <select
                            value={newCheckpointSpeedLimit}
                            onChange={(e) => setNewCheckpointSpeedLimit(parseInt(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                          >
                            {[30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                              <option key={v} value={v}>{v} km/h</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5 pt-4">
                          <input
                            type="checkbox"
                            id="popup-elevated-chk"
                            checked={newCheckpointIsElevated}
                            onChange={(e) => setNewCheckpointIsElevated(e.target.checked)}
                            className="rounded text-sky-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
                          />
                          <label htmlFor="popup-elevated-chk" className="text-[10px] text-slate-400 select-none cursor-pointer">
                            高架路段
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">導航播報語音</label>
                        <textarea
                          rows={2}
                          placeholder="e.g. 沿中山南路直行，朝愛國東路方向"
                          value={newCheckpointInstruction}
                          onChange={(e) => setNewCheckpointInstruction(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 resize-none font-sans"
                        />
                      </div>

                      <div className="pt-1.5 flex gap-2">
                        <button
                          onClick={() => {
                            if (!newCheckpointStreetName.trim()) {
                              alert("請輸入控制點名稱！");
                              return;
                            }
                            
                            const newCp: RoutePoint = {
                              lat: customEventLat,
                              lng: customEventLng,
                              streetName: newCheckpointStreetName.trim(),
                              speedLimit: newCheckpointSpeedLimit,
                              instruction: newCheckpointInstruction.trim() || `行經${newCheckpointStreetName.trim()}，道路速限為 ${newCheckpointSpeedLimit} 公里。`,
                              isElevated: newCheckpointIsElevated
                            };
                            
                            setCheckpoints(prev => [...prev, newCp]);
                            addLog('info', `📍 已由地圖點擊新增控制點：${newCp.streetName} (${newCp.lat.toFixed(5)}, ${newCp.lng.toFixed(5)})`);
                            setDesignerTab('designer'); // focus on control points list
                            
                            // reset
                            setNewCheckpointStreetName('');
                            setNewCheckpointInstruction('');
                            setNewCheckpointIsElevated(false);
                            setCustomEventLat(null);
                            setCustomEventLng(null);
                          }}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded text-center shadow transition-all cursor-pointer"
                        >
                          加入至當前路線
                        </button>
                        <button
                          onClick={() => setCustomEventLat(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 px-3 rounded text-center transition-all cursor-pointer"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 預設與自訂行車路線設計儀表板 */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-sky-400" />
                <div>
                  <h2 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">
                    預設與自訂行車路線設計師 (ROUTE DESIGNER)
                  </h2>
                  <p className="text-[10px] text-slate-500 font-medium">切換預設路線、調整控制點，或自訂行駛路網航段</p>
                </div>
              </div>
              <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 self-start sm:self-auto">
                <button
                  onClick={() => setDesignerTab('presets')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    designerTab === 'presets'
                      ? 'bg-sky-600/30 text-sky-400 border border-sky-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  快速選路 (Presets)
                </button>
                <button
                  onClick={() => setDesignerTab('designer')}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    designerTab === 'designer'
                      ? 'bg-sky-600/30 text-sky-400 border border-sky-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  控制點編輯 (Designer)
                </button>
              </div>
            </div>

            {designerTab === 'presets' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {availableRoutes.map(route => {
                  const isSelected = activeRouteId === route.id;
                  return (
                    <div
                      key={route.id}
                      onClick={() => handleApplyRoute(route.checkpoints, route.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${
                        isSelected
                          ? 'bg-sky-950/30 border-sky-500 shadow-md shadow-sky-950/20'
                          : 'bg-slate-950/50 border-slate-850 hover:border-slate-700 hover:bg-slate-950/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className={`font-bold text-xs line-clamp-1 ${isSelected ? 'text-sky-400' : 'text-slate-200'}`}>
                            {route.name}
                          </span>
                          {isSelected ? (
                            <CheckCircle className="w-4 h-4 text-sky-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal line-clamp-2 font-sans">
                          {route.description}
                        </p>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                        <span>控制節點數: {route.checkpoints.length} 點</span>
                        <span className={isSelected ? 'text-sky-400 font-bold' : 'text-slate-500 group-hover:text-slate-400'}>
                          {isSelected ? '正在模擬中' : '選擇此路線 →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Active Checkpoints Table (7/12 Columns) */}
                <div className="lg:col-span-7 flex flex-col gap-2">
                  <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-[10px] text-slate-400 font-mono">
                    <span>行車控制點清單 (CHECKPOINTS LIST)</span>
                    <span className="text-sky-400 text-[9px]">💡 點擊控制點，地圖將自動對焦</span>
                  </div>
                  
                  <div className="max-h-[220px] min-h-[160px] overflow-y-auto border border-slate-850 rounded-lg divide-y divide-slate-850/60 bg-slate-950/20 scrollbar-thin">
                    {checkpoints.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/30">
                        暫無行車控制點。請利用右側表單新增點位，或直接點擊地圖任意位置並切換至「設為控制點」頁籤來一鍵建立！
                      </div>
                    ) : (
                      checkpoints.map((cp, idx) => {
                        const isSelected = selectedCheckpointIndex === idx;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 text-xs transition-all ${
                              isSelected ? 'bg-sky-950/20' : 'bg-slate-950/20 hover:bg-slate-950/50'
                            }`}
                          >
                            <div 
                              onClick={() => {
                                setSelectedCheckpointIndex(idx);
                                if (mapRef.current) {
                                  mapRef.current.setView([cp.lat, cp.lng], 16, { animate: true });
                                  addLog('info', `🔍 地圖視角已對焦至控制點 ${idx + 1}：${cp.streetName}`);
                                }
                              }}
                              className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
                            >
                              <span className="w-5 h-5 bg-slate-800 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-slate-400 shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate flex items-center gap-1">
                                  {cp.streetName}
                                  {cp.isElevated && (
                                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-mono font-bold px-1 rounded shrink-0">
                                      高架
                                    </span>
                                  )}
                                </p>
                                <p className="text-[9px] text-slate-500 truncate leading-relaxed">{cp.instruction}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] ml-2">
                              <span className="text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-bold">
                                {cp.speedLimit} km/h
                              </span>
                              
                              {/* Reordering Up/Down controls */}
                              <div className="flex items-center border border-slate-800 rounded bg-slate-900 overflow-hidden">
                                <button
                                  onClick={() => handleMoveCheckpoint(idx, 'up')}
                                  disabled={idx === 0}
                                  className="p-1 text-slate-500 hover:text-white disabled:opacity-25 transition-all cursor-pointer"
                                  title="上移節點"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveCheckpoint(idx, 'down')}
                                  disabled={idx === checkpoints.length - 1}
                                  className="p-1 text-slate-500 hover:text-white disabled:opacity-25 transition-all cursor-pointer border-l border-slate-800"
                                  title="下移節點"
                                >
                                  <ChevronRight className="w-3.5 h-3.5 transform rotate-90" />
                                </button>
                              </div>

                              <button
                                onClick={() => handleDeleteCheckpoint(idx)}
                                className="p-1 text-red-500 hover:text-red-400 transition-all cursor-pointer"
                                title="刪除控制點"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Actions buttons row */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    <button
                      onClick={() => {
                        if (confirm("確定要清除當前所有控制點，設計一條全新的自訂路線嗎？")) {
                          setCheckpoints([]);
                          addLog('info', '🧹 已重設行車路線。現在您可以使用右側欄位，或直接點擊地圖任意位置來新增您的控制點。');
                        }
                      }}
                      className="flex-1 min-w-[80px] bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-bold py-1.5 rounded transition-all cursor-pointer"
                    >
                      清空節點
                    </button>
                    <button
                      onClick={() => handleApplyRoute(PRESET_ROUTES[0].checkpoints, 'motc_loop')}
                      className="flex-1 min-w-[80px] bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-bold py-1.5 rounded transition-all cursor-pointer"
                    >
                      回復預設
                    </button>
                    <button
                      onClick={handleSaveCustomRoute}
                      disabled={checkpoints.length < 2}
                      className="flex-1 min-w-[100px] bg-sky-600/10 hover:bg-sky-600 border border-sky-500/30 text-sky-400 hover:text-white disabled:opacity-20 text-[10px] font-bold py-1.5 rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      儲存自訂路線
                    </button>
                    <button
                      onClick={() => handleApplyRoute(checkpoints, 'custom_' + Date.now())}
                      disabled={checkpoints.length < 2}
                      className="flex-1 min-w-[100px] bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white disabled:opacity-20 text-[10px] font-bold py-1.5 rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      套用行車路線
                    </button>
                  </div>
                </div>

                {/* Add New Checkpoint Form (5/12 Columns) */}
                <div className="lg:col-span-5 bg-slate-950/40 p-3 rounded-lg border border-slate-850 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-[10px] text-sky-400 font-bold block font-mono uppercase tracking-wider">
                      ➕ 手動加入控制節點 (ADD NODE)
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5 font-mono uppercase">緯度 Lat</label>
                        <input
                          type="text"
                          placeholder="e.g. 25.0425"
                          value={newCheckpointLat}
                          onChange={(e) => setNewCheckpointLat(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5 font-mono uppercase">經度 Lng</label>
                        <input
                          type="text"
                          placeholder="e.g. 121.5189"
                          value={newCheckpointLng}
                          onChange={(e) => setNewCheckpointLng(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">路段/點位名稱 (Street Name)</label>
                      <input
                        type="text"
                        placeholder="e.g. 中山南路 (台大醫院前)"
                        value={newCheckpointStreetName}
                        onChange={(e) => setNewCheckpointStreetName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">速限 (Speed Limit)</label>
                        <select
                          value={newCheckpointSpeedLimit}
                          onChange={(e) => setNewCheckpointSpeedLimit(parseInt(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer font-sans"
                        >
                          {[30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                            <option key={v} value={v}>{v} km/h</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5 pt-4">
                        <input
                          type="checkbox"
                          id="cp-elevated-chk-form"
                          checked={newCheckpointIsElevated}
                          onChange={(e) => setNewCheckpointIsElevated(e.target.checked)}
                          className="rounded text-sky-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="cp-elevated-chk-form" className="text-[10px] text-slate-400 select-none cursor-pointer font-sans">
                          快速道路高架
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">語音導航播報 (Instruction)</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. 沿中山南路直行，朝台北車站方向前進"
                        value={newCheckpointInstruction}
                        onChange={(e) => setNewCheckpointInstruction(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 resize-none font-sans"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddCheckpoint}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-1.5 rounded text-xs transition-all mt-3 cursor-pointer text-center shadow"
                  >
                    ➕ 插入控制點 (Add Checkpoint)
                  </button>
                </div>
              </div>
            )}

            <span className="text-[9px] text-slate-500 block font-sans leading-relaxed border-t border-slate-800/80 pt-2.5">
              💡 <strong>行家設計指南：</strong>
              您可以直接<strong>點擊地圖上的任意路口</strong>，此時地圖右上角會跳出派遣視窗。切換至「<strong>設為控制點</strong>」頁籤即可<strong>一鍵精準捕獲經緯度</strong>並填入名稱，直接插入為當前自訂路線中。設計完成後，按下「<strong>套用行車路線</strong>」便可立即展開您的專屬導航旅程！
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Simulator Play Deck & API Probe (4/12 Columns) */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          
          {/* Simulation Control Deck */}
                    {/* OSMnx Route Analysis Control Panel (Alternative View Mode Panel) */}
          {viewMode === 'analysis' ? (
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-purple-500" />
                  <h2 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">📍 OSMnx 跨路網分析面板</h2>
                </div>
                <span className="text-[9px] font-mono bg-purple-950/50 text-purple-400 py-0.5 px-2 rounded border border-purple-800/40 font-bold">REALTIME SYNC</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">選擇規劃好的路網分析：</label>
                {routeAnalyses.length === 0 ? (
                  <div className="text-slate-500 text-xs py-4 text-center border border-dashed border-slate-850 rounded-lg">
                    資料庫目前沒有已儲存的路網分析。<br/>請至 Streamlit 後台規劃並上傳！
                  </div>
                ) : (
                  <select
                    value={selectedAnalysisId || ''}
                    onChange={(e) => setSelectedAnalysisId(e.target.value || null)}
                    className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-600 transition-all font-sans"
                  >
                    <option value="">-- 請選擇一個路網分析 --</option>
                    {routeAnalyses.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {(() => {
                const activeAnalysis = routeAnalyses.find(r => r.id === selectedAnalysisId);
                if (activeAnalysis) {
                  return (
                    <div className="flex flex-col gap-4 animate-fade-in">
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-purple-400 font-bold uppercase">路網資訊 CARD</span>
                          <span className="text-xs font-bold">
                            {activeAnalysis.mode === 'walk' ? '🚶 步行模式' : activeAnalysis.mode === 'bike' ? '🚲 自行車模式' : '🚗 汽車道路模式'}
                          </span>
                        </div>
                        
                        <div className="border-t border-slate-850 my-1"></div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] text-slate-500 font-mono uppercase block">起點位置</span>
                          <span className="text-xs text-slate-200 font-bold block">{activeAnalysis.start_name}</span>
                        </div>
                        
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="text-[9px] text-slate-500 font-mono uppercase block">終點位置</span>
                          <span className="text-xs text-slate-200 font-bold block">{activeAnalysis.end_name}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-slate-900/60 p-2 rounded border border-slate-800 text-center">
                            <span className="text-slate-500 text-[8px] block font-mono uppercase">計算總距離</span>
                            <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                              {activeAnalysis.distance_meters > 1000 
                                ? `${(activeAnalysis.distance_meters / 1000).toFixed(2)} km`
                                : `${Math.round(activeAnalysis.distance_meters)} m`}
                            </span>
                          </div>
                          <div className="bg-slate-900/60 p-2 rounded border border-slate-800 text-center">
                            <span className="text-slate-500 text-[8px] block font-mono uppercase">預估移動耗時</span>
                            <span className="text-sm font-bold text-yellow-400 font-mono mt-0.5 block">
                              {Math.round(activeAnalysis.duration_seconds / 60)} 分鐘
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleImportRouteForSimulation}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 px-4 rounded-lg font-bold text-xs font-mono transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-950/20 active:scale-98"
                      >
                        <Play className="w-4 h-4 animate-pulse" />
                        🚗 匯入為行車模擬，開始開車！
                      </button>
                    </div>
                  );
                } else {
                  return (
                    <div className="text-slate-500 text-xs py-8 text-center border border-dashed border-slate-850 rounded-lg">
                      💡 點選上方下拉選單以載入路網拓撲！
                    </div>
                  );
                }
              })()}
            </div>
          ) : (
<div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">系統控制面板 (CONSOLE)</h2>
              </div>
              <div className="flex items-center gap-1 text-xs font-mono bg-slate-950 py-0.5 px-2 rounded border border-slate-800">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] text-slate-400">CLOCK CTRL</span>
              </div>
            </div>

            {/* Simulated Road Telemetry Status Circle */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-center">
                <span className="text-slate-500 text-[9px] block font-mono uppercase tracking-wider">已行駛距離</span>
                <span className="text-lg font-bold font-mono text-white mt-0.5 block">
                  {Math.round(nav.currentPointIndex * 10)} <span className="text-xs text-slate-500 font-sans">m</span>
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-center">
                <span className="text-slate-500 text-[9px] block font-mono uppercase tracking-wider">都會環線剩餘</span>
                <span className="text-lg font-bold font-mono text-blue-400 mt-0.5 block">
                  {Math.max(0, Math.round((routePoints.length - nav.currentPointIndex) * 10))} <span className="text-xs text-slate-500 font-sans">m</span>
                </span>
              </div>
            </div>

            {/* Play controls */}
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                {/* PLAY / PAUSE BUTTON */}
                <button
                  id="play-pause-simulation-button"
                  onClick={handleStartDriving}
                  className={`flex-1 font-bold py-2.5 px-4 rounded-lg shadow-md text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    nav.isDriving && !nav.isPaused
                      ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/20 shadow-amber-950/10'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/20 shadow-blue-950/10'
                  }`}
                >
                  {nav.isDriving && !nav.isPaused ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      暫停行駛 (PAUSE)
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current animate-pulse" />
                      {nav.currentPointIndex > 0 ? '繼續行駛 (RESUME)' : '啟動模擬駕駛 (RUN)'}
                    </>
                  )}
                </button>

                {/* RESET BUTTON */}
                <button
                  id="reset-simulation-button"
                  onClick={handleResetDriving}
                  disabled={nav.currentPointIndex === 0 && !nav.isDriving}
                  className="bg-slate-950 hover:bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white font-bold p-2.5 rounded-lg border border-slate-800 shadow transition-all cursor-pointer shrink-0"
                  title="重設模擬車輛位置"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Simulation Multiplier Speed Control */}
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[10px] text-slate-400 font-bold font-mono flex items-center gap-1 uppercase tracking-wider">
                    <Gauge className="w-3.5 h-3.5 text-blue-500" />
                    時間流速倍率 (SPEED MULTIPLIER)
                  </label>
                  <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-950/45 px-2 py-0.2 rounded border border-blue-900">
                    {nav.simSpeedMultiplier}x
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={nav.simSpeedMultiplier}
                  onChange={(e) => {
                    const multi = parseInt(e.target.value);
                    setNav(prev => ({ ...prev, simSpeedMultiplier: multi }));
                    addLog('info', `⚡ 調整模擬流速倍率為: ${multi}x`);
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1 px-1">
                  <span>1x (真實路況)</span>
                  <span>5x (快速)</span>
                  <span>10x (極速)</span>
                  <span>15x</span>
                </div>
              </div>
            </div>

            {/* Rapid Event Dispatch Panel */}
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <span className="text-[10px] text-slate-400 font-bold block font-mono uppercase tracking-wider">⚡ 預設開放道路事件即時模擬派遣</span>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const newEvt: TrafficEvent = {
                      id: `evt_crash_${Date.now()}`,
                      type: 'accident',
                      title: '忠孝東路追撞事故',
                      description: '中興匝道前小貨車與轎車擦撞，佔用外側車道，造成後方行車阻礙。',
                      lat: 25.0441,
                      lng: 121.5245,
                      roadName: '忠孝東路一段 (華山文創路段)',
                      severity: 'high',
                      createdAt: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
                    };
                    setEvents(p => [newEvt, ...p]);
                    // Set segment to jammed
                    setTrafficSegments(prev => prev.map(s => s.id === 'seg_3' ? { ...s, status: 'jammed', averageSpeed: 8 } : s));
                    addLog('alert', '📢 [即時派遣] 派遣「忠孝東路一段追撞車禍事故」，忠孝東路瞬間調降行車均速！');
                    addTerminalLog('/api/v2/traffic/dispatch', 'POST');
                  }}
                  className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium py-1.5 px-2 rounded text-xs transition-all text-left flex items-start gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[11px]">派遣追撞車禍</p>
                    <p className="text-[9px] text-red-400/80 font-mono">忠孝東路一段</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    const newEvt: TrafficEvent = {
                      id: `evt_const_${Date.now()}`,
                      type: 'construction',
                      title: '建國高架路面維護',
                      description: '建國南北高架道路(往南)信義匝道旁局部瀝青重銑鋪工程。',
                      lat: 25.0385,
                      lng: 121.5372,
                      roadName: '建國高架道路',
                      severity: 'medium',
                      createdAt: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
                    };
                    setEvents(p => [newEvt, ...p]);
                    // Set segment to heavy
                    setTrafficSegments(prev => prev.map(s => s.id === 'seg_5' ? { ...s, status: 'heavy', averageSpeed: 25 } : s));
                    addLog('alert', '📢 [即時派遣] 派遣「建國高架橋面封閉施工」，速限限縮！');
                    addTerminalLog('/api/v2/traffic/dispatch', 'POST');
                  }}
                  className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-medium py-1.5 px-2 rounded text-xs transition-all text-left flex items-start gap-1.5 cursor-pointer"
                >
                  <Hammer className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[11px]">派遣緊急施工</p>
                    <p className="text-[9px] text-amber-400/80 font-mono">建國高架道路</p>
                  </div>
                </button>
              </div>

              <div className="flex gap-2 mt-0.5">
                <button
                  onClick={handleClearEvents}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold py-1.5 px-3 rounded text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  清除事件 & 重設路況
                </button>
              </div>

              <span className="text-[9px] text-slate-500 text-center block mt-0.5 font-sans leading-relaxed">
                💡 提示：您也可以在左側 Leaflet 地圖上<strong>任意點擊</strong>來精確派遣自訂事件！
              </span>
            </div>
          </div>
          )}

          {/* Interactive API Probe / Real-time TDX JSON Inspector */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold tracking-wider text-slate-200 uppercase font-mono">TDX / Waze API 實時封包監聽</h2>
              </div>
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                API CONNECTED
              </span>
            </div>

            {/* Telemetry live mock json payload stream */}
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="bg-slate-950 rounded-lg p-2.5 border border-slate-800 font-mono text-[10px] leading-relaxed overflow-y-auto max-h-48 text-slate-300 flex-1 relative scrollbar-thin">
                <div className="absolute top-1 right-2 text-[8px] text-slate-500 font-mono select-none uppercase tracking-widest bg-slate-950/80 pl-1.5 pb-0.5">
                  LIVE JSON
                </div>
                
                <span className="text-blue-400 font-bold block font-mono border-b border-slate-900 pb-1 mb-1.5">
                  HTTP GET /api/v3/motc/navigation/telemetry
                </span>
                
                <pre className="whitespace-pre-wrap font-mono select-all">
{JSON.stringify({
  api_standard: "TDX-MOTC-Profile-v3",
  vehicle_telemetry: {
    coordinates: [
      parseFloat(routePoints[nav.currentPointIndex]?.lat.toFixed(6) || "0"),
      parseFloat(routePoints[nav.currentPointIndex]?.lng.toFixed(6) || "0")
    ],
    heading_deg: Math.round(nav.heading),
    speed_kmh: nav.currentSpeed,
    road_limit_kmh: routePoints[nav.currentPointIndex]?.speedLimit || 50,
    is_elevated_viaduct: !!routePoints[nav.currentPointIndex]?.isElevated,
    street_name: routePoints[nav.currentPointIndex]?.streetName || ""
  },
  nearest_incident: nearestEvent ? {
    event_id: nearestEvent.event.id,
    type: nearestEvent.event.type,
    title: nearestEvent.event.title,
    distance_meters: nearestEvent.distance,
    severity: nearestEvent.event.severity
  } : null,
  active_incidents_count: events.length
}, null, 2)}
                </pre>
              </div>

              {/* Console logs */}
              <div className="bg-slate-950 rounded-lg p-2.5 border border-slate-800 font-mono text-[10px] leading-tight overflow-y-auto max-h-36 h-28 text-slate-400 flex flex-col gap-1">
                <div className="text-slate-500 text-[8px] font-bold border-b border-slate-900 pb-1 flex items-center gap-1 uppercase tracking-wider mb-1 font-mono">
                  <Terminal className="w-3 h-3 text-slate-500" />
                  即時 API 通訊協定日誌 (HTTP Protocol Log)
                </div>
                {apiTerminalLogs.length === 0 ? (
                  <p className="text-slate-600 italic">無 API 通訊封包。啟動或重設模擬時，將自動監聽數據...</p>
                ) : (
                  apiTerminalLogs.map((termLog, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-blue-500 shrink-0 select-none">➜</span>
                      <p className="text-slate-300 break-all">{termLog}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Navigation Speech log / Event Feed */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col h-56">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-blue-500 animate-spin" style={{ animationDuration: '4s' }} />
                <h2 className="text-xs font-bold tracking-wider text-slate-200 uppercase font-mono">導航路況語音記錄器</h2>
              </div>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">History Feed</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                  暫無導航語音與通報紀錄。啟動自動駕駛以記錄。
                </div>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id} 
                    className={`p-2 rounded border text-[11px] leading-relaxed transition-all ${
                      log.type === 'alert'
                        ? 'bg-red-500/10 border-red-500/20 text-red-200'
                        : log.type === 'warning'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                        : log.type === 'voice'
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] opacity-60 font-mono font-bold tracking-wider">{log.timestamp}</span>
                      <span className={`text-[8px] uppercase font-bold font-mono px-1 py-0.2 rounded border ${
                        log.type === 'alert'
                          ? 'bg-red-900/45 border-red-500/30 text-red-400'
                          : log.type === 'warning'
                          ? 'bg-amber-900/45 border-amber-500/30 text-amber-400'
                          : log.type === 'voice'
                          ? 'bg-blue-900/45 border-blue-500/30 text-blue-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}>
                        {log.type.toUpperCase()}
                      </span>
                    </div>
                    <p className="font-medium">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Geometric Balance subtle status bar footer */}
      <footer className="h-10 bg-slate-950 border-t border-slate-900 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[10px] text-slate-500 font-mono gap-1 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <MapIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>SOURCE: OPENSTREETMAP v2026.07 • LAYER: ROAD_NETWORK_VECTOR • TILE_LOAD: 0.08s</span>
        </div>
        <div className="flex items-center gap-4">
          <span>HOST: PORT 3000</span>
          <span>•</span>
          <span className="text-emerald-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            LTE CONNECTED: █ █ █ █ █
          </span>
        </div>
      </footer>
    </div>
  );
}
