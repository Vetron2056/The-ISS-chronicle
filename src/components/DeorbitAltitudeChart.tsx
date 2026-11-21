import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { formatYearToDate, getTelemetryAtYear } from '../data/issTimeline';

interface DeorbitAltitudeChartProps {
  currentYear: number;
  onSeekYear: (year: number) => void;
}

interface AltitudePoint {
  year: number;
  altitudeKm: number;
  phase: 'lowering' | 'reentry' | 'ended';
}

const DEORBIT_START = 2028.0;
const DEORBIT_END = 2031.5;
const BURN_START = 2031.1;
const ENTRY_INTERFACE_KM = 120;

const CHART_WIDTH = 312;
const CHART_HEIGHT = 152;
const MARGIN = { top: 12, right: 12, bottom: 24, left: 36 };
const INNER_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

export function DeorbitAltitudeChart({
  currentYear,
  onSeekYear,
}: DeorbitAltitudeChartProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoverPoint, setHoverPoint] = useState<AltitudePoint | null>(null);

  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);

  // Sample exact telemetry curve from 2028.0 to 2031.5
  const data = useMemo<AltitudePoint[]>(() => {
    const pts: AltitudePoint[] = [];
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const y = DEORBIT_START + (i / steps) * (DEORBIT_END - DEORBIT_START);
      const snap = getTelemetryAtYear(y);
      pts.push({
        year: y,
        altitudeKm: snap.altitudeKm,
        phase:
          y < BURN_START
            ? 'lowering'
            : snap.deorbitPhase === 'ended'
            ? 'ended'
            : 'reentry',
      });
    }
    return pts;
  }, []);

  const xScale = useMemo(
    () => d3.scaleLinear().domain([DEORBIT_START, DEORBIT_END]).range([0, INNER_W]),
    []
  );

  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, 440]).range([INNER_H, 0]),
    []
  );

  // Render D3 axes cleanly whenever expanded
  useEffect(() => {
    if (!expanded) return;
    if (xAxisRef.current) {
      const xAxis = d3
        .axisBottom(xScale)
        .tickValues([2028, 2029, 2030, 2031, 2031.5])
        .tickFormat((d) => {
          const v = Number(d);
          return v === 2031.5 ? "'31.5" : String(v);
        })
        .tickSize(3);
      const sel = d3.select(xAxisRef.current);
      sel.call(xAxis);
      sel.select('.domain').attr('stroke', 'rgba(148, 163, 184, 0.25)');
      sel.selectAll('.tick line').attr('stroke', 'rgba(148, 163, 184, 0.25)');
      sel
        .selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .style('font-family', 'var(--font-mono)')
        .style('font-size', '10px');
    }

    if (yAxisRef.current) {
      const yAxis = d3
        .axisLeft(yScale)
        .tickValues([0, 120, 250, 400])
        .tickFormat((d) => `${d}`)
        .tickSize(3);
      const sel = d3.select(yAxisRef.current);
      sel.call(yAxis);
      sel.select('.domain').attr('stroke', 'rgba(148, 163, 184, 0.25)');
      sel.selectAll('.tick line').attr('stroke', 'rgba(148, 163, 184, 0.25)');
      sel
        .selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .style('font-family', 'var(--font-mono)')
        .style('font-size', '10px');
    }
  }, [expanded, xScale, yScale]);

  const lineGenerator = useMemo(
    () =>
      d3
        .line<AltitudePoint>()
        .x((d) => xScale(d.year))
        .y((d) => yScale(d.altitudeKm))
        .curve(d3.curveMonotoneX),
    [xScale, yScale]
  );

  const areaGenerator = useMemo(
    () =>
      d3
        .area<AltitudePoint>()
        .x((d) => xScale(d.year))
        .y0(INNER_H)
        .y1((d) => yScale(d.altitudeKm))
        .curve(d3.curveMonotoneX),
    [xScale, yScale]
  );

  const fullPathD = useMemo(() => lineGenerator(data) ?? '', [lineGenerator, data]);
  const fullAreaD = useMemo(() => areaGenerator(data) ?? '', [areaGenerator, data]);

  // Active progress subset when timeline is inside 2028-2031
  const activeData = useMemo(() => {
    if (currentYear < DEORBIT_START) return [];
    const clamped = Math.min(DEORBIT_END, currentYear);
    const filtered = data.filter((d) => d.year <= clamped);
    const currentSnap = getTelemetryAtYear(clamped);
    filtered.push({
      year: clamped,
      altitudeKm: currentSnap.altitudeKm,
      phase: clamped < BURN_START ? 'lowering' : 'reentry',
    });
    return filtered;
  }, [currentYear, data]);

  const activePathD = useMemo(
    () => (activeData.length > 1 ? lineGenerator(activeData) ?? '' : ''),
    [activeData, lineGenerator]
  );

  const currentMarker = useMemo(() => {
    if (currentYear < DEORBIT_START) return null;
    const clamped = Math.min(DEORBIT_END, currentYear);
    const snap = getTelemetryAtYear(clamped);
    return {
      x: xScale(clamped),
      y: yScale(snap.altitudeKm),
      altitudeKm: snap.altitudeKm,
      isReentry: clamped >= BURN_START,
    };
  }, [currentYear, xScale, yScale]);

  const bisectYear = useMemo(
    () => d3.bisector<AltitudePoint, number>((d) => d.year).left,
    []
  );

  const resolvePointFromMouse = (e: React.MouseEvent<SVGRectElement>): AltitudePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(INNER_W, ((e.clientX - rect.left) / rect.width) * INNER_W));
    const hoveredYear = xScale.invert(relX);
    const idx = Math.min(data.length - 1, Math.max(0, bisectYear(data, hoveredYear)));
    return data[idx];
  };

  const isInDeorbitWindow = currentYear >= DEORBIT_START;
  const readoutPoint = hoverPoint ?? (isInDeorbitWindow
    ? {
        year: Math.min(DEORBIT_END, currentYear),
        altitudeKm: getTelemetryAtYear(Math.min(DEORBIT_END, currentYear)).altitudeKm,
        phase: currentYear >= BURN_START ? 'reentry' : 'lowering',
      }
    : null);

  return (
    <div className="pointer-events-auto bg-[#0a0f1a]/90 border border-slate-700/40 rounded-lg overflow-hidden max-w-[338px] w-full">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <TrendingDown
            className={`w-3.5 h-3.5 shrink-0 ${
              isInDeorbitWindow ? 'text-amber-400' : 'text-sky-400'
            }`}
          />
          <span className="text-xs font-semibold text-slate-200 truncate">
            Deorbit Altitude Decay (2028–2031)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label={expanded ? 'Collapse altitude decay chart' : 'Expand altitude decay chart'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pt-2 pb-2.5 space-y-1.5">
          {/* Compact Monospace Coordinate Readout */}
          <div className="flex items-center justify-between text-[11px] px-1">
            {readoutPoint ? (
              <>
                <span className="font-mono-tabular text-slate-300">
                  {formatYearToDate(readoutPoint.year)}
                </span>
                <span className="font-mono-tabular font-semibold text-white">
                  {readoutPoint.altitudeKm}{' '}
                  <span className="font-normal text-slate-400">km</span>
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-400">408 km → Point Nemo</span>
                <span className="text-sky-400">Click curve to scrub</span>
              </>
            )}
          </div>

          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="w-full h-auto block select-none"
            role="img"
            aria-label="ISS Orbital Altitude Decay Trend 2028 to 2031"
          >
            <defs>
              <linearGradient id="deorbitAreaGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                <stop offset="85%" stopColor="#38bdf8" stopOpacity="0.16" />
                <stop offset="92%" stopColor="#f59e0b" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id="deorbitLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="86%" stopColor="#38bdf8" />
                <stop offset="92%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Horizontal Gridlines */}
              {[120, 250, 400].map((alt) => (
                <line
                  key={alt}
                  x1={0}
                  x2={INNER_W}
                  y1={yScale(alt)}
                  y2={yScale(alt)}
                  stroke={
                    alt === ENTRY_INTERFACE_KM
                      ? 'rgba(245, 158, 11, 0.35)'
                      : 'rgba(148, 163, 184, 0.12)'
                  }
                  strokeDasharray={alt === ENTRY_INTERFACE_KM ? '3 3' : undefined}
                />
              ))}

              {/* Entry Interface Label */}
              <text
                x={4}
                y={yScale(ENTRY_INTERFACE_KM) - 4}
                fill="#f59e0b"
                fontSize="9"
                style={{ fontFamily: 'var(--font-mono)' }}
                opacity={0.85}
              >
                120 km Entry Interface
              </text>

              {/* USDV Burn Vertical Marker */}
              <line
                x1={xScale(BURN_START)}
                x2={xScale(BURN_START)}
                y1={0}
                y2={INNER_H}
                stroke="rgba(245, 158, 11, 0.28)"
                strokeDasharray="2 2"
              />
              <text
                x={xScale(BURN_START) - 4}
                y={10}
                textAnchor="end"
                fill="#cbd5e1"
                fontSize="8.5"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                USDV Burn
              </text>

              {/* Subtle Area Fill */}
              <path d={fullAreaD} fill="url(#deorbitAreaGrad)" />

              {/* Full Planned Trajectory (Dashed Baseline) */}
              <path
                d={fullPathD}
                fill="none"
                stroke="rgba(148, 163, 184, 0.48)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />

              {/* Active Illuminated Progress Curve */}
              {activePathD && (
                <path
                  d={activePathD}
                  fill="none"
                  stroke="url(#deorbitLineGrad)"
                  strokeWidth={2.25}
                />
              )}

              {/* Current Timeline Position Marker */}
              {currentMarker && (
                <g>
                  <line
                    x1={currentMarker.x}
                    x2={currentMarker.x}
                    y1={0}
                    y2={INNER_H}
                    stroke={currentMarker.isReentry ? 'rgba(245,158,11,0.45)' : 'rgba(56,189,248,0.45)'}
                    strokeWidth={1}
                  />
                  <circle
                    cx={currentMarker.x}
                    cy={currentMarker.y}
                    r={4}
                    fill={currentMarker.isReentry ? '#f59e0b' : '#38bdf8'}
                    stroke="#060911"
                    strokeWidth={1.5}
                  />
                </g>
              )}

              {/* Interactive Hairline Crosshair on Hover */}
              {hoverPoint && (
                <g pointerEvents="none">
                  <line
                    x1={xScale(hoverPoint.year)}
                    x2={xScale(hoverPoint.year)}
                    y1={0}
                    y2={INNER_H}
                    stroke="rgba(226, 232, 240, 0.5)"
                    strokeWidth={1}
                  />
                  <line
                    x1={0}
                    x2={INNER_W}
                    y1={yScale(hoverPoint.altitudeKm)}
                    y2={yScale(hoverPoint.altitudeKm)}
                    stroke="rgba(226, 232, 240, 0.25)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={xScale(hoverPoint.year)}
                    cy={yScale(hoverPoint.altitudeKm)}
                    r={3.5}
                    fill="#ffffff"
                    stroke="#060911"
                    strokeWidth={1.5}
                  />
                </g>
              )}

              {/* D3 Axes */}
              <g ref={xAxisRef} transform={`translate(0,${INNER_H})`} />
              <g ref={yAxisRef} />

              {/* Y-axis unit label */}
              <text
                x={-MARGIN.left + 4}
                y={-2}
                fill="#64748b"
                fontSize="9"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                km
              </text>

              {/* Transparent Interaction Overlay */}
              <rect
                x={0}
                y={0}
                width={INNER_W}
                height={INNER_H}
                fill="transparent"
                className="cursor-crosshair"
                onMouseMove={(e) => setHoverPoint(resolvePointFromMouse(e))}
                onMouseLeave={() => setHoverPoint(null)}
                onClick={(e) => {
                  const pt = resolvePointFromMouse(e);
                  onSeekYear(pt.year);
                }}
              />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
