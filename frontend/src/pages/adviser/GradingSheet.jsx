import { useState, useMemo } from "react";
import { ArrowLeft, Download, Calendar } from "lucide-react";
import GradingFilters from "../../components/sections/GradingFilters";
import { downloadGradingSheetCSV } from "../../utils/downloadHelper";
import "../../styles/gradingSheet.css";


export default function GradingSheet({
    selectedClass,
    students,
    onBack,
    triggerToast,
    calculateFinalGrade,
    onSubmit,
}) {
    const [searchStudentQuery, setSearchStudentQuery] = useState("");
    const [filterDescriptor, setFilterDescriptor] = useState("All");
    const [filterRemark, setFilterRemark] = useState("All");

    const getDescriptor = (finalGrade) => {
        if (finalGrade === "" || isNaN(finalGrade)) return "";
        const score = parseFloat(finalGrade);
        if (score >= 90) return "Outstanding";
        if (score >= 85) return "Very Satisfactory";
        if (score >= 80) return "Satisfactory";
        if (score >= 75) return "Fairly Satisfactory";
        return "Did Not Meet Expectations";
    };

    const getRemark = (finalGrade) => {
        if (finalGrade === "" || isNaN(finalGrade)) return "";
        const score = parseFloat(finalGrade);
        return score >= 75 ? "Passed" : "Failed";
    };

    const activeClassStudentsList = useMemo(() => {
        const filtered = students.filter((s) => {
            const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
            const matchesSearch = fullName.includes(searchStudentQuery.toLowerCase()) || s.lrn.toString().includes(searchStudentQuery);
            const finalGrade = calculateFinalGrade(s.term1, s.term2, s.term3);
            const descriptor = getDescriptor(finalGrade);
            const remark = getRemark(finalGrade);

            return matchesSearch && (filterDescriptor === "All" || descriptor === filterDescriptor) && (filterRemark === "All" || remark === filterRemark);
        });

        return {
            males: filtered.filter((s) => s.sex === "M"),
            females: filtered.filter((s) => s.sex === "F"),
            totalCount: filtered.length,
        };
    }, [students, searchStudentQuery, filterDescriptor, filterRemark, calculateFinalGrade]);

    const handleDownloadSheet = () => {
        downloadGradingSheetCSV(selectedClass, students, calculateFinalGrade, getDescriptor, getRemark);
        triggerToast(`Downloaded CSV Grading Sheet for ${selectedClass.gradeLevel} - ${selectedClass.sectionName}`, "info");
    };

    const getDescriptorClass = (desc) => {
        switch (desc) {
            case "Outstanding": return "badge-outstanding";
            case "Very Satisfactory": return "badge-very-satisfactory";
            case "Satisfactory": return "badge-satisfactory";
            case "Fairly Satisfactory": return "badge-fairly-satisfactory";
            case "Did Not Meet Expectations": return "badge-did-not-meet";
            default: return "";
        }
    };

    return (
        <div className="grading-sheet-container">
            <div className="grading-sheet-header-bar">
                <div className="grading-sheet-title-area">
                    <button className="back-btn" onClick={onBack} title="Back to Classes">
                        <ArrowLeft size={18} />
                    </button>
                    <h1 className="grading-sheet-title">Assigned Classes</h1>
                </div>

                <button className="download-btn" onClick={handleDownloadSheet} title="Download Sheet">
                    <Download size={18} />
                    <span>Download</span>
                </button>
            </div>

            <div className="total-students-desc">
                Total students: {activeClassStudentsList.totalCount}
            </div>

            <GradingFilters
                searchStudentQuery={searchStudentQuery}
                setSearchStudentQuery={setSearchStudentQuery}
                filterDescriptor={filterDescriptor}
                setFilterDescriptor={setFilterDescriptor}
                filterRemark={filterRemark}
                setFilterRemark={setFilterRemark}
                submitted={selectedClass.submitted}
            />

            <div className="table-wrapper">
                <table className="grading-table">
                    <thead>
                        <tr className="grading-header-row-1">
                            {/* FIX 1: Removed bottom border from the top-left corner box to stop line bleeding into row 2 */}
                            <th style={{ borderRight: "1px solid #e2e8f0", borderBottom: "none", backgroundColor: "#f8fafc" }}></th>
                            <th colSpan="3" className="border-bottom-line">
                                Grade and section: <span className="info-cell-title">{selectedClass.gradeLevel} - {selectedClass.sectionName}</span>
                            </th>
                            <th colSpan="3" className="border-bottom-line">
                                School year: <span className="info-cell-title">2026-2027</span>
                            </th>
                        </tr>
                        <tr className="grading-header-row-2">
                            {/* FIX 2: Explicitly centered text alignment properties implemented here */}
                            <th style={{ textTransform: "uppercase", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", borderRight: "1px solid #e2e8f0", textAlign: "center", color: "#475569" }}>
                                learners' names
                            </th>
                            <th colSpan="3">
                                Teacher: <span className="info-cell-title">Harvey Babia</span>
                            </th>
                            <th colSpan="3">
                                Subject: <span className="info-cell-title">{selectedClass.subject}</span>
                            </th>
                        </tr>
                        <tr className="grading-header-row-3">
                            <th style={{ borderRight: "1px solid #e2e8f0", backgroundColor: "#f1f5f9" }}></th>
                            <th>Term 1</th>
                            <th>Term 2</th>
                            <th>Term 3</th>
                            <th>Final Grade</th>
                            <th>Descriptor</th>
                            <th>Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* ----------------- MALE GROUP ----------------- */}
                        <tr className="sex-header-row"><td colSpan="7" className="sex-header-cell">Male</td></tr>
                        {activeClassStudentsList.males.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic", padding: "16px" }}>No male students matching filters</td></tr>
                        ) : (
                            activeClassStudentsList.males.map((stud) => {
                                const final = calculateFinalGrade(stud.term1, stud.term2, stud.term3);
                                return (
                                    <tr key={stud.id} className="student-data-row">
                                        <td className="student-name-cell">
                                            {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                            <span className="student-lrn">LRN: {stud.lrn}</span>
                                        </td>
                                        <td className="grade-value-cell">{stud.term1}</td>
                                        <td className="grade-value-cell">{stud.term2}</td>
                                        <td className="grade-value-cell">{stud.term3}</td>
                                        <td className="final-grade-cell">{final}</td>
                                        <td className="descriptor-cell">{final && <span className={`badge ${getDescriptorClass(getDescriptor(final))}`}>{getDescriptor(final)}</span>}</td>
                                        <td className="remark-cell">{final && <span className={`badge ${getRemark(final) === "Passed" ? "badge-passed" : "badge-failed"}`}>{getRemark(final)}</span>}</td>
                                    </tr>
                                );
                            })
                        )}

                        {/* ----------------- FEMALE GROUP ----------------- */}
                        <tr className="sex-header-row" style={{ borderTop: "2px solid #cbd5e1" }}><td colSpan="7" className="sex-header-cell">Female</td></tr>
                        {activeClassStudentsList.females.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: "center", color: "#94a3b8", fontStyle: "italic", padding: "16px" }}>No female students matching filters</td></tr>
                        ) : (
                            activeClassStudentsList.females.map((stud) => {
                                const final = calculateFinalGrade(stud.term1, stud.term2, stud.term3);
                                return (
                                    <tr key={stud.id} className="student-data-row">
                                        <td className="student-name-cell">
                                            {stud.lastName}, {stud.firstName} {stud.middleName ? `${stud.middleName.charAt(0)}.` : ""}
                                            <span className="student-lrn">LRN: {stud.lrn}</span>
                                        </td>
                                        <td className="grade-value-cell">{stud.term1}</td>
                                        <td className="grade-value-cell">{stud.term2}</td>
                                        <td className="grade-value-cell">{stud.term3}</td>
                                        <td className="final-grade-cell">{final}</td>
                                        <td className="descriptor-cell">{final && <span className={`badge ${getDescriptorClass(getDescriptor(final))}`}>{getDescriptor(final)}</span>}</td>
                                        <td className="remark-cell">{final && <span className={`badge ${getRemark(final) === "Passed" ? "badge-passed" : "badge-failed"}`}>{getRemark(final)}</span>}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Sticky Bottom Actions Bar */}
            <div className="persistent-footer">
                <div className="deadline-text-area">
                    <Calendar size={18} style={{ color: "#ef4444" }} />
                    <span>Submission Deadline:</span>
                    <span className="deadline-date">
                        {new Date(selectedClass.deadline).toLocaleDateString("en-US", {
                            month: "long", day: "numeric", year: "numeric",
                        })}
                    </span>
                </div>

                {/* FIX 3: Still renders an active interactive submit button even during view-only operations */}
                <button
                    onClick={() => onSubmit(selectedClass.id)}
                    disabled={selectedClass.submitted}
                    className={`submit-btn ${selectedClass.submitted ? "submitted-state" : ""}`}
                >
                    <span>{selectedClass.submitted ? "Grades Submitted" : "Submit Grades"}</span>
                </button>
            </div>
        </div>
    );
}