import React from "react";
import { AlertCircle, MinusCircle, AlertTriangle, Users } from "lucide-react";

const ICON_MAP = {
  low: AlertCircle,
  medium: MinusCircle,
  high: AlertTriangle,
  total: Users,
};

export default function RiskStatCard({ title, value, caption, accentColor, type = "low", icon, loading }) {
  const IconComponent = typeof icon === "string" ? (ICON_MAP[type] || AlertCircle) : icon;

  return (
    <div className="ar-stat-card">
      <div className="ar-stat-header">
        <span className="ar-stat-title">{title}</span>
        <div className="ar-stat-icon-wrap" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>
          {React.isValidElement(icon) ? (
            icon
          ) : typeof icon === "function" ? (
            <IconComponent size={18} />
          ) : (
            <IconComponent size={18} />
          )}
        </div>
      </div>
      <div className="ar-stat-body">
        <span className="ar-stat-value">
          {loading ? "—" : value}
        </span>
        <span className="ar-stat-caption">{caption}</span>
      </div>
    </div>
  );
}
