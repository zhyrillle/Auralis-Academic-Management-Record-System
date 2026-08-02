import React, { useState } from "react";
import { Search, Pencil, X } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalList.css";

//  Mock Principal Data 

const PRINCIPALS = [
  { id: 1, lastName: "Rivera", firstName: "Rachel Denise", role: "Principal" },
];

export default function PrincipalEvalList({ onBack, onCreateFeedback }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const filtered = PRINCIPALS.filter((p) => {
    if (!searchQuery) return true;
    return `${p.lastName}, ${p.firstName}`.toLowerCase().includes(searchQuery.toLowerCase());
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
                placeholder="Search principal..."
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
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
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

      {/* ── Principal List ── */}
      <div className="tel-list-card">
        {filtered.length === 0 ? (
          <div className="tel-empty">
            <Search size={32} color="#cbd5e1" />
            <p>No results found.</p>
          </div>
        ) : (
          <ul className="tel-list">
            {filtered.map((person, idx) => (
              <li
                key={person.id}
                className="tel-list-item"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="tel-avatar">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#112d61">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                </div>
                <div className="tel-info">
                  <p className="tel-name">{person.lastName}, {person.firstName}</p>
                  <p className="tel-meta">{person.role}</p>
                </div>
                <button
                  className="tel-create-btn"
                  onClick={() => onCreateFeedback && onCreateFeedback(person)}
                >
                  <Pencil size={14} />
                  Create Feedback
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
