import { useState, useMemo, useEffect } from "react";
import { Download, Printer, Check, Calendar } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import SubmissionFooter from "../../components/common/SubmissionFooter.jsx";
import { exportGradingSheetPdf } from "../../utils/exportGradingSheetPdf";
import { getStoredUser } from "../../utils/auth";
import "../../styles/gradingSheet.css";

export default function GradingSheet({
    activeSelectedClass,
    students = [],
    onBack,
    triggerToast,
    calculateFinalGrade,
    onSubmit,
    userRole = "teacher",
}) {
    const [searchStudentQuery, setSearchStudentQuery] = useState("");
    const [filterDescriptor, setFilterDescriptor] = useState("All");
    const [filterRemark, setFilterRemark] = useState("All");

    const sectionId = useMemo(() => {
        return (
            activeSelectedClass?.section_id ||
            activeSelectedClass?.sectionId ||
            (typeof activeSelectedClass?.id === "number" ? activeSelectedClass.id : null) ||
            (typeof activeSelectedClass?.id === "string" && !isNaN(Number(activeSelectedClass.id)) ? Number(activeSelectedClass.id) : null) ||
            (typeof activeSelectedClass?.id === "string" && activeSelectedClass.id.startsWith("sec-") ? Number(activeSelectedClass.id.replace("sec-", "")) : null) ||
            null
        );
    }, [activeSelectedClass]);

    const subjectOfferingId = useMemo(() => {
        return (
            activeSelectedClass?.subject_offering_id ||
            activeSelectedClass?.offering_id ||
            (activeSelectedClass?.subject_id && !activeSelectedClass?.section_id ? activeSelectedClass.subject_id : null) ||
            sectionId ||
            1
        );
    }, [activeSelectedClass, sectionId]);

    // Term state (follows ClassRecord logic: checks sessionStorage, activeSelectedClass, class-record API, and date-range matching)
    const [currentTermCode, setCurrentTermCode] = useState(() => {
        try {
            const stored = sessionStorage.getItem(`classRecord_activeTerm_${subjectOfferingId}`) || sessionStorage.getItem("activeTerm");
            if (stored && ["T1", "T2", "T3"].includes(stored)) {
                return stored;
            }
        } catch (_) {}

        const raw = activeSelectedClass?.activeTerm || activeSelectedClass?.term || activeSelectedClass?.active_term || activeSelectedClass?.currentTerm;
        if (raw) {
            const str = String(raw).toUpperCase();
            if (str.includes("3") || str.includes("T3") || str.includes("3RD")) return "T3";
            if (str.includes("2") || str.includes("T2") || str.includes("2ND")) return "T2";
            if (str.includes("1") || str.includes("T1") || str.includes("1ST")) return "T1";
        }
        return null;
    });

    const currentTermLabel = useMemo(() => {
        if (currentTermCode === "T2") return "Term 2";
        if (currentTermCode === "T3") return "Term 3";
        if (currentTermCode === "T1") return "Term 1";
        return "";
    }, [currentTermCode]);

    // MAPEH Tab State: 'MA' (Music & Arts), 'PEH' (PE & Health), 'COMBINED' (Combined MAPEH)
    const [activeMapehTab, setActiveMapehTab] = useState("MA");
    // Combined Sheet Term Selector: 'T1', 'T2', 'T3', 'All' (defaults to current term or T1)
    const [combinedTermFilter, setCombinedTermFilter] = useState(() => currentTermCode || "T1");

    // Synchronize current term using ClassRecord API and Academic Terms date range logic
    useEffect(() => {
        let isMounted = true;
        async function fetchClassRecordTerm() {
            try {
                // 1. Fetch from class-record API endpoint (returns server resolved active_term matching ClassRecord logic)
                const res = await fetch(`http://localhost:5000/api/class-record/${subjectOfferingId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.active_term && isMounted) {
                        const code = data.active_term.toUpperCase();
                        if (["T1", "T2", "T3"].includes(code)) {
                            setCurrentTermCode(code);
                            setCombinedTermFilter(code);
                            try {
                                sessionStorage.setItem(`classRecord_activeTerm_${subjectOfferingId}`, code);
                            } catch (_) {}
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn("ClassRecord API term fetch error:", e);
            }

            // 2. Fallback: Query academic-terms and match date range (CURRENT_TIMESTAMP between starts_at and ends_at)
            try {
                const resTerms = await fetch("http://localhost:5000/api/academic-terms");
                if (resTerms.ok) {
                    const terms = await resTerms.json();
                    if (Array.isArray(terms) && terms.length > 0 && isMounted) {
                        const now = new Date();
                        // Find term where current date falls between starts_at and ends_at
                        const activeObj = terms.find((t) => {
                            if (!t.starts_at || !t.ends_at) return false;
                            const start = new Date(t.starts_at);
                            const end = new Date(t.ends_at);
                            return now >= start && now <= end;
                        }) || terms.find((t) => String(t.status).toLowerCase() === "ongoing" || String(t.status).toLowerCase() === "open") || terms[0];

                        if (activeObj) {
                            const name = String(activeObj.term_name || "").toLowerCase();
                            let code = "T1";
                            if (name.includes("2") || name.includes("2nd") || name.includes("t2")) code = "T2";
                            else if (name.includes("3") || name.includes("3rd") || name.includes("t3")) code = "T3";

                            setCurrentTermCode(code);
                            setCombinedTermFilter(code);
                            try {
                                sessionStorage.setItem(`classRecord_activeTerm_${subjectOfferingId}`, code);
                            } catch (_) {}
                        }
                    }
                }
            } catch (e) {
                console.warn("Academic terms date-range fetch error:", e);
            }
        }

        fetchClassRecordTerm();
        return () => { isMounted = false; };
    }, [activeSelectedClass, subjectOfferingId]);

    const currentUser = useMemo(() => getStoredUser(), []);
    const teacherName = useMemo(() => {
        if (!currentUser) return "Teacher";
        const fullName = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim();
        return fullName || currentUser.username || "Teacher";
    }, [currentUser]);

    // MAPEH Subject Detection
    const isMapeh = useMemo(() => {
        if (!activeSelectedClass) return false;
        if (activeSelectedClass.is_mapeh === true || activeSelectedClass.is_mapeh === 1 || activeSelectedClass.is_mapeh === "1") return true;
        const name = activeSelectedClass.subject || activeSelectedClass.subject_name || activeSelectedClass.subjectName || "";
        const code = activeSelectedClass.subject_code || activeSelectedClass.subjectCode || "";
        const str = `${name} ${code}`.toLowerCase();
        return (
            str.includes("mapeh") ||
            str.includes("music") ||
            str.includes("arts") ||
            str.includes("physical education") ||
            str.includes("pe &") ||
            str.includes("health")
        );
    }, [activeSelectedClass]);

    const getDescriptor = (finalGrade) => {
        if (finalGrade === "" || finalGrade === null || finalGrade === undefined || isNaN(finalGrade)) return "";
        const score = parseFloat(finalGrade);
        if (score >= 90) return "Advancing";
        if (score >= 80) return "Benchmarking";
        if (score >= 75) return "Connecting";
        if (score >= 65) return "Developing";
        return "Emerging";
    };

    const getRemark = (finalGrade) => {
        if (finalGrade === "" || finalGrade === null || finalGrade === undefined || isNaN(finalGrade)) return "";
        const score = parseFloat(finalGrade);
        return score >= 75 ? "Passed" : "Failed";
    };

    // Calculate processed term & final grades for a student depending on active tab
    const resolveStudentGrades = (s) => {
        if (!isMapeh) {
            const final = calculateFinalGrade(s.term1, s.term2, s.term3);
            return {
                t1: s.term1 !== undefined && s.term1 !== null ? s.term1 : "",
                t2: s.term2 !== undefined && s.term2 !== null ? s.term2 : "",
                t3: s.term3 !== undefined && s.term3 !== null ? s.term3 : "",
                final,
                descriptor: getDescriptor(final),
                remark: getRemark(final),
            };
        }

        const getMaVal = (termKey, maKey) => {
            if (s[maKey] !== undefined && s[maKey] !== null && s[maKey] !== "") return Number(s[maKey]);
            if (activeMapehTab === "MA" && s[termKey] !== undefined && s[termKey] !== null && s[termKey] !== "") return Number(s[termKey]);
            return "";
        };

        const getPehVal = (termKey, pehKey) => {
            if (s[pehKey] !== undefined && s[pehKey] !== null && s[pehKey] !== "") return Number(s[pehKey]);
            if (activeMapehTab === "PEH" && s[termKey] !== undefined && s[termKey] !== null && s[termKey] !== "") return Number(s[termKey]);
            return "";
        };

        const ma1 = getMaVal("term1", "term1_ma");
        const ma2 = getMaVal("term2", "term2_ma");
        const ma3 = getMaVal("term3", "term3_ma");

        const peh1 = getPehVal("term1", "term1_peh");
        const peh2 = getPehVal("term2", "term2_peh");
        const peh3 = getPehVal("term3", "term3_peh");

        const computeCombinedTerm = (maVal, pehVal, overallVal) => {
            const hasMa = typeof maVal === "number" && !isNaN(maVal);
            const hasPeh = typeof pehVal === "number" && !isNaN(pehVal);
            if (hasMa && hasPeh) return Math.round((maVal + pehVal) / 2);
            if (hasMa) return maVal;
            if (hasPeh) return pehVal;
            if (overallVal !== undefined && overallVal !== null && overallVal !== "" && !isNaN(Number(overallVal))) {
                return Number(overallVal);
            }
            return "";
        };

        const combined1 = computeCombinedTerm(ma1, peh1, s.term1);
        const combined2 = computeCombinedTerm(ma2, peh2, s.term2);
        const combined3 = computeCombinedTerm(ma3, peh3, s.term3);

        if (activeMapehTab === "MA") {
            const final = calculateFinalGrade(ma1, ma2, ma3);
            return { t1: ma1, t2: ma2, t3: ma3, final, descriptor: getDescriptor(final), remark: getRemark(final) };
        }

        if (activeMapehTab === "PEH") {
            const final = calculateFinalGrade(peh1, peh2, peh3);
            return { t1: peh1, t2: peh2, t3: peh3, final, descriptor: getDescriptor(final), remark: getRemark(final) };
        }

        // COMBINED TAB
        const final = calculateFinalGrade(combined1, combined2, combined3);

        return {
            t1_ma: ma1,
            t1_peh: peh1,
            t1_combined: combined1,

            t2_ma: ma2,
            t2_peh: peh2,
            t2_combined: combined2,

            t3_ma: ma3,
            t3_peh: peh3,
            t3_combined: combined3,

            final,
            descriptor: getDescriptor(final),
            remark: getRemark(final),
        };
    };

    const activeClassStudentsList = useMemo(() => {
        const filtered = students.filter((s) => {
            const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
            const matchesSearch = fullName.includes(searchStudentQuery.toLowerCase()) || s.lrn.toString().includes(searchStudentQuery);

            const grades = resolveStudentGrades(s);
            let checkGrade = grades.final;

            if (isMapeh && activeMapehTab === "COMBINED") {
                if (combinedTermFilter === "T1") checkGrade = grades.t1_combined;
                else if (combinedTermFilter === "T2") checkGrade = grades.t2_combined;
                else if (combinedTermFilter === "T3") checkGrade = grades.t3_combined;
            }

            const descriptor = getDescriptor(checkGrade);
            const remark = getRemark(checkGrade);

            return matchesSearch && (filterDescriptor === "All" || descriptor === filterDescriptor) && (filterRemark === "All" || remark === filterRemark);
        });

        return {
            males: filtered.filter((s) => s.sex === "M"),
            females: filtered.filter((s) => s.sex === "F"),
            totalCount: filtered.length,
        };
    }, [students, searchStudentQuery, filterDescriptor, filterRemark, isMapeh, activeMapehTab, combinedTermFilter, calculateFinalGrade]);

    const handleDownloadPDF = async () => {
        let downloadSubject = activeSelectedClass.subject;
        let exportMapehTab = activeMapehTab;

        if (isMapeh) {
            downloadSubject = "MAPEH";
            exportMapehTab = "COMBINED";
        }

        await exportGradingSheetPdf({
            activeSelectedClass,
            students,
            calculateFinalGrade,
            getDescriptor,
            getRemark,
            teacherName,
            isMapeh,
            activeMapehTab: exportMapehTab,
            combinedTermFilter,
            isPrintMode: false,
        });

        if (triggerToast) {
            triggerToast(`Downloaded PDF Grading Sheet for ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName} (${downloadSubject})`, "info");
        }
    };

    const handlePrintSheet = () => {
        let printSubject = activeSelectedClass.subject;
        let exportMapehTab = activeMapehTab;

        if (isMapeh) {
            printSubject = "MAPEH";
            exportMapehTab = "COMBINED";
        }

        exportGradingSheetPdf({
            activeSelectedClass,
            students,
            calculateFinalGrade,
            getDescriptor,
            getRemark,
            teacherName,
            isMapeh,
            activeMapehTab: exportMapehTab,
            combinedTermFilter,
            isPrintMode: true,
        });

        if (triggerToast) {
            triggerToast(`Opening Print Preview for ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName} (${printSubject})`, "info");
        }
    };

    const handleFooterSubmitTrigger = () => {
        onSubmit(activeSelectedClass.id);
    };

    // Calculate submit button disabled state and hover reason
    const { isSubmitDisabled, submitDisabledReason } = useMemo(() => {
        if (activeSelectedClass?.submitted) {
            return { isSubmitDisabled: true, submitDisabledReason: "Grades already submitted (Locked)" };
        }

        if (!currentTermCode) {
            return { isSubmitDisabled: true, submitDisabledReason: "Loading academic term information..." };
        }

        // 1. MAPEH Term Restriction Check: Cannot submit for terms that have already passed or are yet to come
        if (isMapeh) {
            if (activeMapehTab === "COMBINED" && combinedTermFilter !== "All" && combinedTermFilter !== currentTermCode) {
                const termNumStr = combinedTermFilter === "T1" ? "Term 1" : combinedTermFilter === "T2" ? "Term 2" : "Term 3";
                if (combinedTermFilter < currentTermCode) {
                    return {
                        isSubmitDisabled: true,
                        submitDisabledReason: `Cannot submit: ${termNumStr} has already passed. Submissions are only allowed for the active term (${currentTermLabel || "active term"}).`,
                    };
                }
                if (combinedTermFilter > currentTermCode) {
                    return {
                        isSubmitDisabled: true,
                        submitDisabledReason: `Cannot submit: ${termNumStr} is yet to come. Submissions are only allowed for the active term (${currentTermLabel || "active term"}).`,
                    };
                }
            }
        }

        // 2. Incomplete Grades Check for Current Term across all students
        if (!students || students.length === 0) {
            return {
                isSubmitDisabled: true,
                submitDisabledReason: "Cannot submit: No students found in this class.",
            };
        }

        const targetTerm = currentTermCode;
        let missingCount = 0;

        students.forEach((stud) => {
            const grades = resolveStudentGrades(stud);
            let gradeVal = "";

            if (!isMapeh) {
                if (targetTerm === "T1") gradeVal = grades.t1;
                else if (targetTerm === "T2") gradeVal = grades.t2;
                else if (targetTerm === "T3") gradeVal = grades.t3;
            } else {
                if (activeMapehTab === "MA") {
                    if (targetTerm === "T1") gradeVal = grades.t1;
                    else if (targetTerm === "T2") gradeVal = grades.t2;
                    else if (targetTerm === "T3") gradeVal = grades.t3;
                } else if (activeMapehTab === "PEH") {
                    if (targetTerm === "T1") gradeVal = grades.t1;
                    else if (targetTerm === "T2") gradeVal = grades.t2;
                    else if (targetTerm === "T3") gradeVal = grades.t3;
                } else {
                    // COMBINED TAB
                    if (targetTerm === "T1") gradeVal = grades.t1_combined;
                    else if (targetTerm === "T2") gradeVal = grades.t2_combined;
                    else if (targetTerm === "T3") gradeVal = grades.t3_combined;
                }
            }

            const isEmpty = gradeVal === "" || gradeVal === null || gradeVal === undefined || isNaN(Number(gradeVal));
            if (isEmpty) {
                missingCount++;
            }
        });

        if (missingCount > 0) {
            return {
                isSubmitDisabled: true,
                submitDisabledReason: `Cannot submit: Current term (${currentTermLabel || "active term"}) grades are incomplete (${missingCount} student${missingCount > 1 ? "s" : ""} missing grades).`,
            };
        }

        return { isSubmitDisabled: false, submitDisabledReason: "" };
    }, [activeSelectedClass, currentTermCode, currentTermLabel, isMapeh, activeMapehTab, combinedTermFilter, students, resolveStudentGrades]);

    const getDescriptorClass = (desc) => {
        switch (desc) {
            case "Advancing": return "badge-advancing";
            case "Benchmarking": return "badge-benchmarking";
            case "Connecting": return "badge-connecting";
            case "Developing": return "badge-developing";
            case "Emerging": return "badge-emerging";
            default: return "";
        }
    };

    const descriptorOptions = [
        { value: "All", label: "All Descriptors" },
        { value: "Advancing", label: "Advancing (90–100)" },
        { value: "Benchmarking", label: "Benchmarking (80–89)" },
        { value: "Connecting", label: "Connecting (75–79)" },
        { value: "Developing", label: "Developing (65–74)" },
        { value: "Emerging", label: "Emerging (0–64)" },
    ];

    const remarkOptions = [
        { value: "All", label: "All Remarks" },
        { value: "Passed", label: "Passed" },
        { value: "Failed", label: "Failed" },
    ];

    const combinedTermOptions = [
        { value: "T1", label: "Term 1 Summary" },
        { value: "T2", label: "Term 2 Summary" },
        { value: "T3", label: "Term 3 Summary" },
        { value: "All", label: "All Terms (Full Summary)" },
    ];

    const displaySubjectName = useMemo(() => {
        if (!isMapeh) return activeSelectedClass.subject;
        if (activeMapehTab === "MA") return "MAPEH (Music & Arts)";
        if (activeMapehTab === "PEH") return "MAPEH (PE & Health)";
        return "MAPEH";
    }, [isMapeh, activeMapehTab, activeSelectedClass]);

    return (
        <div className="grading-sheet-container">
            <div className="grading-sheet-header-bar">
                <div className="grading-sheet-title-area">
                    <button className="back-btn" onClick={onBack} title="Back to Classes">
                        <img src={backIconUrl} alt="Back" width={17} height={17} />
                    </button>
                    <h1 className="grading-sheet-title" onClick={onBack}>Assigned Classes</h1>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button className="download-btn" onClick={handleDownloadPDF} title="Download PDF Sheet">
                        <Download size={18} />
                        <span>Download PDF</span>
                    </button>

                    <button className="print-btn" onClick={handlePrintSheet} title="Print Grading Sheet">
                        <Printer size={18} />
                        <span>Print</span>
                    </button>
                </div>
            </div>

            {/* MAPEH Sub-Component Pill Navigation (Matching ClassRecord UI) */}
            {isMapeh && (
                <div className="mapeh-component-toggle" role="group" aria-label="MAPEH Component Tab Filter">
                    <button
                        type="button"
                        className={`mapeh-toggle-btn ${activeMapehTab === "MA" ? "active" : ""}`}
                        onClick={() => setActiveMapehTab("MA")}
                    >
                        Music & Arts
                    </button>
                    <button
                        type="button"
                        className={`mapeh-toggle-btn ${activeMapehTab === "PEH" ? "active" : ""}`}
                        onClick={() => setActiveMapehTab("PEH")}
                    >
                        PE & Health
                    </button>
                    <button
                        type="button"
                        className={`mapeh-toggle-btn ${activeMapehTab === "COMBINED" ? "active" : ""}`}
                        onClick={() => setActiveMapehTab("COMBINED")}
                    >
                        MAPEH
                    </button>
                </div>
            )}

            <div className="grading-sheet-subheader-container">
                <div className="total-students-desc">
                    Total students: {activeClassStudentsList.totalCount}
                </div>
                {currentTermLabel ? (
                    <div className="current-term-badge" title="Currently Active Grading Term">
                        <Calendar size={15} />
                        <span>Current Term: <strong>{currentTermLabel}</strong></span>
                    </div>
                ) : null}
            </div>

            <div className="grading-filters-row">
                <div className="grading-filters-left">
                    <div className="grading-filters-text">Filters: </div>
                    <SelectFilter
                        value={filterDescriptor}
                        onChange={setFilterDescriptor}
                        options={descriptorOptions}
                        minWidth="150px"
                    />

                    <SelectFilter
                        value={filterRemark}
                        onChange={setFilterRemark}
                        options={remarkOptions}
                        minWidth="130px"
                    />

                    {isMapeh && activeMapehTab === "COMBINED" && (
                        <SelectFilter
                            value={combinedTermFilter}
                            onChange={setCombinedTermFilter}
                            options={combinedTermOptions}
                            minWidth="170px"
                        />
                    )}
                </div>

                <div className="grading-filters-right">
                    <SearchBar
                        query={searchStudentQuery}
                        setQuery={setSearchStudentQuery}
                        placeholder="Search student names or LRN..."
                    />
                </div>

                {activeSelectedClass.submitted && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#d1fae5",
                            color: "#065f46",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: "600",
                        }}
                    >
                        <Check size={16} />
                        <span>Grades Submitted (Locked)</span>
                    </div>
                )}
            </div>

            <div className="table-wrapper">
                <table className="grading-table">
                    <thead>
                        <tr className="grading-header-row-1">
                            <th style={{ borderRight: "1px solid #e2e8f0", borderBottom: "none", backgroundColor: "#f8fafc" }}></th>
                            <th colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "6" : isMapeh && activeMapehTab === "COMBINED" ? "2" : "3"} className="border-bottom-line">
                                Grade and section: <span className="info-cell-title">{activeSelectedClass.gradeLevel} - {activeSelectedClass.sectionName}</span>
                            </th>
                            <th colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "6" : "3"} className="border-bottom-line">
                                School year: <span className="info-cell-title">2026-2027</span>
                                {currentTermLabel ? (
                                    <>
                                        <span style={{ margin: "0 8px", color: "#cbd5e1" }}>|</span>
                                        Current Term: <span className="info-cell-title">{currentTermLabel}</span>
                                    </>
                                ) : null}
                            </th>
                        </tr>
                        <tr className="grading-header-row-2">
                            <th style={{ textTransform: "uppercase", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", borderRight: "1px solid #e2e8f0", textAlign: "center", color: "#475569" }}>
                                learners' names
                            </th>
                            <th colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "6" : isMapeh && activeMapehTab === "COMBINED" ? "2" : "3"}>
                                Teacher: <span className="info-cell-title">{teacherName}</span>
                            </th>
                            <th colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "6" : "3"}>
                                Subject: <span className="info-cell-title">{displaySubjectName}</span>
                            </th>
                        </tr>

                        {/* RENDER TABLE HEADERS SPECIFIC TO VIEW MODE */}
                        {isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter !== "All" ? (
                            <tr className="grading-header-row-3">
                                <th style={{ borderRight: "1px solid #e2e8f0", backgroundColor: "#f1f5f9" }}></th>
                                <th>MUSIC &amp; ARTS ({combinedTermFilter === "T1" ? "TERM 1" : combinedTermFilter === "T2" ? "TERM 2" : "TERM 3"})</th>
                                <th>PE &amp; HEALTH ({combinedTermFilter === "T1" ? "TERM 1" : combinedTermFilter === "T2" ? "TERM 2" : "TERM 3"})</th>
                                <th>MAPEH ({combinedTermFilter === "T1" ? "TERM 1 GRADE" : combinedTermFilter === "T2" ? "TERM 2 GRADE" : "TERM 3 GRADE"})</th>
                                <th>Descriptor</th>
                                <th>Remark</th>
                            </tr>
                        ) : isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? (
                            <>
                                <tr className="grading-header-row-3">
                                    <th rowSpan="2" style={{ borderRight: "1px solid #e2e8f0", backgroundColor: "#f1f5f9", verticalAlign: "middle" }}></th>
                                    <th colSpan="3" className="combined-term-header">TERM 1</th>
                                    <th colSpan="3" className="combined-term-header">TERM 2</th>
                                    <th colSpan="3" className="combined-term-header">TERM 3</th>
                                    <th rowSpan="2" style={{ verticalAlign: "middle", backgroundColor: "#f1f5f9" }}>Final Grade</th>
                                    <th rowSpan="2" style={{ verticalAlign: "middle", backgroundColor: "#f1f5f9" }}>Descriptor</th>
                                    <th rowSpan="2" style={{ verticalAlign: "middle", backgroundColor: "#f1f5f9" }}>Remark</th>
                                </tr>
                                <tr>
                                    <th className="combined-sub-header">M&amp;A</th>
                                    <th className="combined-sub-header">PE&amp;H</th>
                                    <th className="combined-sub-header combined-grade-highlight">MAPEH</th>

                                    <th className="combined-sub-header">M&amp;A</th>
                                    <th className="combined-sub-header">PE&amp;H</th>
                                    <th className="combined-sub-header combined-grade-highlight">MAPEH</th>

                                    <th className="combined-sub-header">M&amp;A</th>
                                    <th className="combined-sub-header">PE&amp;H</th>
                                    <th className="combined-sub-header combined-grade-highlight">MAPEH</th>
                                </tr>
                            </>
                        ) : (
                            <tr className="grading-header-row-3">
                                <th style={{ borderRight: "1px solid #e2e8f0", backgroundColor: "#f1f5f9" }}></th>
                                <th>Term 1</th>
                                <th>Term 2</th>
                                <th>Term 3</th>
                                <th>Final Grade</th>
                                <th>Descriptor</th>
                                <th>Remark</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {/* ----------------- MALE GROUP ----------------- */}
                        <tr className="sex-header-row">
                            <td colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "13" : isMapeh && activeMapehTab === "COMBINED" ? "6" : "7"} className="sex-header-cell">
                                Male
                            </td>
                        </tr>

                        {activeClassStudentsList.males.length === 0 ? (
                            <tr>
                                <td colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "13" : isMapeh && activeMapehTab === "COMBINED" ? "6" : "7"} style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic", padding: "16px" }}>
                                    No male students matching filters
                                </td>
                            </tr>
                        ) : (
                            activeClassStudentsList.males.map((stud) => {
                                const grades = resolveStudentGrades(stud);

                                if (isMapeh && activeMapehTab === "COMBINED") {
                                    if (combinedTermFilter === "T1" || combinedTermFilter === "T2" || combinedTermFilter === "T3") {
                                        const termNum = combinedTermFilter;
                                        const maVal = termNum === "T1" ? grades.t1_ma : termNum === "T2" ? grades.t2_ma : grades.t3_ma;
                                        const pehVal = termNum === "T1" ? grades.t1_peh : termNum === "T2" ? grades.t2_peh : grades.t3_peh;
                                        const combinedVal = termNum === "T1" ? grades.t1_combined : termNum === "T2" ? grades.t2_combined : grades.t3_combined;
                                        const descriptor = getDescriptor(combinedVal);
                                        const remark = getRemark(combinedVal);

                                        return (
                                            <tr key={stud.id} className="student-data-row">
                                                <td className="student-name-cell">
                                                    <span className="student-full-name">
                                                        {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                                    </span>
                                                    <span className="student-lrn">LRN: {stud.lrn}</span>
                                                </td>
                                                <td className="grade-value-cell">{maVal}</td>
                                                <td className="grade-value-cell">{pehVal}</td>
                                                <td className="final-grade-cell combined-grade-highlight">{combinedVal}</td>
                                                <td className="descriptor-cell">
                                                    {combinedVal && <span className={`badge ${getDescriptorClass(descriptor)}`}>{descriptor}</span>}
                                                </td>
                                                <td className="remark-cell">
                                                    {combinedVal && <span className={`badge ${remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{remark}</span>}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Combined Sheet — ALL TERMS summary view
                                    return (
                                        <tr key={stud.id} className="student-data-row">
                                            <td className="student-name-cell">
                                                <span className="student-full-name">
                                                    {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                                </span>
                                                <span className="student-lrn">LRN: {stud.lrn}</span>
                                            </td>

                                            {/* Term 1 */}
                                            <td className="grade-value-cell">{grades.t1_ma}</td>
                                            <td className="grade-value-cell">{grades.t1_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t1_combined}</td>

                                            {/* Term 2 */}
                                            <td className="grade-value-cell">{grades.t2_ma}</td>
                                            <td className="grade-value-cell">{grades.t2_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t2_combined}</td>

                                            {/* Term 3 */}
                                            <td className="grade-value-cell">{grades.t3_ma}</td>
                                            <td className="grade-value-cell">{grades.t3_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t3_combined}</td>

                                            {/* Final */}
                                            <td className="final-grade-cell">{grades.final}</td>
                                            <td className="descriptor-cell">
                                                {grades.final && <span className={`badge ${getDescriptorClass(grades.descriptor)}`}>{grades.descriptor}</span>}
                                            </td>
                                            <td className="remark-cell">
                                                {grades.final && <span className={`badge ${grades.remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{grades.remark}</span>}
                                            </td>
                                        </tr>
                                    );
                                }

                                // STANDARD SUBJECT OR SINGLE MAPEH COMPONENT TAB (MA / PEH)
                                return (
                                    <tr key={stud.id} className="student-data-row">
                                        <td className="student-name-cell">
                                            <span className="student-full-name">
                                                {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                            </span>
                                            <span className="student-lrn">LRN: {stud.lrn}</span>
                                        </td>
                                        <td className="grade-value-cell">{grades.t1}</td>
                                        <td className="grade-value-cell">{grades.t2}</td>
                                        <td className="grade-value-cell">{grades.t3}</td>
                                        <td className="final-grade-cell">{grades.final}</td>
                                        <td className="descriptor-cell">
                                            {grades.final && <span className={`badge ${getDescriptorClass(grades.descriptor)}`}>{grades.descriptor}</span>}
                                        </td>
                                        <td className="remark-cell">
                                            {grades.final && <span className={`badge ${grades.remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{grades.remark}</span>}
                                        </td>
                                    </tr>
                                );
                            })
                        )}

                        {/* ----------------- FEMALE GROUP ----------------- */}
                        <tr className="sex-header-row" style={{ borderTop: "2px solid #cbd5e1" }}>
                            <td colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "13" : isMapeh && activeMapehTab === "COMBINED" ? "6" : "7"} className="sex-header-cell">
                                Female
                            </td>
                        </tr>

                        {activeClassStudentsList.females.length === 0 ? (
                            <tr>
                                <td colSpan={isMapeh && activeMapehTab === "COMBINED" && combinedTermFilter === "All" ? "13" : isMapeh && activeMapehTab === "COMBINED" ? "6" : "7"} style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic", padding: "16px" }}>
                                    No female students matching filters
                                </td>
                            </tr>
                        ) : (
                            activeClassStudentsList.females.map((stud) => {
                                const grades = resolveStudentGrades(stud);

                                if (isMapeh && activeMapehTab === "COMBINED") {
                                    if (combinedTermFilter === "T1" || combinedTermFilter === "T2" || combinedTermFilter === "T3") {
                                        const termNum = combinedTermFilter;
                                        const maVal = termNum === "T1" ? grades.t1_ma : termNum === "T2" ? grades.t2_ma : grades.t3_ma;
                                        const pehVal = termNum === "T1" ? grades.t1_peh : termNum === "T2" ? grades.t2_peh : grades.t3_peh;
                                        const combinedVal = termNum === "T1" ? grades.t1_combined : termNum === "T2" ? grades.t2_combined : grades.t3_combined;
                                        const descriptor = getDescriptor(combinedVal);
                                        const remark = getRemark(combinedVal);

                                        return (
                                            <tr key={stud.id} className="student-data-row">
                                                <td className="student-name-cell">
                                                    <span className="student-full-name">
                                                        {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                                    </span>
                                                    <span className="student-lrn">LRN: {stud.lrn}</span>
                                                </td>
                                                <td className="grade-value-cell">{maVal}</td>
                                                <td className="grade-value-cell">{pehVal}</td>
                                                <td className="final-grade-cell combined-grade-highlight">{combinedVal}</td>
                                                <td className="descriptor-cell">
                                                    {combinedVal && <span className={`badge ${getDescriptorClass(descriptor)}`}>{descriptor}</span>}
                                                </td>
                                                <td className="remark-cell">
                                                    {combinedVal && <span className={`badge ${remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{remark}</span>}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Combined Sheet — ALL TERMS summary view
                                    return (
                                        <tr key={stud.id} className="student-data-row">
                                            <td className="student-name-cell">
                                                <span className="student-full-name">
                                                    {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                                </span>
                                                <span className="student-lrn">LRN: {stud.lrn}</span>
                                            </td>

                                            {/* Term 1 */}
                                            <td className="grade-value-cell">{grades.t1_ma}</td>
                                            <td className="grade-value-cell">{grades.t1_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t1_combined}</td>

                                            {/* Term 2 */}
                                            <td className="grade-value-cell">{grades.t2_ma}</td>
                                            <td className="grade-value-cell">{grades.t2_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t2_combined}</td>

                                            {/* Term 3 */}
                                            <td className="grade-value-cell">{grades.t3_ma}</td>
                                            <td className="grade-value-cell">{grades.t3_peh}</td>
                                            <td className="grade-value-cell combined-grade-highlight">{grades.t3_combined}</td>

                                            {/* Final */}
                                            <td className="final-grade-cell">{grades.final}</td>
                                            <td className="descriptor-cell">
                                                {grades.final && <span className={`badge ${getDescriptorClass(grades.descriptor)}`}>{grades.descriptor}</span>}
                                            </td>
                                            <td className="remark-cell">
                                                {grades.final && <span className={`badge ${grades.remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{grades.remark}</span>}
                                            </td>
                                        </tr>
                                    );
                                }

                                // STANDARD SUBJECT OR SINGLE MAPEH COMPONENT TAB (MA / PEH)
                                return (
                                    <tr key={stud.id} className="student-data-row">
                                        <td className="student-name-cell">
                                            <span className="student-full-name">
                                                {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                            </span>
                                            <span className="student-lrn">LRN: {stud.lrn}</span>
                                        </td>
                                        <td className="grade-value-cell">{grades.t1}</td>
                                        <td className="grade-value-cell">{grades.t2}</td>
                                        <td className="grade-value-cell">{grades.t3}</td>
                                        <td className="final-grade-cell">{grades.final}</td>
                                        <td className="descriptor-cell">
                                            {grades.final && <span className={`badge ${getDescriptorClass(grades.descriptor)}`}>{grades.descriptor}</span>}
                                        </td>
                                        <td className="remark-cell">
                                            {grades.final && <span className={`badge ${grades.remark === "Passed" ? "badge-passed" : "badge-failed"}`}>{grades.remark}</span>}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Sticky Bottom Submission Action Bar */}
            <SubmissionFooter
                deadline={activeSelectedClass.deadline}
                isSubmitted={activeSelectedClass.submitted}
                onSubmit={handleFooterSubmitTrigger}
                userRole={userRole}
                disabled={isSubmitDisabled}
                disabledReason={submitDisabledReason}
            />
        </div>
    );
}