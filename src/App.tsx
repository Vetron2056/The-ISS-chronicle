import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { IssViewport } from './components/IssViewport';
import {
  CameraPresetId,
  MAX_YEAR,
  MIN_YEAR,
  getActiveMilestone,
  getTelemetryAtYear,
} from './data/issTimeline';
import { OrbitalAudioEngine } from './three/audioEngine';

function getYearRate(year: number): number {
  if (year < 2001.6) return 0.42;
  if (year < 2010.5) return 1.05;
  if (year < 2028.0) return 2.4;
  if (year < 2031.0) return 0.65;
  return 0.09;
}

export default function App() {
  const [year, setYear] = useState<number>(MIN_YEAR);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('orbital');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);

  const audioRef = useRef<OrbitalAudioEngine | null>(null);
  const lastMilestoneIdRef = useRef<string>('zarya');

  useEffect(() => {
    audioRef.current = new OrbitalAudioEngine();
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  const telemetry = useMemo(() => getTelemetryAtYear(year), [year]);
  const activeMilestone = useMemo(() => getActiveMilestone(year), [year]);

  // Play milestone chime & modulate re-entry rumble when crossing historical milestones
  useEffect(() => {
    if (activeMilestone.id !== lastMilestoneIdRef.current) {
      lastMilestoneIdRef.current = activeMilestone.id;
      if (isPlaying) {
        audioRef.current?.playMilestoneBeep(activeMilestone.id === 'end_of_mission');
      }
    }
    const reentryAudio =
      year >= 2031.12 && year < 2031.42
        ? Math.sin(((year - 2031.12) / 0.3) * Math.PI)
        : 0;
    audioRef.current?.setReentryIntensity(reentryAudio);
  }, [activeMilestone.id, isPlaying, year]);

  // Chronological playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      setYear((prev) => {
        const next = prev + getYearRate(prev) * speed * dt;
        if (next >= MAX_YEAR) {
          setIsPlaying(false);
          return MAX_YEAR;
        }
        return next;
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed]);

  // Spacebar play/pause shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setIsPlaying((p) => {
          if (!p && year >= MAX_YEAR - 0.02) {
            setYear(MIN_YEAR);
          }
          return !p;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [year]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && year >= MAX_YEAR - 0.02) {
        setYear(MIN_YEAR);
      }
      return !prev;
    });
  }, [year]);

  const handleReset = useCallback(() => {
    setYear(MIN_YEAR);
    setIsPlaying(true);
    setSelectedModuleId(null);
    setCameraPreset('orbital');
  }, []);

  const handleSeekYear = useCallback((nextYear: number) => {
    setYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, nextYear)));
  }, []);

  const handleToggleAudio = useCallback(() => {
    if (!audioRef.current) return;
    const next = audioRef.current.toggle();
    setAudioEnabled(next);
  }, []);

  const handleCenterModule = useCallback((moduleId: string) => {
    setSelectedModuleId(moduleId);
    setFocusTrigger((c) => c + 1);
  }, []);

  return (
    <main className="relative w-full h-full bg-[#060911] overflow-hidden">
      <IssViewport
        year={year}
        cameraPreset={cameraPreset}
        selectedModuleId={selectedModuleId}
        focusTrigger={focusTrigger}
        onSelectModule={setSelectedModuleId}
        onHoverModule={setHoveredModuleId}
      />

      <HudOverlay
        year={year}
        isPlaying={isPlaying}
        speed={speed}
        cameraPreset={cameraPreset}
        audioEnabled={audioEnabled}
        telemetry={telemetry}
        activeMilestone={activeMilestone}
        selectedModuleId={selectedModuleId}
        hoveredModuleId={hoveredModuleId}
        onTogglePlay={handleTogglePlay}
        onReset={handleReset}
        onSeekYear={handleSeekYear}
        onChangeSpeed={setSpeed}
        onSelectCameraPreset={setCameraPreset}
        onToggleAudio={handleToggleAudio}
        onSelectModule={setSelectedModuleId}
        onCenterModule={handleCenterModule}
      />
    </main>
  );
}
