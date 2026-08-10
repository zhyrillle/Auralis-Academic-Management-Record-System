import { Eye, FileSpreadsheet, Edit2, Star } from "lucide-react";
import "../../styles/themes.css";

export default function ClassCard({ cls, onView, onGradingSheet, onEdit }) {
  const isAdvisory = cls.classType === "Advisory Class";

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "15px",
        border: "1px solid #eef2f6",
        padding: "24px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        transition: "all 0.3s ease",
        height: "205px",
      }}

      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow =
          "0 16px 35px rgba(15, 23, 42, 0.12)";
      }}

      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow =
          "0 8px 24px rgba(15, 23, 42, 0.06)";
      }}
    >

      {/* Card Content */}
      <div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "7px",
          }}
        >

          <h3
            style={{
              fontSize: "var(--fs-h3)",
              fontWeight: "var(--fw-semibold)",
              fontFamily: "var(--font-dm-sans)",
              color: "#1e293b",
              margin: 0,
            }}
          >
            {cls.sectionName}
          </h3>


          <span
            style={{
              backgroundColor: isAdvisory
                ? "rgba(22,163,74,0.1)"
                : "rgba(17,45,97,0.06)",
              color: isAdvisory
                ? "#16a34a"
                : "#112d61",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            {cls.gradeLevel}
          </span>

        </div>


        {/* Subject */}
        <div
          style={{
            fontSize: "var(--fs-subtext)",
            fontWeight: "var(--fw-medium)",
            fontFamily: "var(--font-dm-sans)",
            color: "#64748b",
            marginBottom: "5px",
          }}
        >
          {cls.subject}
        </div>


        {/* Class Type */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "var(--fs-subtext)",
            fontWeight: "var(--fw-medium)",
            fontFamily: "var(--font-dm-sans)",
            color: isAdvisory ? "#16a34a" : "#64748b",
          }}
        >

          {isAdvisory && (
            <Star
              size={14}
              fill="currentColor"
            />
          )}

          <span>
            {cls.classType}
          </span>

        </div>

      </div>


      {/* Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "40px",
          paddingTop: "0px",
          //borderTop: "1px solid #f1f5f9",
        }}
      >

        {/* View Button */}
        <button
          title="Section Details"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "none",
            borderRadius: "20px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            backgroundColor: "#C9A227",
            color: "#ffffff",
            padding: "10px 16px",
          }}
          onClick={() => onView(cls)}
        >
          <Eye size={18} />
          <span>VIEW</span>
        </button>


        {/* Grading Sheet */}
        <button
          title="Grading Sheet"
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "13px",
            border: "none",
            backgroundColor: "#f1f5f9",
            color: "#886C14",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => onGradingSheet(cls)}
        >
          <FileSpreadsheet size={18} />
        </button>


        {/* Edit */}
        <button
          title="Class Record"
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "13px",
            border: "none",
            backgroundColor: "#f1f5f9",
            color: "#886C14",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => onEdit(cls)}
        >
          <Edit2 size={16} />
        </button>

      </div>

    </div>
  );
}