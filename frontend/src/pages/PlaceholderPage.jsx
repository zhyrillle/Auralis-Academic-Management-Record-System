import { useLocation } from "react-router-dom";
import { Sparkles, FileText, Activity } from "lucide-react";

export default function PlaceholderPage() {
  const location = useLocation();
  const pageName = location.pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Page";

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.02)",
        border: "1px solid #eef2f6",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <div
          style={{
            width: "50px",
            height: "50px",
            borderRadius: "12px",
            backgroundColor: "rgba(17, 45, 97, 0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--sidebar-bg)",
          }}
        >
          <Activity size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: "24px", color: "var(--sidebar-bg)", fontWeight: "700" }}>
            {pageName} Module
          </h1>
          <p style={{ color: "#8c9ba5", fontSize: "14px" }}>
            Route: {location.pathname}
          </p>
        </div>
      </div>

      <hr style={{ border: "0", borderTop: "1px solid #eef2f6", margin: "20px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", color: "#475569" }}>
        <p>
          This is a placeholder page for the <strong>{pageName}</strong> screen. The dynamic navigation is
          now fully integrated with the Auralis Academic Management Record System layout.
        </p>
      </div>
    </div>
  );
}
