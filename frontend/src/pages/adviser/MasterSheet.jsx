import React, { useState, useMemo } from "react";
import { Download } from "lucide-react";
import SearchBar from "../../components/common/SearchBar.jsx";
import SubmissionFooter from "../../components/common/SubmissionFooter.jsx";
import "../../styles/masterSheet.css";

// ──────────────────────────────────────────────
// Subject definitions
// ──────────────────────────────────────────────
const SUBJECTS = [
    { key: "english", label: "English" },
    { key: "filipino", label: "Filipino" },
    { key: "math", label: "Mathematics" },
    { key: "science", label: "Science" },
    { key: "araling", label: "Araling Panlipunan" },
    { key: "edukasyon", label: "Edukasyon sa Pagpapakatao" },
    { key: "mapeh", label: "MAPEH" },
    { key: "tle", label: "Technology & Livelihood Education" },
];

// ──────────────────────────────────────────────
// Mock student data with grades per subject
// ──────────────────────────────────────────────
const MOCK_STUDENTS = [
    {
        id: 1, sex: "M",
        lastName: "Santos", firstName: "Juan", middleName: "Dela Cruz",
        lrn: "100123456789",
        english: { t1: 88, t2: 90, t3: 87 },
        filipino: { t1: 91, t2: 85, t3: 89 },
        math: { t1: 76, t2: 80, t3: 78 },
        science: { t1: 84, t2: 82, t3: 86 },
        araling: { t1: 90, t2: 88, t3: 92 },
        edukasyon: { t1: 95, t2: 93, t3: 94 },
        mapeh: { t1: 87, t2: 89, t3: 88 },
        tle: { t1: 82, t2: 85, t3: 83 },
    },
    {
        id: 2, sex: "M",
        lastName: "Reyes", firstName: "Marco", middleName: "Andres",
        lrn: "100123456790",
        english: { t1: 72, t2: 70, t3: 74 },
        filipino: { t1: 78, t2: 80, t3: 76 },
        math: { t1: 65, t2: 68, t3: 67 },
        science: { t1: 70, t2: 73, t3: 71 },
        araling: { t1: 80, t2: 78, t3: 79 },
        edukasyon: { t1: 85, t2: 83, t3: 84 },
        mapeh: { t1: 75, t2: 77, t3: 76 },
        tle: { t1: 70, t2: 72, t3: 71 },
    },
    {
        id: 3, sex: "M",
        lastName: "Villanueva", firstName: "Carlo", middleName: "Luis",
        lrn: "100123456791",
        english: { t1: 93, t2: 95, t3: 94 },
        filipino: { t1: 90, t2: 92, t3: 91 },
        math: { t1: 88, t2: 90, t3: 89 },
        science: { t1: 91, t2: 93, t3: 92 },
        araling: { t1: 94, t2: 92, t3: 93 },
        edukasyon: { t1: 96, t2: 97, t3: 95 },
        mapeh: { t1: 89, t2: 91, t3: 90 },
        tle: { t1: 88, t2: 90, t3: 89 },
    },
    {
        id: 4, sex: "F",
        lastName: "Garcia", firstName: "Maria", middleName: "Cruz",
        lrn: "100123456792",
        english: { t1: 95, t2: 97, t3: 96 },
        filipino: { t1: 93, t2: 95, t3: 94 },
        math: { t1: 91, t2: 93, t3: 92 },
        science: { t1: 94, t2: 96, t3: 95 },
        araling: { t1: 97, t2: 95, t3: 96 },
        edukasyon: { t1: 98, t2: 99, t3: 97 },
        mapeh: { t1: 93, t2: 95, t3: 94 },
        tle: { t1: 91, t2: 93, t3: 92 },
    },
    {
        id: 5, sex: "F",
        lastName: "Torres", firstName: "Ana", middleName: "Belen",
        lrn: "100123456793",
        english: { t1: 80, t2: 82, t3: 81 },
        filipino: { t1: 83, t2: 85, t3: 84 },
        math: { t1: 77, t2: 79, t3: 78 },
        science: { t1: 81, t2: 83, t3: 82 },
        araling: { t1: 85, t2: 83, t3: 84 },
        edukasyon: { t1: 88, t2: 90, t3: 89 },
        mapeh: { t1: 82, t2: 84, t3: 83 },
        tle: { t1: 79, t2: 81, t3: 80 },
    },
    {
        id: 6, sex: "F",
        lastName: "Mendoza", firstName: "Liza", middleName: "Reyes",
        lrn: "100123456794",
        english: { t1: 62, t2: 60, t3: 64 },
        filipino: { t1: 68, t2: 70, t3: 66 },
        math: { t1: 55, t2: 58, t3: 57 },
        science: { t1: 63, t2: 61, t3: 65 },
        araling: { t1: 70, t2: 68, t3: 69 },
        edukasyon: { t1: 73, t2: 75, t3: 74 },
        mapeh: { t1: 65, t2: 67, t3: 66 },
        tle: { t1: 62, t2: 64, t3: 63 },
    },
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const calcFinal = ({ t1, t2, t3 }) => {
    if (!t1 && !t2 && !t3) return "";
    const avg = (t1 + t2 + t3) / 3;
    return Math.round(avg);
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export default function MasterSheet() {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);

    // ── Mock class info ──
    const classInfo = {
        gradeLevel: "Grade 7",
        sectionName: "Sampaguita",
        schoolYear: "2026–2027",
        adviser: "Harvey Babia",
        deadline: "2026-09-30",
    };

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        const all = MOCK_STUDENTS.filter((s) => {
            const name = `${s.firstName} ${s.lastName}`.toLowerCase();
            return name.includes(q) || s.lrn.includes(q);
        });
        return {
            males: all.filter((s) => s.sex === "M"),
            females: all.filter((s) => s.sex === "F"),
            total: all.length,
        };
    }, [searchQuery]);

    const handleDownload = () => {
        // CSV download placeholder
        const headers = [
            "Name", "LRN",
            ...SUBJECTS.flatMap((s) => [
                `${s.label} T1`, `${s.label} T2`, `${s.label} T3`, `${s.label} Final`,
            ]),
        ];
        const rows = MOCK_STUDENTS.map((s) => [
            `${s.lastName}, ${s.firstName}`,
            s.lrn,
            ...SUBJECTS.flatMap((sub) => {
                const g = s[sub.key];
                return [g.t1, g.t2, g.t3, calcFinal(g)];
            }),
        ]);
        const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mastersheet_${classInfo.gradeLevel}_${classInfo.sectionName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderStudentRows = (students, fallbackLabel) => {
        if (students.length === 0) {
            return (
                <tr>
                    <td
                        colSpan={3 + SUBJECTS.length * 4}
                        className="ms-empty-row"
                    >
                        No {fallbackLabel} students found
                    </td>
                </tr>
            );
        }
        return students.map((s) => {
            // Compute each subject's final grade, then average them all
            const finalGrades = SUBJECTS.map((sub) => calcFinal(s[sub.key])).filter((f) => f !== "");
            const genAvg = finalGrades.length > 0
                ? Math.round(finalGrades.reduce((a, b) => a + b, 0) / finalGrades.length)
                : "";

            return (
                <tr key={s.id} className="ms-student-row">
                    <td className="ms-name-cell">
                        {s.lastName}, {s.firstName}{" "}
                        {s.middleName ? `${s.middleName.charAt(0)}.` : ""}
                        <span className="ms-lrn">LRN: {s.lrn}</span>
                    </td>
                    {SUBJECTS.map((sub) => {
                        const g = s[sub.key];
                        const final = calcFinal(g);
                        return (
                            <React.Fragment key={`${s.id}-${sub.key}`}>
                                <td className="ms-grade-cell">{g.t1}</td>
                                <td className="ms-grade-cell">{g.t2}</td>
                                <td className="ms-grade-cell">{g.t3}</td>
                                <td className="ms-final-cell">{final}</td>
                            </React.Fragment>
                        );
                    })}
                    <td className="ms-gen-avg-cell">{genAvg}</td>
                </tr>
            );
        });
    };

    return (
        <div className="ms-container">

            <h1 className="header">Mahogany</h1>
            {/* ── Top controls row ── */}
            <div className="ms-controls-row">
                <div className="cr-left">
                    <div className="ms-total-badge">
                        <span className="ms-total-label">Total Students:</span>
                        <span className="ms-total-count">{filtered.total}</span>
                    </div>
                </div>

                <div className="cr-right">
                    <SearchBar
                        query={searchQuery}
                        setQuery={setSearchQuery}
                        placeholder="Search student name or LRN..."
                    />

                    <button className="ms-download-btn" onClick={handleDownload} title="Download Master Sheet">
                        <Download size={17} />
                        <span>Download</span>
                    </button>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="ms-table-wrapper">
                <table className="ms-table">
                    <thead>
                        {/* Row 1 — class info + subject names */}
                        <tr className="ms-header-row-1">
                            <th className="ms-name-header-cell" rowSpan={3}>
                                Names of Learners
                            </th>
                            {SUBJECTS.map((sub) => (
                                <th key={sub.key} colSpan={4} className="ms-subject-header">
                                    {sub.label}
                                </th>
                            ))}
                            {/* General Average spans all 3 header rows */}
                            <th rowSpan={3} className="ms-gen-avg-header">
                                General Average
                            </th>
                        </tr>

                        {/* Row 2 — "Term" label + Final Grade per subject */}
                        <tr className="ms-header-row-2">
                            {SUBJECTS.map((sub) => (
                                <React.Fragment key={sub.key}>
                                    <th colSpan={3} className="ms-term-group-header">
                                        Term
                                    </th>
                                    {/* rowSpan=2 merges this cell with the empty row-3 slot */}
                                    <th rowSpan={2} className="ms-fg-header-cell">Final Grade</th>
                                </React.Fragment>
                            ))}
                        </tr>

                        {/* Row 3 — individual term columns only (Final Grade merged via rowSpan) */}
                        <tr className="ms-header-row-3">
                            {SUBJECTS.map((sub) => (
                                <React.Fragment key={sub.key}>
                                    <th className="ms-term-cell">1</th>
                                    <th className="ms-term-cell">2</th>
                                    <th className="ms-term-cell">3</th>
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {/* ── Male group ── */}
                        <tr className="ms-sex-header-row">
                            <td colSpan={3 + SUBJECTS.length * 4} className="ms-sex-header-cell">
                                Male
                            </td>
                        </tr>
                        {renderStudentRows(filtered.males, "male")}

                        {/* ── Female group ── */}
                        <tr className="ms-sex-header-row ms-sex-header-row--female">
                            <td colSpan={3 + SUBJECTS.length * 4} className="ms-sex-header-cell">
                                Female
                            </td>
                        </tr>
                        {renderStudentRows(filtered.females, "female")}
                    </tbody>
                </table>
            </div>

            {/* ── Submission footer ── modal content derived from userRole inside component */}
            <SubmissionFooter
                deadline={classInfo.deadline}
                isSubmitted={isSubmitted}
                onSubmit={() => setIsSubmitted(true)}
                userRole="adviser"
            />
        </div>
    );
}
