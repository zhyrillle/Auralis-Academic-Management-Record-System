import { useState, useMemo } from "react";
import { Download, Check } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import SubmissionFooter from "../../components/common/SubmissionFooter.jsx";
import { downloadGradingSheetCSV } from "../../utils/downloadHelper";
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

    // MAPEH Tab State: 'MA' (Music & Arts), 'PEH' (PE & Health), 'COMBINED' (Combined MAPEH)
    const [activeMapehTab, setActiveMapehTab] = useState("MA");
    // Combined Sheet Term Selector: 'T1', 'T2', 'T3', 'All'
    const [combinedTermFilter, setCombinedTermFilter] = useState("T1");

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

    const handleDownloadSheet = async () => {
        let downloadSubject = activeSelectedClass.subject;
        if (isMapeh) {
            if (activeMapehTab === "MA") downloadSubject = "MAPEH - Music & Arts";
            else if (activeMapehTab === "PEH") downloadSubject = "MAPEH - PE & Health";
            else downloadSubject = "MAPEH";
        }

        const preparedStudents = students.map((s) => {
            const grades = resolveStudentGrades(s);
            if (!isMapeh || activeMapehTab !== "COMBINED") {
                return { ...s, term1: grades.t1, term2: grades.t2, term3: grades.t3 };
            }
            return { ...s, term1: grades.t1_combined, term2: grades.t2_combined, term3: grades.t3_combined };
        });

        const updatedClassMeta = { ...activeSelectedClass, subject: downloadSubject };

        await downloadGradingSheetCSV(updatedClassMeta, preparedStudents, calculateFinalGrade, getDescriptor, getRemark, teacherName);
        triggerToast(`Downloaded Excel Grading Sheet for ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName} (${downloadSubject})`, "info");
    };

    const handleFooterSubmitTrigger = () => {
        onSubmit(activeSelectedClass.id);
    };

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

                <button className="download-btn" onClick={handleDownloadSheet} title="Download Sheet">
                    <Download size={18} />
                    <span>Download</span>
                </button>
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

            <div className="total-students-desc">
                Total students: {activeClassStudentsList.totalCount}
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
            />
        </div>
    );
}