import { useState, useMemo } from "react";
import { Download } from "lucide-react";
import { Check } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import SearchBar from "../../components/SearchBar";
import SelectFilter from "../../components/SelectFilter";
import SubmissionFooter from "../../components/SubmissionFooter.jsx"; // Integrated here
import { downloadGradingSheetCSV } from "../../utils/downloadHelper";
import "../../styles/gradingSheet.css";

export default function GradingSheet({
    activeSelectedClass,
    students,
    onBack,
    triggerToast,
    calculateFinalGrade,
    onSubmit,
    userRole = "teacher", // Expecting context mapping from user session state
}) {
    const [searchStudentQuery, setSearchStudentQuery] = useState("");
    const [filterDescriptor, setFilterDescriptor] = useState("All");
    const [filterRemark, setFilterRemark] = useState("All");

    const getDescriptor = (finalGrade) => {
        if (finalGrade === "" || isNaN(finalGrade)) return "";

        const score = parseFloat(finalGrade);

        if (score >= 90) return "Advancing";
        if (score >= 80) return "Benchmarking";
        if (score >= 75) return "Connecting";
        if (score >= 65) return "Developing";
        return "Emerging";
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
        downloadGradingSheetCSV(activeSelectedClass, students, calculateFinalGrade, getDescriptor, getRemark);
        triggerToast(`Downloaded CSV Grading Sheet for ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName}`, "info");
    };

    // Central modal pipeline interceptor
    const handleFooterSubmitTrigger = () => {
        // You can run localized confirmation flags here depending on role mechanics
        if (userRole === "admin") {
            console.log("Triggering Administrative master overwrite alert dialog...");
            // e.g., openModal({ variant: "admin-lock" })
        } else {
            console.log("Triggering standard verification modal alert dialog...");
        }

        // Call standard database/prop submission pipeline
        onSubmit(activeSelectedClass.id);
    };

    const getDescriptorClass = (desc) => {
        switch (desc) {
            case "Advancing":
                return "badge-advancing";
            case "Benchmarking":
                return "badge-benchmarking";
            case "Connecting":
                return "badge-connecting";
            case "Developing":
                return "badge-developing";
            case "Emerging":
                return "badge-emerging";
            default:
                return "";
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
                            <th colSpan="3" className="border-bottom-line">
                                Grade and section: <span className="info-cell-title">{activeSelectedClass.gradeLevel} - {activeSelectedClass.sectionName}</span>
                            </th>
                            <th colSpan="3" className="border-bottom-line">
                                School year: <span className="info-cell-title">2026-2027</span>
                            </th>
                        </tr>
                        <tr className="grading-header-row-2">
                            <th style={{ textTransform: "uppercase", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", borderRight: "1px solid #e2e8f0", textAlign: "center", color: "#475569" }}>
                                learners' names
                            </th>
                            <th colSpan="3">
                                Teacher: <span className="info-cell-title">Harvey Babia</span>
                            </th>
                            <th colSpan="3">
                                Subject: <span className="info-cell-title">{activeSelectedClass.subject}</span>
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

            {/* Custom Separated Sticky Bottom Action Bar Injection */}
            <SubmissionFooter
                deadline={activeSelectedClass.deadline}
                isSubmitted={activeSelectedClass.submitted}
                onSubmit={handleFooterSubmitTrigger}
                userRole={userRole}
            />
        </div>
    );
}