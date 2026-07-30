import React, { useState } from "react";
import { Search, Pencil, X, ChevronDown } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalList.css";

//  Mock Dept Head Data (grouped by department) 

const DEPARTMENTS = [
  {
    dept: "English Department",
    head: { id: 1, lastName: "Torres", firstName: "Theresa Elaine", dept: "English Department" },
  },
  {
    dept: "Science Department",
    head: { id: 2, lastName: "Villanueva", firstName: "Vincent Rico", dept: "Science Department" },
  },
  {
    dept: "Mathematics Department",
    head: { id: 3, lastName: "Aguilar", firstName: "Angela Mae", dept: "Mathematics Department" },
  },
  {
    dept: "Filipino Department",
    head: { id: 4, lastName: "Bautista", firstName: "Benedicto Jr.", dept: "Filipino Department" },
  },
  {
    dept: "Araling Panlipunan Department",
    head: { id: 5, lastName: "Castillo", firstName: "Carmela Rose", dept: "Araling Panlipunan Department" },
  },
  {
    dept: "MAPEH Department",
    head: { id: 6, lastName: "Delgado", firstName: "Diego Paul", dept: "MAPEH Department" },
  },
  {
    dept: "TLE Department",
    head: { id: 7, lastName: "Espinosa", firstName: "Ester Joy", dept: "TLE Department" },
  },
];

export default function DeptHeadEvalList({ onBack, onCreateFeedback }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Filter departments whose head matches search
  const filtered = DEPARTMENTS.filter(({ dept, head }) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${head.lastName}, ${head.firstName}`.toLowerCase().includes(q) ||
      dept.toLowerCase().includes(q)
    );
  });

  return (
    <div className="tel-container">

      {/* ── Header ── */}
      <div className="tel-header">
        <div className="tel-header-left">
          <button className="back-btn" onClick={onBack} title="Back to Peer Feedback">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1 className="tel-page-title">Peer Feedback</h1>
        </div>

        <div className="tel-header-right">
          {showSearch ? (
            <div className="tel-search-bar">
              <Search size={15} className="tel-search-icon" />
              <input
                className="tel-search-input"
                type="text"
                placeholder="Search department head..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button className="tel-search-clear" onClick={() => setSearchQuery("")}>
                  <X size={14} />
                </button>
              )}
              <button className="tel-search-close" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <button className="tel-search-toggle" onClick={() => setShowSearch(true)} title="Search">
              <Search size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Dept Head List (grouped by department) ── */}
      <div className="tel-list-card">
        {filtered.length === 0 ? (
          <div className="tel-empty">
            <Search size={32} color="#cbd5e1" />
            <p>No department heads found.</p>
          </div>
        ) : (
          <ul className="tel-list">
            {filtered.map(({ dept, head }, idx) => (
              <React.Fragment key={head.id}>
                {/* Department label row */}
                <li className="tel-dept-label-row">
                  <span className="tel-dept-label">{dept}</span>
                </li>
                {/* Head row */}
                <li
                  className="tel-list-item"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="tel-avatar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#112d61">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                  </div>
                  <div className="tel-info">
                    <p className="tel-name">{head.lastName}, {head.firstName}</p>
                    <p className="tel-meta">{head.dept}</p>
                  </div>
                  <button
                    className="tel-create-btn"
                    onClick={() => onCreateFeedback && onCreateFeedback(head)}
                  >
                    <Pencil size={14} />
                    Create Feedback
                  </button>
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
