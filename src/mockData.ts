/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoutePoint, TrafficSegment, TrafficEvent } from './types';

// Key Checkpoints for the MOTC Central Taipei Driving Loop
export const CHECKPOINTS: RoutePoint[] = [
  {
    lat: 25.0384,
    lng: 121.5230,
    streetName: "仁愛路一段 (交通部前)",
    speedLimit: 40,
    instruction: "起點：從交通部出發，沿仁愛路一段向西行駛，靠右進入外側車道",
  },
  {
    lat: 25.0392,
    lng: 121.5186,
    streetName: "景福門圓環 (東門)",
    speedLimit: 30,
    instruction: "進入景福門圓環，由第三出口駛出，往中山南路(往北)行駛",
  },
  {
    lat: 25.0425,
    lng: 121.5189,
    streetName: "中山南路 (台大醫院前)",
    speedLimit: 50,
    instruction: "沿中山南路直行，朝台北車站/忠孝東路方向",
  },
  {
    lat: 25.0458,
    lng: 121.5193,
    streetName: "中山南路 / 忠孝東路口 (監察院前)",
    speedLimit: 40,
    instruction: "右轉進入忠孝東路一段",
  },
  {
    lat: 25.0441,
    lng: 121.5245,
    streetName: "忠孝東路一段 (華山文創旁)",
    speedLimit: 50,
    instruction: "繼續直行，經過華山 1914 創意文化園區，注意前方車多",
  },
  {
    lat: 25.0435,
    lng: 121.5300,
    streetName: "忠孝東路二段 (往新生南路)",
    speedLimit: 50,
    instruction: "沿忠孝東路二段直行，準備在前方路口靠右，接建國高架道路匝道",
  },
  {
    lat: 25.0428,
    lng: 121.5368,
    streetName: "建國高架入口匝道",
    speedLimit: 40,
    instruction: "靠右行駛，匯入建國南北快速道路 (往南向)",
  },
  {
    lat: 25.0385,
    lng: 121.5372,
    streetName: "建國高架道路 (南向)",
    speedLimit: 70,
    isElevated: true,
    instruction: "行經高架路段，速限提升至 70 公里，維持在主線車道",
  },
  {
    lat: 25.0350,
    lng: 121.5375,
    streetName: "建國高架道路 - 仁愛路出口",
    speedLimit: 40,
    instruction: "準備靠右，由仁愛路出口匝道駛離建國高架道路",
  },
  {
    lat: 25.0378,
    lng: 121.5300,
    streetName: "仁愛路三段 (大安森林公園旁)",
    speedLimit: 50,
    instruction: "匯入仁愛路三段快車道，向西朝總統府/景福門方向前進",
  },
  {
    lat: 25.0382,
    lng: 121.5250,
    streetName: "仁愛路二段 (往紹興南街)",
    speedLimit: 50,
    instruction: "沿仁愛路二段林蔭大道直行，前方 300 公尺即將抵達交通部",
  },
  {
    lat: 25.0384,
    lng: 121.5230,
    streetName: "仁愛路一段 (交通部)",
    speedLimit: 40,
    instruction: "抵達目的地：交通部。您的導航旅程已圓滿完成！",
  }
];

// Helper to calculate distance in meters between two coordinates (Haversine formula)
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// Helper to calculate heading angle from point A to point B (in degrees, 0-360)
export function getHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;
  const lambda2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const theta = Math.atan2(y, x);
  const brng = ((theta * 180) / Math.PI + 360) % 360; // in degrees
  return brng;
}

// Smoothly interpolate between checkpoints to produce a realistic list of points for simulation
export function generateSmoothRoute(points: RoutePoint[], stepDistanceMeters: number = 5): RoutePoint[] {
  const result: RoutePoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const dist = getDistance(start.lat, start.lng, end.lat, end.lng);
    const stepsCount = Math.max(1, Math.floor(dist / stepDistanceMeters));

    for (let s = 0; s < stepsCount; s++) {
      const t = s / stepsCount;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;

      // Gradually interpolate speed limit
      const speedLimit = Math.round(start.speedLimit + (end.speedLimit - start.speedLimit) * t);

      // Distribute instructions: show starting instruction at first 30% of the segment, then show upcoming instruction
      const instruction = t < 0.75 ? start.instruction : `即將準備：${end.instruction}`;

      result.push({
        lat,
        lng,
        streetName: t < 0.5 ? start.streetName : end.streetName,
        speedLimit,
        instruction,
        isElevated: start.isElevated && end.isElevated,
      });
    }
  }

  // Push the final point
  const last = points[points.length - 1];
  result.push({ ...last });

  return result;
}

