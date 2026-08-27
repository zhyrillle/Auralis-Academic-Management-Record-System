import React, { useState, useEffect } from "react";
import { Search, Pencil, X, Check } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalList.css";
import { getStoredUser } from "../../utils/auth";

export default function DeptHeadEvalList({ onBack, onCreateFeedback }) {
  const currentUser = getStoredUser();
  const [deptHeads, setDeptHeads] = useState([]);
  const [evaluatedUserIds, setEvaluatedUserIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch users from backend
    fetch("http://localhost:5000/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const list = data
            .filter((u) => {
              if (currentUser && Number(u.user_id) === Number(currentUser.user_id)) {
                return false;
              }
              const r = (u.role || u.display_role || "").toLowerCase();
              return r.includes("head") || u.display_role === "Department Head";
            })
            .map((u) => ({
              dept: u.department_name || "Academic Department",
              head: {
                id: u.user_id,
                lastName: u.last_name || "",
                firstName: u.first_name || "",
                dept: u.department_name || "Department Head",
                user_id: u.user_id
              }
            }));
          setDeptHeads(list);
        }
      })
      .catch((err) => console.error("Error fetching department heads:", err))
      .finally(() => setLoading(false));

    // 2. Fetch feedback given by current logged-in user
    if (currentUser?.user_id) {
      fetch(`http://localhost:5000/api/feedback/evaluator/${currentUser.user_id}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const set = new Set(data.map((item) => item.evaluee_id));
            setEvaluatedUserIds(set);
          }
        })
        .catch((err) => console.error("Error fetching evaluator feedback:", err));
    }
  }, [currentUser?.user_id]);

  // Filter departments whose head matches search
  const filtered = deptHeads.filter(({ dept, head }) => {
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
              <button
                className="tel-search-close"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
              >
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
        {loading ? (
          <div className="tel-empty">
            <p>Loading department heads...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="tel-empty">
            <Search size={32} color="#cbd5e1" />
            <p>No department heads found.</p>
          </div>
        ) : (
          <ul className="tel-list">
            {filtered.map(({ dept, head }, idx) => {
              const isEvaluated = evaluatedUserIds.has(head.id);

              return (
                <React.Fragment key={head.id}>
                  {/* Department label row */}
                  <li className="tel-dept-label-row">
                    <span className="tel-dept-label">{dept}</span>
                  </li>
                  {/* Head row */}
                  <li className="tel-list-item" style={{ animationDelay: `${idx * 40}ms` }}>
                    <div className="tel-avatar">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#112d61">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    </div>
                    <div className="tel-info">
                      <p className="tel-name">
                        {head.lastName}, {head.firstName}
                      </p>
                      <p className="tel-meta">{head.dept}</p>
                    </div>
                    <button
                      className={`tel-create-btn ${isEvaluated ? "submitted" : ""}`}
                      disabled={isEvaluated}
                      style={isEvaluated ? { opacity: 0.6, cursor: "not-allowed", backgroundColor: "#64748b" } : {}}
                      onClick={() => !isEvaluated && onCreateFeedback && onCreateFeedback(head)}
                    >
                      {isEvaluated ? (
                        <>
                          <Check size={14} />
                          Feedback Submitted
                        </>
                      ) : (
                        <>
                          <Pencil size={14} />
                          Create Feedback
                        </>
                      )}
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
