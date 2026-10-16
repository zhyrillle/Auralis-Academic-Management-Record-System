import React, { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { maskLrn } from "../../utils/lrnHelper";

/**
 * MaskedLrn Component
 * Renders an LRN in a masked format by default with optional reveal and copy toggles.
 *
 * @param {Object} props
 * @param {string|number} props.lrn - The real LRN value
 * @param {string} [props.maskedLrn] - Optional pre-computed masked LRN from backend
 * @param {boolean} [props.showToggle=false] - Whether to show the Eye toggle to reveal full LRN
 * @param {boolean} [props.allowCopy=false] - Whether to show a one-click copy button
 * @param {boolean} [props.badge=true] - Whether to style inside a badge pill
 * @param {string} [props.className] - Additional class names
 * @param {Object} [props.style] - Custom inline styles
 */
export default function MaskedLrn({
  lrn,
  maskedLrn,
  showToggle = false,
  allowCopy = false,
  badge = true,
  className = "",
  style = {},
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawLrn = lrn ? String(lrn).trim() : "";
  const displayMasked = maskedLrn || maskLrn(rawLrn);
  const displayText = revealed ? rawLrn || "N/A" : displayMasked;

  const handleToggle = (e) => {
    e.stopPropagation();
    setRevealed((prev) => !prev);
  };

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (!rawLrn) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(rawLrn);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = rawLrn;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silent fail
    }
  };

  const containerStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    verticalAlign: "middle",
    ...style,
  };

  const buttonStyle = {
    background: "transparent",
    border: "none",
    padding: "2px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#64748b",
    borderRadius: "4px",
    transition: "color 0.15s ease, background 0.15s ease",
    lineHeight: 1,
  };

  const content = (
    <span
      className={badge ? `lrn-badge ${className}`.trim() : className}
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        letterSpacing: "0.04em",
      }}
    >
      <span className="lrn-screen-val">{displayText}</span>
      <span className="lrn-print-val" style={{ display: "none" }}>{rawLrn || "N/A"}</span>
    </span>
  );

  if (!showToggle && !allowCopy) {
    return content;
  }

  return (
    <span style={containerStyle} className="masked-lrn-wrapper">
      {content}

      {showToggle && rawLrn && rawLrn !== "N/A" && (
        <button
          type="button"
          onClick={handleToggle}
          style={buttonStyle}
          className="lrn-action-btn"
          title={revealed ? "Hide LRN" : "Reveal full LRN"}
          aria-label={revealed ? "Hide LRN" : "Reveal full LRN"}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}

      {allowCopy && rawLrn && rawLrn !== "N/A" && (
        <button
          type="button"
          onClick={handleCopy}
          style={{
            ...buttonStyle,
            color: copied ? "#16a34a" : "#64748b",
          }}
          className="lrn-action-btn"
          title={copied ? "Copied to clipboard!" : "Copy full LRN"}
          aria-label="Copy full LRN"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </span>
  );
}
