import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Info,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CameraPresetId,
  ISS_MODULES,
  MAX_YEAR,
  MIN_YEAR,
  TIMELINE_MILESTONES,
  TelemetrySnapshot,
  TimelineMilestone,
} from '../data/issTimeline';
import { DeorbitAltitudeChart } from './DeorbitAltitudeChart';

interface HudOverlayProps {
  year: number;
  isPlaying: boolean;
  speed: number;
  cameraPreset: CameraPresetId;
  audioEnabled: boolean;
  telemetry: TelemetrySnapshot;
  activeMilestone: TimelineMilestone;
  selectedModuleId: string | null;
  hoveredModuleId: string | null;
  onTogglePlay: () => void;
  onReset: () => void;
  onSeekYear: (year: number) => void;
  onChangeSpeed: (speed: number) => void;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  onToggleAudio: () => void;
  onSelectModule: (id: string | null) => void;
  onCenterModule: (id: string) => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'orbital', label: 'Orbital Frame' },
  { id: 'truss', label: 'Top Truss' },
  { id: 'cupola', label: 'Cupola & Lab' },
  { id: 'deorbit', label: 'Deorbit Chase' },
];

export function HudOverlay({
  year,
  isPlaying,
  speed,
  cameraPreset,
  audioEnabled,
  telemetry,
  activeMilestone,
  selectedModuleId,
  hoveredModuleId,
  onTogglePlay,
  onReset,
  onSeekYear,
  onChangeSpeed,
  onSelectCameraPreset,
  onToggleAudio,
  onSelectModule,
  onCenterModule,
}: HudOverlayProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(true);
  const [imgErrorUrl, setImgErrorUrl] = useState<string | null>(null);

  const selectedModule = selectedModuleId ? ISS_MODULES[selectedModuleId] : null;
  const hoveredModule = hoveredModuleId ? ISS_MODULES[hoveredModuleId] : null;

  const progressPct = ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const isEndOfMission = telemetry.deorbitPhase === 'ended';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 md:p-5">
      {/* TOP BAR: Clean Telemetry Header + Compact Corner Mission Brief */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Chronological Clock & Deorbit Altitude Decay D3 Chart */}
        <div className="flex flex-col items-start gap-2.5 max-w-md">
          <div className="pointer-events-auto bg-[#0a0f1a]/90 border border-slate-700/40 rounded-lg px-4 py-3 w-full">
            <div className="flex items-center gap-3">
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-white whitespace-nowrap">
                International Space Station
              </h1>
              <span className="text-xs text-slate-400 whitespace-nowrap">1998 – 2031</span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              <span className="font-mono-tabular text-sky-400 font-medium text-sm">
                {telemetry.dateFormatted}
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-300">{telemetry.era}</span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span
                className={
                  telemetry.crewed
                    ? 'text-emerald-400 font-medium'
                    : telemetry.deorbitPhase === 'reentry'
                    ? 'text-amber-400 font-medium'
                    : 'text-slate-400'
                }
              >
                {telemetry.crewLabel}
              </span>
            </div>
          </div>

          <DeorbitAltitudeChart currentYear={year} onSeekYear={onSeekYear} />
        </div>

        {/* Top-Right: Compact Telemetry & Archival Milestone Card (Never overlaps center) */}
        <div className="pointer-events-auto flex flex-col items-end gap-2 max-w-[330px] w-full">
          <div className="w-full bg-[#0a0f1a]/90 border border-slate-700/40 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2 min-w-0">
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {activeMilestone.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBriefExpanded((v) => !v)}
                className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
                aria-label={briefExpanded ? 'Collapse mission brief' : 'Expand mission brief'}
              >
                {briefExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>

            {briefExpanded && (
              <div className="p-3.5 space-y-3">
                {/* Tabular Telemetry Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400">Station Mass</div>
                    <div className="font-mono-tabular text-sm font-semibold text-white">
                      {telemetry.massTons.toFixed(1)}{' '}
                      <span className="text-[11px] font-normal text-slate-400">t</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Pressurized Vol.</div>
                    <div className="font-mono-tabular text-sm font-semibold text-white">
                      {telemetry.pressurizedVolumeM3}{' '}
                      <span className="text-[11px] font-normal text-slate-400">m³</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Truss Span</div>
                    <div className="font-mono-tabular text-sm font-semibold text-white">
                      {telemetry.spanMeters.toFixed(1)}{' '}
                      <span className="text-[11px] font-normal text-slate-400">m</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Orbital Altitude</div>
                    <div
                      className={`font-mono-tabular text-sm font-semibold ${
                        telemetry.deorbitPhase === 'reentry'
                          ? 'text-amber-400'
                          : telemetry.deorbitPhase === 'lowering'
                          ? 'text-sky-300'
                          : 'text-white'
                      }`}
                    >
                      {telemetry.altitudeKm}{' '}
                      <span className="text-[11px] font-normal text-slate-400">km</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-300 border-t border-slate-800/80 pt-2.5">
                  {activeMilestone.summary}
                </p>

                {/* Archival Milestone Photograph */}
                {activeMilestone.photoUrl && (
                  <div className="relative rounded-md overflow-hidden border border-slate-700/50 bg-slate-900">
                    {imgErrorUrl !== activeMilestone.photoUrl ? (
                      <img
                        src={activeMilestone.photoUrl}
                        alt={activeMilestone.photoCaption || activeMilestone.title}
                        referrerPolicy="no-referrer"
                        onError={() => setImgErrorUrl(activeMilestone.photoUrl ?? null)}
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-slate-900 text-xs text-slate-400 px-3 text-center">
                        {activeMilestone.photoCaption || activeMilestone.title}
                      </div>
                    )}
                    <div className="bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 py-2 -mt-12 relative">
                      <p className="text-[11px] text-slate-200 leading-snug">
                        {activeMilestone.photoCaption}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Credit: NASA / ESA / JAXA / CSA
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>{activeMilestone.agencyCredit}</span>
                  <span>Click any 3D module to inspect</span>
                </div>
              </div>
            )}
          </div>

          {/* Selected Module Detail Card (Docked cleanly beneath top-right card, never covering center) */}
          {selectedModule && (
            <div className="w-full bg-[#0a0f1a]/95 border border-sky-500/40 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-sky-400">
                    {selectedModule.designation}
                  </div>
                  <h2 className="text-sm font-semibold text-white">{selectedModule.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectModule(null)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                  aria-label="Close module details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-y border-slate-800/80 py-2">
                <div>
                  <div className="text-[11px] text-slate-400">Agency</div>
                  <div className="text-slate-200 font-medium">{selectedModule.agency}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Launch Date</div>
                  <div className="text-slate-200 font-medium">{selectedModule.launchDate}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Launch Vehicle</div>
                  <div className="text-slate-300">{selectedModule.vehicle}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Specs</div>
                  <div className="font-mono-tabular text-slate-300">
                    {selectedModule.massTons} t · {selectedModule.dimensions}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{selectedModule.role}</p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onCenterModule(selectedModule.id)}
                  className="px-3 py-1.5 text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/35 rounded-md transition-colors whitespace-nowrap"
                >
                  Focus Camera
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER: Poignant End of Mission 2031 State OR Subtle Hover Label */}
      <div className="flex items-center justify-center pointer-events-none">
        {isEndOfMission ? (
          <div className="pointer-events-auto text-center max-w-lg px-6 py-5 bg-[#060911]/75 border border-slate-700/35 rounded-lg">
            <p className="text-xs tracking-widest uppercase text-slate-400 font-mono-tabular">
              South Pacific Oceanic Uninhabited Area · Point Nemo
            </p>
            <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-white">
              End of Mission: 2031
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              1998 – 2031 · More than three decades of continuous international science and human
              collaboration in low Earth orbit.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Replay Chronicle (1998–2031)
            </button>
          </div>
        ) : (
          hoveredModule &&
          hoveredModule.id !== selectedModuleId && (
            <div className="bg-[#0a0f1a]/90 border border-slate-700/50 rounded-md px-3 py-1.5 text-xs text-slate-200">
              <span className="font-semibold text-white">{hoveredModule.name}</span>
              <span className="text-slate-500 mx-1.5">·</span>
              <span className="text-sky-400">{hoveredModule.agency}</span>
              <span className="text-slate-500 mx-1.5">·</span>
              <span className="text-slate-400">{hoveredModule.launchDate}</span>
            </div>
          )
        )}
      </div>

      {/* BOTTOM: Unified Collapsible Control Dock */}
      <div className="flex flex-col items-center w-full">
        {/* Collapse Toggle Tab */}
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-[#0a0f1a]/90 border border-b-0 border-slate-700/40 rounded-t-md transition-colors"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show Timeline
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Hide Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[940px] bg-[#0a0f1a]/92 border border-slate-700/45 rounded-lg px-4 py-3 space-y-2.5">
            {/* Milestone Tick Strip + Range Slider */}
            <div className="space-y-1.5">
              <div className="relative h-4 flex items-center">
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-sky-500 rounded-l pointer-events-none"
                  style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                />
                <input
                  type="range"
                  min={MIN_YEAR}
                  max={MAX_YEAR}
                  step={0.01}
                  value={year}
                  onChange={(e) => onSeekYear(parseFloat(e.target.value))}
                  aria-label="ISS Lifespan Timeline"
                  className="iss-scrubber relative z-10 w-full"
                />
              </div>

              {/* Milestone Quick-Jump Buttons */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5">
                {TIMELINE_MILESTONES.filter((_, i) =>
                  [0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 12].includes(i)
                ).map((m) => {
                  const isActive = activeMilestone.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSeekYear(m.year)}
                      className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 font-mono-tabular ${
                        isActive
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                      }`}
                      title={m.title}
                    >
                      {Math.floor(m.year)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Playback, Speed, Camera Presets & Audio Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
              {/* Left: Play/Pause + Reset + Speed */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>

                <button
                  type="button"
                  onClick={onReset}
                  className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-md transition-colors"
                  aria-label="Reset timeline to 1998"
                  title="Reset to Nov 1998"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-800 rounded-md p-0.5">
                  {[1, 2, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onChangeSpeed(s)}
                      className={`px-2 py-1 text-[11px] font-mono-tabular rounded transition-colors ${
                        speed === s
                          ? 'bg-slate-700 text-white font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Center: Camera Views */}
              <div className="flex items-center gap-1 overflow-x-auto">
                <Camera className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                {CAMERA_OPTIONS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onSelectCameraPreset(cam.id)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      cameraPreset === cam.id
                        ? 'bg-slate-700/90 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              {/* Right: Audio & Credit */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onToggleAudio}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    audioEnabled
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  aria-label={audioEnabled ? 'Mute ambient audio' : 'Enable ambient audio'}
                >
                  {audioEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  Audio
                </button>
                <span className="hidden sm:inline text-[11px] text-slate-500 whitespace-nowrap">
                  NASA/ESA/JAXA/CSA
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