// Generate the high-resolution route points (around 1000 smooth points)
export const HIGH_RES_ROUTE = generateSmoothRoute(CHECKPOINTS, 10); // 10 meters interval

// Custom high-contrast Leaflet Map Event Icons or SVG icons we can draw
// Mock road congestion polylines matching sections of the loop
export const TRAFFIC_SEGMENTS: TrafficSegment[] = [
  {
    id: 'seg_1',
    name: '仁愛路一段 (快車道)',
    coordinates: [
      [25.0384, 121.5230],
      [25.0392, 121.5186]
    ],
    status: 'smooth',
    speedLimit: 40,
    averageSpeed: 38,
  },
  {
    id: 'seg_2',
    name: '中山南路 (景福門 - 忠孝路口)',
    coordinates: [
      [25.0392, 121.5186],
      [25.0425, 121.5189],
      [25.0458, 121.5193]
    ],
    status: 'heavy',
    speedLimit: 50,
    averageSpeed: 28,
  },
  {
    id: 'seg_3',
    name: '忠孝東路一段 (主要擁堵路段)',
    coordinates: [
      [25.0458, 121.5193],
      [25.0441, 121.5245]
    ],
    status: 'jammed',
    speedLimit: 50,
    averageSpeed: 12,
  },
  {
    id: 'seg_4',
    name: '忠孝東路二段 (順暢)',
    coordinates: [
      [25.0441, 121.5245],
      [25.0435, 121.5300],
      [25.0428, 121.5368]
    ],
    status: 'smooth',
    speedLimit: 50,
    averageSpeed: 45,
  },
  {
    id: 'seg_5',
    name: '建國高架道路 (快速道路南向)',
    coordinates: [
      [25.0428, 121.5368],
      [25.0385, 121.5372],
      [25.0350, 121.5375]
    ],
    status: 'smooth',
    speedLimit: 70,
    averageSpeed: 68,
  },
  {
    id: 'seg_6',
    name: '仁愛路三段 (施工車慢)',
    coordinates: [
      [25.0350, 121.5375],
      [25.0378, 121.5300]
    ],
    status: 'heavy',
    speedLimit: 50,
    averageSpeed: 25,
  },
  {
    id: 'seg_7',
    name: '仁愛路二段 (極度順暢)',
    coordinates: [
      [25.0378, 121.5300],
      [25.0382, 121.5250],
      [25.0384, 121.5230]
    ],
    status: 'smooth',
    speedLimit: 50,
    averageSpeed: 48,
  }
];

// Initial active events on the map
export const INITIAL_EVENTS: TrafficEvent[] = [
  {
    id: 'evt_1',
    type: 'accident',
    title: '追撞事故車禍',
    description: '兩部自小客車發生追撞，佔用內側車道，後方回堵約 300 公尺。',
    lat: 25.0445,
    lng: 121.5215,
    roadName: '忠孝東路一段 (靠近華山園區)',
    severity: 'high',
    createdAt: '2026-07-07 14:30',
  },
  {
    id: 'evt_2',
    type: 'construction',
    title: '路面重鋪施工',
    description: '仁愛路三段慢車道進行瀝青銑鋪工程，封閉最右側一線車道。',
    lat: 25.0372,
    lng: 121.5332,
    roadName: '仁愛路三段快慢車道分割處',
    severity: 'medium',
    createdAt: '2026-07-07 12:00',
  },
  {
    id: 'evt_3',
    type: 'speed_camera',
    title: '雷達測速照相',
    description: '前向固定式測速照相，速限 50 公里。',
    lat: 25.0410,
    lng: 121.5188,
    roadName: '中山南路 (往北向，台大醫院前)',
    severity: 'low',
    createdAt: '2026-01-01 00:00',
  },
  {
    id: 'evt_4',
    type: 'speed_camera',
    title: '高架雷達測速照相',
    description: '高架道路固定式測速照相，速限 70 公里。',
    lat: 25.0395,
    lng: 121.5371,
    roadName: '建國高架道路 (南向，信義路匝道前)',
    severity: 'low',
    createdAt: '2026-01-01 00:00',
  }
];
