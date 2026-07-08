/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TrafficLevel = 'smooth' | 'heavy' | 'jammed';

export interface RoutePoint {
  lat: number;
  lng: number;
  streetName: string;
  speedLimit: number; // in km/h
  instruction: string; // Guidance instruction
  isElevated?: boolean; // elevated highway or normal road
}

export interface TrafficSegment {
  id: string;
  name: string;
  coordinates: [number, number][]; // Lat-Lng pairs
  status: TrafficLevel;
  speedLimit: number;
  averageSpeed: number;
}

export type EventType = 'accident' | 'construction' | 'congestion' | 'speed_camera' | 'flooding' | 'road_closure' | 'landmark' | 'poi' | 'parking';

export interface TrafficEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  lat: number;
  lng: number;
  roadName: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface NavState {
  currentPointIndex: number;
  progressAlongSegment: number; // 0 to 1 between current and next point
  currentSpeed: number; // km/h
  isDriving: boolean;
  isPaused: boolean;
  simSpeedMultiplier: number; // 1x, 2x, 5x, 10x
  hudTilt: boolean; // 3D HUD perspective
  isMuted: boolean;
  heading: number; // orientation angle
}

export interface SimulationLog {
  id: string;
  timestamp: string;
  type: 'info' | 'warning' | 'alert' | 'voice';
  message: string;
}

export interface RouteAnalysis {
  id: string;
  name: string;
  start_name: string;
  end_name: string;
  mode: 'drive' | 'walk' | 'bike';
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
  created_at: string;
}

