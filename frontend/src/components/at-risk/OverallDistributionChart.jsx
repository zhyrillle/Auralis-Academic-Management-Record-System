import { useEffect, useRef, useState } from "react";

const COLORS = { low: "#168449", medium: "#C27C20", high: "#C62828" };
const LABELS = { low: "Low Risk", medium: "Medium Risk", high: "High Risk" };
const BADGES = { medium: [52, 50], low: [52, 310], high: [368, 180] };
const CENTER = { x: 210, y: 180 };
const OUTER = 92, INNER = 56;
const polar = (radius, angle) => [CENTER.x + radius * Math.cos(angle * Math.PI / 180), CENTER.y + radius * Math.sin(angle * Math.PI / 180)];

const DRIFT_PROFILES = [
  { phase: 0.4, speed: 0.85, radiusX: 18, radiusY: 13 },
  { phase: 2.5, speed: -0.7, radiusX: 16, radiusY: 15 },
  { phase: 4.6, speed: 0.65, radiusX: 20, radiusY: 13 },
];
const STILL_OFFSETS = DRIFT_PROFILES.map(() => ({ x: 0, y: 0 }));

function usePillDrift() {
  const [offsets, setOffsets] = useState(STILL_OFFSETS);
  const motion = useRef({
    phase: 0, travel: 0, previous: null, positions: STILL_OFFSETS,
    targets: STILL_OFFSETS, lastTime: null, frame: null, reduced: true,
  });
  const animate = timestamp => {
    const current = motion.current;
    current.frame = null;
    if (current.reduced) return;
    const elapsed = current.lastTime === null ? 0 : Math.min(timestamp - current.lastTime, 48);
    current.lastTime = timestamp;
    const ease = 1 - Math.exp(-elapsed / 85);
    let settled = true;
    current.positions = current.positions.map((position, index) => {
      const target = current.targets[index];
      const x = position.x + (target.x - position.x) * ease;
      const y = position.y + (target.y - position.y) * ease;
      if (Math.abs(target.x - x) < 0.01 && Math.abs(target.y - y) < 0.01) return target;
      settled = false;
      return { x, y };
    });
    setOffsets(current.positions);
    if (settled) current.lastTime = null;
    else current.frame = window.requestAnimationFrame(animate);
  };
  const target = positions => {
    const current = motion.current;
    current.targets = positions;
    if (current.frame === null) current.frame = window.requestAnimationFrame(animate);
  };
  const rememberPointer = event => {
    if (event.pointerType !== "mouse" || motion.current.reduced) return;
    motion.current.previous = { x: event.clientX, y: event.clientY };
  };
  const move = event => {
    const current = motion.current;
    if (event.pointerType !== "mouse" || current.reduced) return;
    const previous = current.previous;
    rememberPointer(event);
    if (!previous) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - previous.x, event.clientY - previous.y)
      / Math.max(bounds.width / 420, 0.1);
    if (!distance) return;
    current.travel += distance;
    current.phase += distance * 0.008;
    const normalize = (value, start, size) => Math.max(-1, Math.min(1, (value - start) / Math.max(size, 1) * 2 - 1));
    const x = normalize(event.clientX, bounds.left, bounds.width);
    const y = normalize(event.clientY, bounds.top, bounds.height);
    const strength = Math.min(1, current.travel / 80);
    // Cursor travel advances independent paths; elapsed time never advances
    // them. The animation loop only eases toward the last movement's target.
    target(DRIFT_PROFILES.map((profile, index) => {
      const phase = current.phase * profile.speed + profile.phase;
      const reference = (x * Math.cos(profile.phase) + y * Math.sin(profile.phase)) * 0.18;
      return {
        x: strength * profile.radiusX * Math.sin(phase + reference),
        y: strength * profile.radiusY * Math.cos(phase * (0.8 + index * 0.12) - reference),
      };
    }));
  };
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const current = motion.current;
    current.reduced = preference.matches;
    const update = () => {
      current.reduced = preference.matches;
      if (!current.reduced) return;
      if (current.frame !== null) window.cancelAnimationFrame(current.frame);
      Object.assign(current, { travel: 0, previous: null, positions: STILL_OFFSETS, targets: STILL_OFFSETS, lastTime: null, frame: null });
      setOffsets(STILL_OFFSETS);
    };
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      if (current.frame !== null) window.cancelAnimationFrame(current.frame);
    };
  }, []);
  return {
    offsets,
    onPointerEnter: rememberPointer,
    onPointerMove: move,
    onPointerLeave: () => {
      const current = motion.current;
      current.previous = null;
      current.travel = 0;
      if (!current.reduced) target(STILL_OFFSETS);
    },
  };
}

