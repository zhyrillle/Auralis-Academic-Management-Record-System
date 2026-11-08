import { Eye, FileSpreadsheet, Edit2, Star } from "lucide-react";
import "../../styles/themes.css";
import "../../styles/sectionCard.css";

export default function ClassCard({ cls, onView, onGradingSheet, onEdit, children, hideClassType = false, showSecondaryActions = true, secondaryActionsDisabled = false, secondaryActionsDisabledReason = '', className = '', viewAriaLabel, gradeId }) {
  const isSpecialized = Boolean(
    cls?.is_specialized == 1 ||
    cls?.is_specialized === true ||
    cls?.is_specialized === "1" ||
    String(cls?.is_specialized).toLowerCase() === "true" ||
    (cls?.classType && (String(cls.classType).startsWith("Special Program") || String(cls.classType).startsWith("Advisory Class -")))
  );
  const isAdviser = Boolean(cls?.isAdviser === true || (cls?.classType && String(cls.classType).startsWith("Advisory Class")));
  const isAdvisory = isAdviser;

  const programCode = cls?.program_code || cls?.programCode || cls?.program_name || null;
  const validProgCode = programCode && String(programCode).toUpperCase() !== "EBEC" ? String(programCode).toUpperCase() : null;

  let displayClassType;
  if (isAdviser && isSpecialized) {
    displayClassType = validProgCode ? `Advisory Class - ${validProgCode}` : "Advisory Class";
  } else if (isSpecialized) {
    displayClassType = validProgCode ? `Special Program - ${validProgCode}` : "Special Program";
  } else if (isAdviser) {
    displayClassType = "Advisory Class";
  } else {
    displayClassType = "Regular Class";
  }

  let classTypeColor;
  if (isAdviser) {
    classTypeColor = "#16a34a"; // Green for advisory (regardless if its specialized or not)
  } else if (isSpecialized) {
    classTypeColor = "#c9a227"; // Yellow for specialized
  } else {
    classTypeColor = "#64748b"; // Gray for regular
  }

  return (
    <div className={className} role={className ? 'article' : undefined} aria-label={className ? `${cls.sectionName}, ${cls.gradeLevel}` : undefined}
      style={{
        boxSizing: "border-box",
        minWidth: 0,
        background: "#ffffff",
        borderRadius: "15px",
        border: "1px solid #eef2f6",
        padding: "20px 16px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        transition: "all 0.3s ease",
        height: children ? "auto" : "205px",
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
            className={gradeId == null ? undefined : 'section-card__grade'}
            data-grade-level={gradeId}
            style={{
              backgroundColor: gradeId != null ? undefined : isAdviser
                ? "rgba(22,163,74,0.1)"
                : isSpecialized
                  ? "rgba(201, 162, 39, 0.1)"
                  : "rgba(17,45,97,0.06)",
              color: gradeId != null ? undefined : isAdviser
                ? "#16a34a"
                : isSpecialized
                  ? "#c9a227"
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
        {!hideClassType && <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "var(--fs-subtext)",
            fontWeight: "var(--fw-medium)",
            fontFamily: "var(--font-dm-sans)",
            color: classTypeColor,
          }}
        >

          {(isAdviser || isSpecialized) && (
            <Star
              size={14}
              fill="currentColor"
            />
          )}

          <span>
            {displayClassType}
          </span>

        </div>}

      </div>

      {children}


      {/* Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: children ? "18px" : "auto",
          paddingTop: children ? "0px" : "12px",
          width: "100%",
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >

        {/* View Button */}
        <button
          type="button"
          title={viewAriaLabel || (showSecondaryActions ? "View Section Details" : "Section Details")}
          aria-label={viewAriaLabel || "VIEW"}
          style={showSecondaryActions ? {
            width: "36px",
            height: "36px",
            minWidth: "36px",
            borderRadius: "13px",
            border: "none",
            backgroundColor: "#f1f5f9",
            color: "#886C14",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.2s ease",
            padding: 0,
          } : {
            flex: 1,
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "none",
            borderRadius: "13px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600",
            backgroundColor: "#f1f5f9",
            color: "#886C14",
            padding: "0 14px",
            transition: "all 0.2s ease",
          }}
          onClick={() => onView(cls)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#f1f5f9";
          }}
        >
          <Eye size={17} />
          {!showSecondaryActions && <span>VIEW</span>}
        </button>


        {showSecondaryActions && <>{/* Grading Sheet */}
          <button
            type="button"
            title={secondaryActionsDisabled ? `Grading Sheet: ${secondaryActionsDisabledReason}` : "Grading Sheet"}
            aria-label={secondaryActionsDisabled ? `Grading Sheet: ${secondaryActionsDisabledReason}` : "Grading Sheet"}
            aria-disabled={secondaryActionsDisabled || undefined}
            style={{
              flex: 1,
              minWidth: 0,
              height: "36px",
              borderRadius: "13px",
              border: "none",
              backgroundColor: secondaryActionsDisabled ? "#f1f5f9" : "#C9A227",
              color: secondaryActionsDisabled ? "#94a3b8" : "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              fontSize: "12px",
              fontWeight: "600",
              fontFamily: "var(--font-dm-sans, inherit)",
              padding: "0 6px",
              cursor: secondaryActionsDisabled ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
            }}
            onClick={() => { if (!secondaryActionsDisabled) onGradingSheet(cls); }}
            onMouseEnter={(e) => {
              if (!secondaryActionsDisabled) e.currentTarget.style.backgroundColor = "#886C14";
            }}
            onMouseLeave={(e) => {
              if (!secondaryActionsDisabled) e.currentTarget.style.backgroundColor = "#C9A227";
            }}
          >
            <FileSpreadsheet size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Grading Sheet
            </span>
          </button>


          {/* Class Record */}
          <button
            type="button"
            title={secondaryActionsDisabled ? `Class Record: ${secondaryActionsDisabledReason}` : "Class Record"}
            aria-label={secondaryActionsDisabled ? `Class Record: ${secondaryActionsDisabledReason}` : "Class Record"}
            aria-disabled={secondaryActionsDisabled || undefined}
            style={{
              flex: 1,
              minWidth: 0,
              height: "36px",
              borderRadius: "13px",
              border: "none",
              backgroundColor: secondaryActionsDisabled ? "#f1f5f9" : "#112d61",
              color: secondaryActionsDisabled ? "#94a3b8" : "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              fontSize: "12px",
              fontWeight: "600",
              fontFamily: "var(--font-dm-sans, inherit)",
              padding: "0 6px",
              cursor: secondaryActionsDisabled ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
            }}
            onClick={() => { if (!secondaryActionsDisabled) onEdit(cls); }}
            onMouseEnter={(e) => {
              if (!secondaryActionsDisabled) e.currentTarget.style.backgroundColor = "#1e3e78";
            }}
            onMouseLeave={(e) => {
              if (!secondaryActionsDisabled) e.currentTarget.style.backgroundColor = "#112d61";
            }}
          >
            <Edit2 size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Class Record
            </span>
          </button>
        </>}

      </div>

    </div>
  );
}
