import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Camera,
  Hammer,
  Volume2,
  Wind,
  CloudRain,
  Sun,
  Moon,
  Shield,
  Lightbulb,
  Radio,
  Sparkles,
  Info
} from 'lucide-react';
import { TrafficEvent } from '../types';

interface DriverCockpitProps {
  currentSpeed: number;
  speedLimit: number;
  streetName: string;
  instruction: string;
  heading: number;
  isElevated: boolean;
  isDriving: boolean;
  isPaused: boolean;
  nearestEvent: { event: TrafficEvent; distance: number } | null;
  simSpeedMultiplier: number;
}

export default function DriverCockpit({
  currentSpeed,
  speedLimit,
  streetName,
  instruction,
  heading,
  isElevated,
  isDriving,
  isPaused,
  nearestEvent,
  simSpeedMultiplier
}: DriverCockpitProps) {
  // Environmental States
  const [isRainy, setIsRainy] = useState(false);
  const [wipersOn, setWipersOn] = useState(false);
  const [headlightsOn, setHeadlightsOn] = useState(true);
  const [ambientColor, setAmbientColor] = useState<'cyan' | 'orange' | 'purple' | 'emerald'>('cyan');
  const [isNight, setIsNight] = useState(true);
  
  // Animation/Interaction States
  const [roadOffset, setRoadOffset] = useState(0);
  const [steeringAngle, setSteeringAngle] = useState(0);
  const [wiperAngle, setWiperAngle] = useState(-50); // Degree of rotation for wipers
  const [wiperDirection, setWiperDirection] = useState(1); // 1 = sweep up, -1 = return
  const [hornActive, setHornActive] = useState(false);
  
  // Simulated traffic position
  const [oncomingCarPos, setOncomingCarPos] = useState({ progress: 0, lane: 0 }); // progress 0 to 1

  const prevHeadingRef = useRef<number>(heading);

  // Sound Synthesizer (Web Audio API)
  const playHornSound = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Dual oscillator for realistic car horn (400Hz and 410Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.frequency.setValueAtTime(410, ctx.currentTime);
      osc2.frequency.setValueAtTime(435, ctx.currentTime);
      
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      
      gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05); // quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35); // decay
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          ctx.close();
        } catch (e) {}
      }, 400);
    } catch (e) {
      console.warn('Web Audio horn synthesis blocked or not supported:', e);
    }
  };

  const triggerHorn = () => {
    setHornActive(true);
    playHornSound();
    setTimeout(() => setHornActive(false), 500);
  };

  // 1. Road Animation Loop (moves lanes backward based on current speed)
  useEffect(() => {
    if (!isDriving || isPaused || currentSpeed === 0) return;
    
    let frameId: number;
    const updateRoad = () => {
      // Speed factor determines how fast lines move
      const speedFactor = (currentSpeed / 10) * simSpeedMultiplier * 0.45;
      setRoadOffset(prev => (prev + speedFactor) % 100);
      frameId = requestAnimationFrame(updateRoad);
    };
    
    frameId = requestAnimationFrame(updateRoad);
    return () => cancelAnimationFrame(frameId);
  }, [isDriving, isPaused, currentSpeed, simSpeedMultiplier]);

  // 2. Oncoming Traffic Simulation Loop
  useEffect(() => {
    if (!isDriving || isPaused) return;
    
    const interval = setInterval(() => {
      setOncomingCarPos(prev => {
        if (prev.progress >= 1) {
          // Reset oncoming car
          return { progress: 0, lane: Math.random() > 0.5 ? 0 : 1 };
        }
        // Advance oncoming car proportional to driving speed
        const speedWeight = 0.02 + (currentSpeed / 120) * 0.015;
        return { ...prev, progress: prev.progress + speedWeight };
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isDriving, isPaused, currentSpeed]);

  // 3. Smooth steering wheel tracking based on heading changes
  useEffect(() => {
    if (prevHeadingRef.current !== undefined) {
      let diff = heading - prevHeadingRef.current;
      // Wrap-around logic for 360 degrees
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      // Amplify the turn slightly to make the steering wheel rotation distinct
      // If speed is zero, steering returns to center
      const targetAngle = currentSpeed > 0 ? Math.max(-65, Math.min(65, diff * 22)) : 0;

      let animId: number;
      const smoothSteering = () => {
        setSteeringAngle(current => {
          const delta = (targetAngle - current) * 0.12;
          if (Math.abs(delta) < 0.15) return targetAngle;
          return current + delta;
        });
        animId = requestAnimationFrame(smoothSteering);
      };

      animId = requestAnimationFrame(smoothSteering);
      return () => cancelAnimationFrame(animId);
    }
    prevHeadingRef.current = heading;
  }, [heading, currentSpeed]);

  // 4. Windshield Wipers Mechanical Sweep Loop
  useEffect(() => {
    if (!wipersOn) {
      // Return wipers slowly to base resting position (-50 degrees)
      if (wiperAngle !== -50) {
        const timer = setTimeout(() => {
          setWiperAngle(prev => {
            const next = prev - 4;
            return next < -50 ? -50 : next;
          });
        }, 16);
        return () => clearTimeout(timer);
      }
      return;
    }

    const wiperSpeed = 3.2; // sweep speed
    const timer = setTimeout(() => {
      setWiperAngle(prev => {
        let nextAngle = prev + wiperDirection * wiperSpeed;
        let nextDir = wiperDirection;
        
        if (nextAngle >= 50) {
          nextAngle = 50;
          nextDir = -1; // sweep back
        } else if (nextAngle <= -50) {
          nextAngle = -50;
          nextDir = 1; // sweep up
        }
        
        setWiperDirection(nextDir);
        return nextAngle;
      });
    }, 16);

    return () => clearTimeout(timer);
  }, [wipersOn, wiperAngle, wiperDirection]);

  // If rainy, automatically turn on wipers
  useEffect(() => {
    if (isRainy) {
      setWipersOn(true);
    }
  }, [isRainy]);

  // Calculate simulated Tachometer RPM
  // Idle RPM is 800. Revs peak and drop as vehicle accelerates (simulating gears)
  const getRPM = () => {
    if (!isDriving) return 0;
    if (isPaused || currentSpeed === 0) return 800; // Idle
    
    // Simulate a 5-speed transmission gear shifting
    let rpm = 800;
    if (currentSpeed < 20) {
      rpm = 800 + (currentSpeed / 20) * 2200; // Gear 1
    } else if (currentSpeed < 45) {
      rpm = 1200 + ((currentSpeed - 20) / 25) * 2400; // Gear 2
    } else if (currentSpeed < 75) {
      rpm = 1400 + ((currentSpeed - 45) / 30) * 2500; // Gear 3
    } else if (currentSpeed < 100) {
      rpm = 1600 + ((currentSpeed - 75) / 25) * 2200; // Gear 4
    } else {
      rpm = 1800 + ((currentSpeed - 100) / 60) * 2000; // Gear 5
    }
    return Math.min(6500, Math.round(rpm));
  };

  const rpm = getRPM();

  const getEventSpeedLimit = () => {
    if (!nearestEvent) return speedLimit;
    const match = nearestEvent.event.title.match(/\d+/);
    if (match) return parseInt(match[0], 10);
    const matchDesc = nearestEvent.event.description.match(/\d+/);
    if (matchDesc) return parseInt(matchDesc[0], 10);
    return speedLimit;
  };

  // Active theme classes based on color choice
  const getThemeColorClass = () => {
    switch (ambientColor) {
      case 'orange': return 'text-amber-500 border-amber-500/30';
      case 'purple': return 'text-purple-500 border-purple-500/30';
      case 'emerald': return 'text-emerald-400 border-emerald-400/30';
      default: return 'text-cyan-400 border-cyan-400/30';
    }
  };

  const getThemeBgClass = () => {
    switch (ambientColor) {
      case 'orange': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'purple': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'emerald': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default: return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    }
  };

  const getThemeTextClass = () => {
    switch (ambientColor) {
      case 'orange': return 'text-amber-400';
      case 'purple': return 'text-purple-400';
      case 'emerald': return 'text-emerald-400';
      default: return 'text-cyan-400';
    }
  };

  const getThemeGlowClass = () => {
    switch (ambientColor) {
      case 'orange': return 'shadow-[0_0_15px_rgba(245,158,11,0.45)]';
      case 'purple': return 'shadow-[0_0_15px_rgba(168,85,247,0.45)]';
      case 'emerald': return 'shadow-[0_0_15px_rgba(16,185,129,0.45)]';
      default: return 'shadow-[0_0_15px_rgba(6,182,212,0.45)]';
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-slate-950 font-sans overflow-hidden select-none">
      
      {/* 1. UPPER CABIN VIEWPORT: Windshield Windscreen Frame */}
      <div className="relative flex-1 w-full bg-slate-950 flex flex-col items-center justify-center border-b border-slate-900 overflow-hidden">
        
        {/* Dynamic Road & Sky Drawing Space (SVG based, scalable) */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <defs>
            {/* Ambient Sky Gradient */}
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              {isNight ? (
                <>
                  <stop offset="0%" stopColor="#020617" />
                  <stop offset="40%" stopColor="#0f172a" />
                  <stop offset="85%" stopColor="#1e1b4b" />
                  <stop offset="100%" stopColor="#2e1065" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="40%" stopColor="#38bdf8" />
                  <stop offset="80%" stopColor="#bae6fd" />
                  <stop offset="100%" stopColor="#f0f9ff" />
                </>
              )}
            </linearGradient>

            {/* Asphalt road shader */}
            <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
              {isNight ? (
                <>
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="15%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#57534e" />
                  <stop offset="15%" stopColor="#78716c" />
                  <stop offset="100%" stopColor="#44403c" />
                </>
              )}
            </linearGradient>

            {/* High beam projection filter */}
            <radialGradient id="headlightBeam" cx="50%" cy="100%" r="90%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="0.25" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            
            {/* Side barrier gradients */}
            <linearGradient id="barrierLeft" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="barrierRight" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* SKY LAYER */}
          <rect width="100%" height="45%" fill="url(#skyGrad)" />
          
          {/* Constellations / Neon Grid lines on the Sky for high-tech sci-fi vibe */}
          <g opacity={isNight ? 0.15 : 0.03}>
            <line x1="10%" y1="0" x2="12%" y2="45%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
            <line x1="30%" y1="0" x2="32%" y2="45%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
            <line x1="50%" y1="0" x2="50%" y2="45%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
            <line x1="70%" y1="0" x2="68%" y2="45%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
            <line x1="90%" y1="0" x2="88%" y2="45%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
            <line x1="0" y1="35%" x2="100%" y2="35%" stroke={isNight ? '#38bdf8' : '#0284c7'} strokeWidth="0.5" />
          </g>

          {/* Mountains outline on Horizon */}
          <path d="M-100,45% L50,30% L150,45% L250,25% L350,45% L450,28% L550,45% L750,32% L950,45% L1200,45%" 
                fill={isNight ? '#090d16' : '#64748b'} opacity={isNight ? 0.9 : 0.4} />

          {/* Headlights projection overlay if headlights are active */}
          {headlightsOn && isNight && (
            <path d="M 50% 45% L 0% 100% L 100% 100% Z" fill="url(#headlightBeam)" />
          )}

          {/* ASPHALT ROAD SURFACE (Perspective Trapezoid narrowing at Horizon: x=50%, y=45%) */}
          <path d="M 50% 45% L -100% 100% L 200% 100% Z" fill="url(#roadGrad)" />

          {/* Side concrete structures if elevated highway */}
          {isElevated && (
            <g opacity="0.85">
              {/* Elevated concrete left wall */}
              <polygon points="50%,45% 0%,45% -120%,100% -30%,100%" fill="url(#barrierLeft)" />
              {/* Elevated concrete right wall */}
              <polygon points="50%,45% 100%,45% 220%,100% 130%,100%" fill="url(#barrierRight)" />
              
              {/* Metal railings / Pillars on left */}
              <line x1="50%" y1="45%" x2="-30%" y2="100%" stroke="#64748b" strokeWidth="3" />
              <line x1="50%" y1="41%" x2="-30%" y2="92%" stroke="#334155" strokeWidth="1.5" />
              
              {/* Metal railings / Pillars on right */}
              <line x1="50%" y1="45%" x2="130%" y2="100%" stroke="#64748b" strokeWidth="3" />
              <line x1="50%" y1="41%" x2="130%" y2="92%" stroke="#334155" strokeWidth="1.5" />
            </g>
          )}

          {/* ROAD LANE LINES (Perspective scaling down toward center) */}
          <g>
            {/* Left Road Boundary Line */}
            <line x1="50%" y1="45%" x2="-30%" y2="100%" stroke="#e2e8f0" strokeWidth="2.5" opacity="0.6" />
            {/* Right Road Boundary Line */}
            <line x1="50%" y1="45%" x2="130%" y2="100%" stroke="#fef08a" strokeWidth="2.5" opacity="0.7" />

            {/* Middle Dashed Lane Divider - Animating using dash arrays */}
            {/* The offset varies dynamically with roadOffset state driven by speed */}
            <line 
              x1="50%" 
              y1="45%" 
              x2="50%" 
              y2="100%" 
              stroke="#ffffff" 
              strokeWidth="3.5" 
              strokeDasharray="14 18" 
              strokeDashoffset={-roadOffset}
              opacity="0.8" 
            />
          </g>

          {/* MOVING SIDE STREETLIGHTS (Creates a powerful 3D depth and sense of speed) */}
          {isDriving && !isPaused && currentSpeed > 0 && (
            <g opacity="0.5">
              {[0, 1, 2].map(i => {
                const progress = ((roadOffset + i * 33.3) % 100) / 100;
                const p = progress;
                // Scale factor: grows larger as progress approaches 1
                const scale = p * p * 30 + 1.5;
                
                // Left streetlight coordinates (moves far left as it approaches)
                const lx = 50 - p * 80;
                const ly = 45 + p * 55;
                const lHeight = scale * 1.8;
                
                // Right streetlight coordinates (moves far right as it approaches)
                const rx = 50 + p * 80;
                const ry = 45 + p * 55;
                const rHeight = scale * 1.8;
                
                return (
                  <g key={`light-${i}`} opacity={p < 0.12 ? p / 0.12 : 1 - p}>
                    {/* Left Light Pole & Lamp Head */}
                    <line x1={`${lx}%`} y1={`${ly}%`} x2={`${lx - scale * 0.4}%`} y2={`${ly - lHeight}%`} stroke="#334155" strokeWidth={scale * 0.08} />
                    <path 
                      d={`M ${lx - scale * 0.4} ${ly - lHeight} Q ${lx - scale * 0.8} ${ly - lHeight - scale * 0.2} ${lx - scale * 1.2} ${ly - lHeight + scale * 0.1}`} 
                      fill="none" 
                      stroke="#475569" 
                      strokeWidth={scale * 0.12} 
                      strokeLinecap="round" 
                    />
                    <circle cx={`${lx - scale * 1.2}%`} cy={`${ly - lHeight + scale * 0.1}%`} r={scale * 0.15} fill="#fef08a" />
                    {headlightsOn && (
                      <polygon points={`${lx - scale * 1.2},${ly - lHeight + scale * 0.1} ${lx - scale * 2},${ly} ${lx - scale * 0.2},${ly}`} fill="#fef08a" opacity="0.04" />
                    )}

                    {/* Right Light Pole & Lamp Head */}
                    <line x1={`${rx}%`} y1={`${ry}%`} x2={`${rx + scale * 0.4}%`} y2={`${ry - rHeight}%`} stroke="#334155" strokeWidth={scale * 0.08} />
                    <path 
                      d={`M ${rx + scale * 0.4} ${ry - rHeight} Q ${rx + scale * 0.8} ${ry - rHeight - scale * 0.2} ${rx + scale * 1.2} ${ry - rHeight + scale * 0.1}`} 
                      fill="none" 
                      stroke="#475569" 
                      strokeWidth={scale * 0.12} 
                      strokeLinecap="round" 
                    />
                    <circle cx={`${rx + scale * 1.2}%`} cy={`${ry - rHeight + scale * 0.1}%`} r={scale * 0.15} fill="#fef08a" />
                    {headlightsOn && (
                      <polygon points={`${rx + scale * 1.2},${ry - rHeight + scale * 0.1} ${rx + scale * 0.2},${ry} ${rx + scale * 2},${ry}`} fill="#fef08a" opacity="0.04" />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* ONCOMING CARS (Futuristic EV Silhouettes gliding down the oncoming lane) */}
          {isDriving && oncomingCarPos.progress > 0 && oncomingCarPos.progress < 0.98 && (
            <g>
              {(() => {
                const p = oncomingCarPos.progress;
                const scale = p * p * 38 + 2; 
                
                const horizonX = 50;
                const horizonY = 45;
                // Shift left along the opposite lane
                const targetX = horizonX - p * 60 - (oncomingCarPos.lane === 1 ? 12 : 25);
                const targetY = horizonY + p * 55;
                
                return (
                  <g opacity={Math.min(1, p * 3.5)}>
                    {/* Headlight beams projection */}
                    <circle cx={`${targetX}%`} cy={`${targetY}%`} r={scale * 1.2} fill="#fef08a" opacity="0.12" />
                    <circle cx={`${targetX - scale * 0.55}%`} cy={`${targetY + scale * 0.1}%`} r={scale * 0.35} fill="#fef08a" opacity="0.6" />
                    <circle cx={`${targetX + scale * 0.55}%`} cy={`${targetY + scale * 0.1}%`} r={scale * 0.35} fill="#fef08a" opacity="0.6" />

                    {/* Left and Right Wheels */}
                    <rect x={`${targetX - scale * 0.8}%`} y={`${targetY + scale * 0.2}%`} width={`${scale * 0.25}%`} height={`${scale * 0.4}%`} fill="#090d16" rx="1.5" />
                    <rect x={`${targetX + scale * 0.55}%`} y={`${targetY + scale * 0.2}%`} width={`${scale * 0.25}%`} height={`${scale * 0.4}%`} fill="#090d16" rx="1.5" />

                    {/* Bottom Ground Shadow */}
                    <ellipse cx={`${targetX}%`} cy={`${targetY + scale * 0.45}%`} rx={scale * 0.9} ry={scale * 0.15} fill="#020617" opacity="0.7" />

                    {/* Styled Car Bumper Lower Body */}
                    <rect 
                      x={`${targetX - scale * 0.8}%`} 
                      y={`${targetY - scale * 0.1}%`} 
                      width={`${scale * 1.6}%`} 
                      height={`${scale * 0.45}%`} 
                      rx="3" 
                      fill="#1e293b" 
                      stroke="#f87171" 
                      strokeWidth="1.2" 
                    />
                    
                    {/* Upper Cabin Windshield (Trapezoid) */}
                    <polygon 
                      points={`
                        ${targetX - scale * 0.5},${targetY - scale * 0.45} 
                        ${targetX + scale * 0.5},${targetY - scale * 0.45} 
                        ${targetX + scale * 0.72},${targetY - scale * 0.1} 
                        ${targetX - scale * 0.72},${targetY - scale * 0.1}
                      `} 
                      fill="#0f172a" 
                      stroke="#f87171" 
                      strokeWidth="1" 
                    />
                    
                    {/* Inner glowing HUD neon lines on oncoming car (cyberpunk EV vibe) */}
                    <line x1={`${targetX - scale * 0.65}%`} y1={`${targetY + scale * 0.02}%`} x2={`${targetX + scale * 0.65}%`} y2={`${targetY + scale * 0.02}%`} stroke="#f87171" strokeWidth="0.8" />
                    <circle cx={`${targetX}%`} cy={`${targetY + scale * 0.1}%`} r={scale * 0.08} fill="#f87171" />
                  </g>
                );
              })()}
            </g>
          )}

          {/* APPROACHING TRAFFIC ROAD EVENTS (Accidents, Construction, Speed Cameras, Flooding, Road Closures) */}
          {nearestEvent && nearestEvent.distance < 300 && (
            <g>
              {(() => {
                const p = Math.max(0, 1 - nearestEvent.distance / 300);
                const scale = p * p * 55 + 5;
                
                const horizonX = 50;
                const horizonY = 45;
                const targetX = horizonX + p * 42 + 4; // shifts to the right shoulder
                const targetY = horizonY + p * 50;
                
                return (
                  <g opacity={Math.min(1, p * 4.5)}>
                    {/* Metal support post */}
                    <line x1={`${targetX}%`} y1={`${targetY}%`} x2={`${targetX}%`} y2={`${targetY + scale * 1.3}%`} stroke="#475569" strokeWidth={scale * 0.12} />
                    
                    {/* Sign backing */}
                    {nearestEvent.event.type === 'speed_camera' ? (
                      // Speed Camera: Premium Blue panel with a red circle limit indicator
                      <g>
                        {/* Neon Back Glow */}
                        {isNight && <rect x={`${targetX - scale * 1.05}%`} y={`${targetY - scale * 1.35}%`} width={`${scale * 2.1}%`} height={`${scale * 2.3}%`} rx="5" fill="#3b82f6" opacity="0.25" />}
                        
                        <rect 
                          x={`${targetX - scale}%`} 
                          y={`${targetY - scale * 1.3}%`} 
                          width={`${scale * 2}%`} 
                          height={`${scale * 2.2}%`} 
                          rx="4" 
                          fill="#1e3a8a" 
                          stroke="#3b82f6" 
                          strokeWidth="2" 
                        />
                        {/* Speed Limit circular emblem */}
                        <circle cx={`${targetX}%`} cy={`${targetY - scale * 0.5}%`} r={scale * 0.5} fill="#ffffff" stroke="#ef4444" strokeWidth="2.5" />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.3}%`} fill="#000000" fontSize={scale * 0.6} textAnchor="middle" fontWeight="black" fontFamily="monospace">
                          {getEventSpeedLimit()}
                        </text>
                        
                        {/* Camera icon symbol */}
                        <rect x={`${targetX - scale * 0.4}%`} y={`${targetY + scale * 0.2}%`} width={`${scale * 0.8}%`} height={`${scale * 0.5}%`} rx="1.5" fill="#ffffff" />
                        <circle cx={`${targetX}%`} cy={`${targetY + scale * 0.45}%`} r={scale * 0.18} fill="#1e3a8a" />
                        <rect x={`${targetX - scale * 0.15}%`} y={`${targetY + scale * 0.08}%`} width={`${scale * 0.3}%`} height={`${scale * 0.15}%`} fill="#ffffff" />
                      </g>
                    ) : nearestEvent.event.type === 'road_closure' ? (
                      // Road Closure: Circular red sign with a white horizontal bar
                      <g>
                        {isNight && <circle cx={`${targetX}%`} cy={`${targetY - scale * 0.2}%`} r={scale * 1.25} fill="#ef4444" opacity="0.3" />}
                        <circle cx={`${targetX}%`} cy={`${targetY - scale * 0.2}%`} r={scale * 1.2} fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                        <rect x={`${targetX - scale * 0.8}%`} y={`${targetY - scale * 0.4}%`} width={`${scale * 1.6}%`} height={`${scale * 0.4}%`} fill="#ffffff" rx="1" />
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.6}%`} fill="#ffffff" fontSize={scale * 0.42} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          封路
                        </text>
                      </g>
                    ) : nearestEvent.event.type === 'flooding' ? (
                      // Flooding: Cyan Triangle warning sign
                      <g>
                        {isNight && <polygon 
                          points={`
                            ${targetX},${targetY - scale * 1.5} 
                            ${targetX + scale * 1.3},${targetY - scale * 0.25} 
                            ${targetX},${targetY + scale * 1.0} 
                            ${targetX - scale * 1.3},${targetY - scale * 0.25}
                          `}
                          fill="#06b6d4" opacity="0.3" 
                        />}
                        <polygon 
                          points={`
                            ${targetX},${targetY - scale * 1.4} 
                            ${targetX + scale * 1.2},${targetY - scale * 0.2} 
                            ${targetX},${targetY + scale} 
                            ${targetX - scale * 1.2},${targetY - scale * 0.2}
                          `} 
                          fill="#0891b2" 
                          stroke="#ffffff" 
                          strokeWidth="2" 
                        />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.05}%`} fill="#ffffff" fontSize={scale * 0.7} textAnchor="middle">
                          🌧️
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.35}%`} fill="#ffffff" fontSize={scale * 0.35} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          積水
                        </text>
                      </g>
                    ) : nearestEvent.event.type === 'landmark' ? (
                      // Landmark Sign: Indigo board with columns emblem
                      <g>
                        {isNight && <rect x={`${targetX - scale * 1.1}%`} y={`${targetY - scale * 1.35}%`} width={`${scale * 2.2}%`} height={`${scale * 2.3}%`} rx="5" fill="#6366f1" opacity="0.25" />}
                        <rect 
                          x={`${targetX - scale * 1.05}%`} 
                          y={`${targetY - scale * 1.3}%`} 
                          width={`${scale * 2.1}%`} 
                          height={`${scale * 2.2}%`} 
                          rx="4" 
                          fill="#312e81" 
                          stroke="#6366f1" 
                          strokeWidth="2" 
                        />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.4}%`} fill="#ffffff" fontSize={scale * 0.7} textAnchor="middle">
                          🏛️
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.3}%`} fill="#ffffff" fontSize={scale * 0.32} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          地標
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.75}%`} fill="#a5b4fc" fontSize={scale * 0.26} textAnchor="middle" fontWeight="medium" fontFamily="sans-serif">
                          {nearestEvent.event.title.length > 5 ? nearestEvent.event.title.slice(0, 4) + '..' : nearestEvent.event.title}
                        </text>
                      </g>
                    ) : nearestEvent.event.type === 'poi' ? (
                      // POI Store Sign: Emerald green shop sign
                      <g>
                        {isNight && <rect x={`${targetX - scale * 1.1}%`} y={`${targetY - scale * 1.35}%`} width={`${scale * 2.2}%`} height={`${scale * 2.3}%`} rx="5" fill="#10b981" opacity="0.25" />}
                        <rect 
                          x={`${targetX - scale * 1.05}%`} 
                          y={`${targetY - scale * 1.3}%`} 
                          width={`${scale * 2.1}%`} 
                          height={`${scale * 2.2}%`} 
                          rx="4" 
                          fill="#064e3b" 
                          stroke="#10b981" 
                          strokeWidth="2" 
                        />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.4}%`} fill="#ffffff" fontSize={scale * 0.7} textAnchor="middle">
                          {nearestEvent.event.title.includes('星巴克') || nearestEvent.event.title.toLowerCase().includes('starbucks') ? '☕' : '🏪'}
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.3}%`} fill="#ffffff" fontSize={scale * 0.32} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          商店
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.75}%`} fill="#34d399" fontSize={scale * 0.26} textAnchor="middle" fontWeight="medium" fontFamily="sans-serif">
                          {nearestEvent.event.title.length > 6 ? nearestEvent.event.title.slice(0, 5) + '..' : nearestEvent.event.title}
                        </text>
                      </g>
                    ) : nearestEvent.event.type === 'parking' ? (
                      // Parking lot sign: Standard blue P sign with height limit info
                      <g>
                        {isNight && <rect x={`${targetX - scale * 1.1}%`} y={`${targetY - scale * 1.35}%`} width={`${scale * 2.2}%`} height={`${scale * 2.3}%`} rx="5" fill="#3b82f6" opacity="0.25" />}
                        <rect 
                          x={`${targetX - scale * 1.05}%`} 
                          y={`${targetY - scale * 1.3}%`} 
                          width={`${scale * 2.1}%`} 
                          height={`${scale * 2.2}%`} 
                          rx="4" 
                          fill="#1e3a8a" 
                          stroke="#3b82f6" 
                          strokeWidth="2" 
                        />
                        <circle cx={`${targetX}%`} cy={`${targetY - scale * 0.3}%`} r={scale * 0.45} fill="#3b82f6" />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.1}%`} fill="#ffffff" fontSize={scale * 0.65} textAnchor="middle" fontWeight="black" fontFamily="sans-serif">
                          P
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.4}%`} fill="#ffffff" fontSize={scale * 0.3} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          停車場
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.8}%`} fill="#ef4444" fontSize={scale * 0.28} textAnchor="middle" fontWeight="black" fontFamily="monospace">
                          {nearestEvent.event.description.includes('2.0') ? '限高 2.0m' : nearestEvent.event.description.includes('2.1') ? '限高 2.1m' : '限高 2.2m'}
                        </text>
                      </g>
                    ) : (
                      // Accident or Construction: Orange/Red Triangle warning sign
                      <g>
                        {isNight && <polygon 
                          points={`
                            ${targetX},${targetY - scale * 1.5} 
                            ${targetX + scale * 1.3},${targetY - scale * 0.25} 
                            ${targetX},${targetY + scale * 1.0} 
                            ${targetX - scale * 1.3},${targetY - scale * 0.25}
                          `}
                          fill={nearestEvent.event.type === 'accident' ? '#ef4444' : '#f59e0b'} opacity="0.3" 
                        />}
                        <polygon 
                          points={`
                            ${targetX},${targetY - scale * 1.4} 
                            ${targetX + scale * 1.2},${targetY - scale * 0.2} 
                            ${targetX},${targetY + scale} 
                            ${targetX - scale * 1.2},${targetY - scale * 0.2}
                          `} 
                          fill={nearestEvent.event.type === 'accident' ? '#dc2626' : '#d97706'} 
                          stroke="#ffffff" 
                          strokeWidth="2" 
                        />
                        <text x={`${targetX}%`} y={`${targetY - scale * 0.08}%`} fill="#ffffff" fontSize={scale * 0.75} textAnchor="middle" fontWeight="black">
                          {nearestEvent.event.type === 'accident' ? '⚠️' : '🚧'}
                        </text>
                        <text x={`${targetX}%`} y={`${targetY + scale * 0.6}%`} fill="#ffffff" fontSize={scale * 0.32} textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
                          {nearestEvent.event.type === 'accident' ? '車禍' : '施工'}
                        </text>
                      </g>
                    )}

                    {/* Proximity Distance Tag */}

                    <rect 
                      x={`${targetX - scale * 1.2}%`} 
                      y={`${targetY + scale * 1.1}%`} 
                      width={`${scale * 2.4}%`} 
                      height={`${scale * 0.5}%`} 
                      rx="2" 
                      fill="#020617" 
                      stroke={nearestEvent.event.type === 'speed_camera' ? '#3b82f6' : '#ef4444'} 
                      strokeWidth="1" 
                    />
                    <text x={`${targetX}%`} y={`${targetY + scale * 1.45}%`} fill="#f87171" fontSize={scale * 0.38} textAnchor="middle" fontWeight="bold" fontFamily="monospace">
                      {Math.round(nearestEvent.distance)}m
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* WINDSHIELD WIPERS ARM DRAWINGS */}
          <g>
            {/* Wiper Pivot Left (at around x=35%, bottom of windscreen y=95%) */}
            {(() => {
              const rad = (wiperAngle * Math.PI) / 180;
              const wiperLength = 160;
              
              // Compute end coordinates of wiper line
              const x1 = "33%";
              const y1 = "94%";
              
              return (
                <g>
                  {/* Wiper shadow/arm */}
                  <line 
                    x1={x1} 
                    y1={y1} 
                    x2={`calc(33% + ${Math.sin(rad) * wiperLength}px)`} 
                    y2={`calc(94% - ${Math.cos(rad) * wiperLength}px)`} 
                    stroke="#1e293b" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                  />
                  {/* Blade element attached to arm */}
                  <line 
                    x1={`calc(33% + ${Math.sin(rad) * wiperLength * 0.5}px)`} 
                    y1={`calc(94% - ${Math.cos(rad) * wiperLength * 0.5}px)`} 
                    x2={`calc(33% + ${Math.sin(rad) * wiperLength}px)`} 
                    y2={`calc(94% - ${Math.cos(rad) * wiperLength}px)`} 
                    stroke="#000000" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                  />
                </g>
              );
            })()}

            {/* Wiper Pivot Right (at around x=65%, bottom of windscreen y=95%) */}
            {(() => {
              const rad = (wiperAngle * Math.PI) / 180;
              const wiperLength = 160;
              
              const x1 = "67%";
              const y1 = "94%";
              
              return (
                <g>
                  <line 
                    x1={x1} 
                    y1={y1} 
                    x2={`calc(67% + ${Math.sin(rad) * wiperLength}px)`} 
                    y2={`calc(94% - ${Math.cos(rad) * wiperLength}px)`} 
                    stroke="#1e293b" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                  />
                  <line 
                    x1={`calc(67% + ${Math.sin(rad) * wiperLength * 0.5}px)`} 
                    y1={`calc(94% - ${Math.cos(rad) * wiperLength * 0.5}px)`} 
                    x2={`calc(67% + ${Math.sin(rad) * wiperLength}px)`} 
                    y2={`calc(94% - ${Math.cos(rad) * wiperLength}px)`} 
                    stroke="#000000" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                  />
                </g>
              );
            })()}
          </g>
        </svg>

        {/* 2. RAIN/STREAKS OVERLAY ON GLASS */}
        {isRainy && (
          <div className="absolute inset-0 pointer-events-none z-[2] animate-pulse">
            {/* Overlay background for misty stormy sky look */}
            <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[0.5px]"></div>
            
            {/* Falling rain visual streams using absolute divs with varying delay */}
            <div className="absolute top-10 left-[15%] w-[1.5px] h-10 bg-sky-200/40 transform -rotate-12 animate-bounce" style={{ animationDuration: '0.8s' }}></div>
            <div className="absolute top-40 left-[45%] w-[1.5px] h-12 bg-sky-200/40 transform -rotate-12 animate-bounce" style={{ animationDuration: '0.6s', animationDelay: '0.2s' }}></div>
            <div className="absolute top-20 left-[75%] w-[1px] h-8 bg-sky-200/40 transform -rotate-12 animate-bounce" style={{ animationDuration: '0.9s', animationDelay: '0.4s' }}></div>
            <div className="absolute top-60 left-[28%] w-[1px] h-11 bg-sky-200/30 transform -rotate-12 animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.1s' }}></div>
            <div className="absolute top-52 left-[88%] w-[1.5px] h-9 bg-sky-200/40 transform -rotate-12 animate-bounce" style={{ animationDuration: '0.75s', animationDelay: '0.3s' }}></div>
            
            {/* Splash drops rest on screen */}
            <div className="absolute top-1/4 left-[20%] w-1.5 h-1.5 bg-blue-400/40 rounded-full"></div>
            <div className="absolute top-2/3 left-[12%] w-2 h-2 bg-blue-400/30 rounded-full blur-[0.5px]"></div>
            <div className="absolute top-1/2 left-[55%] w-1 h-1 bg-blue-300/50 rounded-full"></div>
            <div className="absolute top-1/3 left-[82%] w-2.5 h-2.5 bg-blue-400/40 rounded-full blur-[0.5px]"></div>
            <div className="absolute top-3/4 left-[70%] w-1.5 h-1.5 bg-blue-300/40 rounded-full"></div>
          </div>
        )}

        {/* 3. HEAD-UP DISPLAY (HUD) GLASS OVERLAY PROJECTED ON LOWER WINDSHIELD */}
        <div className={`absolute bottom-6 left-6 md:left-10 z-[5] bg-slate-950/80 backdrop-blur-md rounded-lg border px-3.5 py-3 w-56 md:w-64 select-none ${getThemeColorClass()} ${getThemeGlowClass()} animate-fade-in transition-all duration-300`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 font-mono text-[9px] font-bold tracking-widest text-slate-500 uppercase">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-sky-400" />
              HUD NAVIGATION
            </span>
            <span className="animate-pulse">ONLINE</span>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-slate-500 text-[8px] font-mono block uppercase">CURRENT ROAD 當前路段</span>
              <span className="text-sm font-bold text-white tracking-tight truncate block">
                {streetName || "定位中..."}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[8px] font-mono block uppercase">GUIDANCE SYSTEM 導航指引</span>
              <p className="text-xs text-slate-200 font-medium leading-relaxed">
                {instruction || "自動駕駛就緒，正在等待指令。"}
              </p>
            </div>

            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 flex items-center gap-1.5 shrink-0">
                <span className="w-5 h-5 rounded-full bg-red-600 border border-white text-white flex items-center justify-center font-bold text-[10px] font-sans">
                  {speedLimit}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">LIMIT</span>
              </div>

              <div className="text-right">
                <span className="text-[8px] text-slate-500 font-mono block uppercase">COMPASS</span>
                <span className="text-[10px] font-bold text-sky-400 font-mono">
                  {Math.round(heading)}° {heading > 337 || heading <= 22 ? '北 (N)' : heading > 22 && heading <= 67 ? '東北 (NE)' : heading > 67 && heading <= 112 ? '東 (E)' : heading > 112 && heading <= 157 ? '東南 (SE)' : heading > 157 && heading <= 202 ? '南 (S)' : heading > 202 && heading <= 247 ? '西南 (SW)' : heading > 247 && heading <= 292 ? '西 (W)' : '西北 (NW)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Proximity Flash alert overlay inside windshield (for Waze hazards) */}
        {nearestEvent && nearestEvent.distance < 180 && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-80 max-w-sm bg-red-950/95 border border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.5)] px-4 py-2.5 rounded-lg flex items-center gap-3 animate-pulse">
            <div className="bg-red-900/60 p-2 rounded-lg text-red-400 border border-red-700/60 shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0 font-sans text-left">
              <span className="text-[8px] text-red-400 font-mono font-bold tracking-widest block uppercase">DANGER ZONE 鄰近障礙警示</span>
              <p className="text-xs font-bold text-white truncate">{nearestEvent.event.title}</p>
              <p className="text-[9px] text-red-300 font-mono">距離您僅剩 {Math.round(nearestEvent.distance)} 公尺 - 請減速！</p>
            </div>
          </div>
        )}

        {/* Horn alert ring effect */}
        {hornActive && (
          <div className="absolute inset-0 bg-sky-500/5 pointer-events-none z-[6] border-8 border-sky-400/35 animate-ping flex items-center justify-center">
            <span className="bg-slate-900/90 text-sky-400 text-sm font-bold font-mono py-2 px-5 rounded-full border border-sky-400 tracking-wider">
              📣 BEEP!! (喇叭響起)
            </span>
          </div>
        )}
      </div>

      {/* 4. LOWER CABIN VIEWPORT: Futuristic Vehicle Dashboard Console */}
      <div className="h-44 md:h-48 w-full bg-slate-900 border-t border-slate-800 px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 relative z-20 shadow-[0_-15px_30px_rgba(0,0,0,0.6)] shrink-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]">
        
        {/* DASH PANEL LEFT: Interactive EV Cabin Controls */}
        <div className="flex flex-row md:flex-col justify-between md:justify-center gap-2.5 grow md:grow-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-slate-400 font-bold tracking-wider uppercase">CABIN PRESET (中控設定)</span>
          </div>
          
          <div className="grid grid-cols-5 gap-1.5 md:gap-2">
            {/* Weather toggle button */}
            <button
              onClick={() => setIsRainy(!isRainy)}
              className={`p-1.5 md:p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all text-[9px] font-bold ${
                isRainy 
                  ? 'bg-blue-950/60 text-blue-400 border-blue-600/60 shadow-[0_0_8px_rgba(59,130,246,0.35)]' 
                  : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
              title="模擬下雨天氣"
            >
              {isRainy ? <CloudRain className="w-3.5 h-3.5 animate-pulse" /> : <Sun className="w-3.5 h-3.5" />}
              <span>{isRainy ? '下雨' : '晴天'}</span>
            </button>

            {/* Wipers control button */}
            <button
              onClick={() => setWipersOn(!wipersOn)}
              className={`p-1.5 md:p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all text-[9px] font-bold ${
                wipersOn 
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-600/60 shadow-[0_0_8px_rgba(16,185,129,0.35)]' 
                  : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
              title="手動雨刷開關"
            >
              <Wind className={`w-3.5 h-3.5 ${wipersOn ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
              <span>雨刷 {wipersOn ? '開' : '關'}</span>
            </button>

            {/* Headlights toggle button */}
            <button
              onClick={() => setHeadlightsOn(!headlightsOn)}
              className={`p-1.5 md:p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all text-[9px] font-bold ${
                headlightsOn 
                  ? 'bg-yellow-950/60 text-yellow-400 border-yellow-600/60 shadow-[0_0_8px_rgba(234,179,8,0.35)]' 
                  : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
              title="行車大燈開關"
            >
              <Lightbulb className={`w-3.5 h-3.5 ${headlightsOn ? 'text-yellow-300' : ''}`} />
              <span>大燈 {headlightsOn ? '開' : '關'}</span>
            </button>

            {/* Ambient Ambient LED Ring Toggle */}
            <button
              onClick={() => {
                const colors: ('cyan' | 'orange' | 'purple' | 'emerald')[] = ['cyan', 'orange', 'purple', 'emerald'];
                const nextIdx = (colors.indexOf(ambientColor) + 1) % colors.length;
                setAmbientColor(colors[nextIdx]);
              }}
              className="p-1.5 md:p-2 bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800 rounded flex flex-col items-center justify-center gap-1 transition-all text-[9px] font-bold"
              title="切換內裝氛圍燈顏色"
            >
              <span className={`w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[7px] font-black ${getThemeBgClass()}`}>LED</span>
              <span className="capitalize">{ambientColor}</span>
            </button>

            {/* Day / Night toggle button */}
            <button
              onClick={() => setIsNight(!isNight)}
              className={`p-1.5 md:p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all text-[9px] font-bold ${
                !isNight 
                  ? 'bg-amber-950/60 text-amber-400 border-amber-600/60 shadow-[0_0_8px_rgba(245,158,11,0.35)]' 
                  : 'bg-indigo-950/60 text-indigo-400 border-indigo-600/60 shadow-[0_0_8px_rgba(99,102,241,0.35)]'
              }`}
              title="切換白天或晚上模式"
            >
              {isNight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              <span>{isNight ? '晚上' : '白天'}</span>
            </button>
          </div>
        </div>

        {/* DASH PANEL CENTER: High-Performance Steering Wheel & Horn */}
        <div className="flex items-center justify-center grow py-1 relative">
          
          {/* Main Steering Wheel Container (Rotates dynamically by steeringAngle) */}
          <div 
            id="vehicle-steering-wheel"
            onClick={triggerHorn}
            className="relative w-28 h-28 md:w-32 md:h-32 rounded-full border-[7px] border-slate-800 bg-slate-950 flex items-center justify-center transition-all duration-75 cursor-pointer hover:border-slate-700 active:scale-95 group shadow-2xl"
            style={{ transform: `rotate(${steeringAngle}deg)` }}
            title="點擊方向盤喇叭發聲"
          >
            {/* Leather textured outer circle ring */}
            <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-900 opacity-80 pointer-events-none"></div>

            {/* Inner skeleton spokes */}
            <div className="absolute w-[80%] h-1.5 bg-slate-800 pointer-events-none"></div>
            <div className="absolute h-[80%] w-1.5 bg-slate-800 pointer-events-none top-[10%]"></div>
            
            {/* Steering center console plate */}
            <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-900 border-2 border-slate-700 flex flex-col items-center justify-center shadow-lg z-10">
              <span className="text-[7px] font-mono text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">MOTC</span>
              
              {/* Dynamic current transmission gear overlay */}
              <span className="text-sm font-black font-mono text-white leading-none">
                {!isDriving ? 'P' : isPaused ? 'N' : currentSpeed > 100 ? 'D5' : currentSpeed > 75 ? 'D4' : currentSpeed > 45 ? 'D3' : currentSpeed > 20 ? 'D2' : currentSpeed > 0 ? 'D1' : 'D'}
              </span>
              
              <span className="text-[6px] font-mono text-sky-400 font-black mt-1 leading-none tracking-tighter uppercase">HORN 📯</span>
            </div>

            {/* Steering wheel glow edge */}
            <div className={`absolute inset-0 rounded-full border-2 border-transparent transition-colors duration-300 pointer-events-none ${
              ambientColor === 'orange' ? 'group-hover:border-amber-500/20' : 
              ambientColor === 'purple' ? 'group-hover:border-purple-500/20' : 
              ambientColor === 'emerald' ? 'group-hover:border-emerald-500/20' : 
              'group-hover:border-cyan-500/20'
            }`}></div>
          </div>

          {/* Prompt banner right below steering */}
          <div className="absolute -bottom-2.5 text-[8px] font-mono text-slate-500 uppercase tracking-widest text-center">
            STEERING WHEEL (點擊鳴笛喇叭)
          </div>
        </div>

        {/* DASH PANEL RIGHT: Dual Digital Speed & Rev (Tachometer) Dials */}
        <div className="flex items-center justify-around gap-6 grow md:grow-0">
          
          {/* TACHOMETER (RPM Dial 0 to 8k revs) */}
          <div className="flex flex-col items-center justify-center relative">
            <div className="relative w-18 h-18 md:w-20 md:h-20 rounded-full border border-slate-800 bg-slate-950 flex flex-col items-center justify-center shadow-lg">
              {/* Scale Tick marks mock */}
              <div className="absolute inset-1.5 rounded-full border border-dashed border-slate-900 opacity-60"></div>
              
              <span className="text-xs font-black font-mono text-slate-200">{Math.round(rpm / 100) / 10}</span>
              <span className="text-[7px] font-mono text-slate-500 font-bold uppercase">x1000 RPM</span>

              {/* RPM Needle pointer */}
              <div 
                className="absolute inset-0 rounded-full transition-transform duration-100 flex items-center justify-center pointer-events-none"
                style={{ transform: `rotate(${(rpm / 6500) * 180 - 90}deg)` }}
              >
                <div className="h-1 w-7 bg-red-500 ml-7 rounded-full shadow-[0_0_5px_#f43f5e]"></div>
              </div>
            </div>
            <span className="text-[9px] font-mono text-slate-400 font-bold tracking-wider uppercase mt-1">ENGINE REV</span>
          </div>

          {/* SPEEDOMETER Dial (0 to 140 km/h) */}
          <div className="flex flex-col items-center justify-center relative">
            <div className="relative w-18 h-18 md:w-20 md:h-20 rounded-full border border-slate-800 bg-slate-950 flex flex-col items-center justify-center shadow-lg">
              <div className="absolute inset-1.5 rounded-full border border-dashed border-slate-900 opacity-60"></div>
              
              {/* Dynamic current speed readout inside cluster */}
              <span className={`text-lg font-black font-mono leading-none tracking-tight ${
                currentSpeed > speedLimit ? 'text-red-500 animate-pulse' : 'text-white'
              }`}>
                {currentSpeed}
              </span>
              <span className="text-[7px] font-mono text-slate-500 font-bold uppercase mt-0.5">KM / H</span>

              {/* SPEED Dial Needle */}
              <div 
                className="absolute inset-0 rounded-full transition-transform duration-150 flex items-center justify-center pointer-events-none"
                style={{ transform: `rotate(${(currentSpeed / 120) * 180 - 90}deg)` }}
              >
                <div className={`h-1 w-7 ml-7 rounded-full shadow-lg ${
                  currentSpeed > speedLimit ? 'bg-red-500 shadow-red-500/80' : 'bg-sky-400 shadow-sky-400/80'
                }`}></div>
              </div>
            </div>
            <span className="text-[9px] font-mono text-slate-400 font-bold tracking-wider uppercase mt-1">SPEEDOMETER</span>
          </div>
        </div>

      </div>

    </div>
  );
}