export default function OverallDistributionChart({ data, loading }) {
  const [active, setActive] = useState(null);
  const { offsets, onPointerEnter, onPointerMove, onPointerLeave } = usePillDrift();
  if (loading) return <div className="ar-chart-card"><div className="ar-chart-header"><h2 className="ar-chart-title">OVERALL DISTRIBUTION</h2></div><div className="ar-skeleton-ring" /></div>;
  const counts = { high: data?.high?.count || 0, medium: data?.medium?.count || 0, low: data?.low?.count || 0 };
  const total = data?.totalFlagged || counts.high + counts.medium + counts.low;
  const high = total ? Math.round(counts.high / total * 100) : 0;
  const medium = total ? Math.round(counts.medium / total * 100) : 0;
  const percentages = { high, medium, low: total ? Math.max(0, 100 - high - medium) : 0 };
  let angle = -90;
  const segments = ["medium", "low", "high"].map(key => {
    const sweep = total ? counts[key] / total * 360 : 0;
    const start = angle, end = angle + Math.max(0, sweep - Math.min(3, sweep / 4)), mid = (start + end) / 2;
    angle += sweep;
    const outer = active === key ? OUTER + 5 : OUTER;
    const [sx, sy] = polar(outer, start), [ex, ey] = polar(outer, end);
    const [ix, iy] = polar(INNER, start), [jx, jy] = polar(INNER, end);
    return { key, count: counts[key], percent: percentages[key], color: COLORS[key], mid,
      d: sweep ? `M ${ix} ${iy} L ${sx} ${sy} A ${outer} ${outer} 0 ${end - start > 180 ? 1 : 0} 1 ${ex} ${ey} L ${jx} ${jy} A ${INNER} ${INNER} 0 ${end - start > 180 ? 1 : 0} 0 ${ix} ${iy} Z` : "" };
  });
  const activeSegment = segments.find(segment => segment.key === active);
  const interaction = key => ({
    onMouseEnter: () => setActive(key), onMouseLeave: () => setActive(null),
    onFocus: () => setActive(key), onBlur: () => setActive(null),
    onKeyDown: event => { if (event.key === "Escape") setActive(null); },
  });
  return <div className="ar-chart-card ar-risk-distribution" onPointerEnter={onPointerEnter} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerCancel={onPointerLeave}>
    <div className="ar-chart-header"><h2 className="ar-chart-title">OVERALL DISTRIBUTION</h2>
      <div className="ar-chart-legend-top">{segments.map(segment => <button type="button" key={segment.key} className={`ar-legend-dot-item${active === segment.key ? " active-legend" : ""}`} {...interaction(segment.key)}>
        <span className="ar-legend-dot-circle" style={{ background: segment.color }} />{segment.key[0].toUpperCase() + segment.key.slice(1)}
      </button>)}</div>
    </div>
    <div className="ar-donut-chart-container ar-connected-donut">
      <svg viewBox="0 0 420 360" className="ar-overall-donut-svg" role="group" aria-label="Overall risk distribution">
        {!total && <circle cx={CENTER.x} cy={CENTER.y} r={(OUTER + INNER) / 2} fill="none" stroke="#e9eef5" strokeWidth={OUTER - INNER} />}
        {segments.map(segment => segment.d && <path key={segment.key} d={segment.d} fill={segment.color} className="ar-risk-segment" tabIndex="0" role="button" aria-label={`${LABELS[segment.key]}: ${segment.count} learners, ${segment.percent}%`} {...interaction(segment.key)} style={{ opacity: active && active !== segment.key ? 0.6 : 1 }} />)}
        {segments.map((segment, index) => {
          const badge = segment.count > 0 ? polar(160, segment.mid) : BADGES[segment.key];
          const bx = Math.min(390, Math.max(30, Math.min(388, Math.max(32, badge[0])) + offsets[index].x));
          const by = Math.min(340, Math.max(20, Math.min(338, Math.max(22, badge[1])) + offsets[index].y));
          const start = polar(OUTER + 5, segment.mid), elbow = polar(OUTER + 19, segment.mid);
          return <g key={segment.key}>
            {segment.count > 0 && <polyline className={`ar-donut-connector${active === segment.key ? " is-active" : ""}`} data-risk={segment.key} points={`${start.join(",")} ${elbow.join(",")} ${bx},${by}`} pathLength="1" fill="none" stroke={segment.color} strokeWidth="2" pointerEvents="none" aria-hidden="true" />}
            <g className={`ar-svg-badge${active === segment.key ? " is-active" : ""}`} tabIndex="0" role="button" aria-label={`${LABELS[segment.key]} percentage: ${segment.percent}%`} {...interaction(segment.key)}>
              <rect x={bx - 23} y={by - 12} width="46" height="24" rx="12" fill={segment.color} />
              <text x={bx} y={by + 4} textAnchor="middle">{segment.percent}%</text>
            </g>
          </g>;
        })}
      </svg>
      <div className="ar-donut-center-content">
        <span className="ar-donut-center-num" style={activeSegment ? { color: activeSegment.color } : undefined}>{activeSegment ? activeSegment.count : total}</span>
        <span className="ar-donut-center-sub">{activeSegment ? LABELS[activeSegment.key] : "learners"}</span>
        {activeSegment && <span className="ar-donut-center-percent">{activeSegment.percent}% of total</span>}
      </div>
    </div>
  </div>;
}
