import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function AdviserTestExamAnalysis({
  data = null,
  term = "T1",
  onTermChange,
  section = "All",
  onSectionChange,
  sections = ["All", "Gemelina", "Mahogany", "Narra", "Tanguile"],
  loading = false,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const terms = ["T1", "T2", "T3"];

  const currentData = data || {
    above75: [],
    below75: [],
    scores: {
      ST1: { highest: 0, lowest: 0 },
      ST2: { highest: 0, lowest: 0 },
      TE: { highest: 0, lowest: 0 },
    },
  };

  const legendItems = [
    { key: "ST1", label: "ST1", color: "#162D4D" },
    { key: "ST2", label: "ST2", color: "#2E5884" },
    { key: "TE", label: "TE", color: "#5F83AA" },
  ];

  const renderPolarSlice = (cx, cy, innerR, outerR, startAngleDeg, endAngleDeg, color) => {
    const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
    const startRad = toRad(startAngleDeg);
    const endRad = toRad(endAngleDeg);

    const x1 = cx + outerR * Math.cos(startRad);
    const y1 = cy + outerR * Math.sin(startRad);
    const x2 = cx + outerR * Math.cos(endRad);
    const y2 = cy + outerR * Math.sin(endRad);

    const x3 = cx + innerR * Math.cos(endRad);
    const y3 = cy + innerR * Math.sin(endRad);
    const x4 = cx + innerR * Math.cos(startRad);
    const y4 = cy + innerR * Math.sin(startRad);

    const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      `Z`,
    ].join(" ");

    return <path key={startAngleDeg} d={pathData} fill={color} />;
  };

  const renderChart = (slices, title) => {
    const cx = 95;
    const cy = 95;
    const innerR = 26;

    const arcAngles = [
      { start: 5, end: 115 },
      { start: 125, end: 235 },
      { start: 245, end: 355 },
    ];

    const hasSlices = slices && slices.length > 0;

    return (
      <div className="adviser-dashboard__test-chart-item">
        <svg
          viewBox="0 0 190 190"
          className="adviser-dashboard__polar-svg"
        >
          {hasSlices ? (
            slices.map((slice, idx) => {
              const angle = arcAngles[idx] || { start: 0, end: 110 };
              const outerR = 35 + (slice.radius || 70) * 0.45;
              return renderPolarSlice(
                cx,
                cy,
                innerR,
                outerR,
                angle.start,
                angle.end,
                slice.color || legendItems[idx].color,
              );
            })
          ) : (
            <circle
              cx={cx}
              cy={cy}
              r="60"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="24"
            />
          )}
          <circle cx={cx} cy={cy} r={innerR - 2} fill="#FFFFFF" />
        </svg>
        <div className="adviser-dashboard__test-chart-caption">{title}</div>
      </div>
    );
  };

  return (
    <div className="adviser-dashboard__test-exam-card">
      <div className="adviser-dashboard__test-exam-left">
        <div className="adviser-dashboard__test-term-col">
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              className={`adviser-dashboard__term-pill-simple ${term === t ? "active" : ""}`}
              onClick={() => onTermChange && onTermChange(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="adviser-dashboard__test-visuals-wrap">
          <div className="adviser-dashboard__test-legend">
            {legendItems.map((item) => (
              <span key={item.key} className="adviser-dashboard__test-legend-item">
                <span
                  className="adviser-dashboard__test-legend-dot"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>

          <div className="adviser-dashboard__test-charts-row">
            {renderChart(currentData.above75 || [], "Got 75% Above")}
            {renderChart(currentData.below75 || [], "Got 75% Below")}
          </div>
        </div>
      </div>

      <div className="adviser-dashboard__test-exam-right">
        <div className="adviser-dashboard__test-right-header">
          <div className="adviser-dashboard__test-dropdown-wrap">
            <button
              type="button"
              className="adviser-dashboard__test-section-select-btn"
              onClick={() => setDropdownOpen((prev) => !prev)}
            >
              <span>{section === "All" ? "Section" : section}</span>
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <div className="adviser-dashboard__test-dropdown-menu">
                {sections.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`adviser-dashboard__test-dropdown-item ${section === sec ? "active" : ""}`}
                    onClick={() => {
                      onSectionChange && onSectionChange(sec);
                      setDropdownOpen(false);
                    }}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="adviser-dashboard__test-scores-grid">
          <div className="adviser-dashboard__test-score-col">
            <div className="adviser-dashboard__test-col-title">Highest Score</div>
            {legendItems.map((item) => {
              const score = currentData.scores?.[item.key]?.highest ?? 0;
              return (
                <div key={`high-${item.key}`} className="adviser-dashboard__test-pill-row">
                  <span
                    className="adviser-dashboard__test-badge"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.key}
                  </span>
                  <span className="adviser-dashboard__test-score-num">{score}</span>
                </div>
              );
            })}
          </div>

          <div className="adviser-dashboard__test-score-col">
            <div className="adviser-dashboard__test-col-title">Lowest Score</div>
            {legendItems.map((item) => {
              const score = currentData.scores?.[item.key]?.lowest ?? 0;
              return (
                <div key={`low-${item.key}`} className="adviser-dashboard__test-pill-row">
                  <span
                    className="adviser-dashboard__test-badge"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.key}
                  </span>
                  <span className="adviser-dashboard__test-score-num">{score}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
