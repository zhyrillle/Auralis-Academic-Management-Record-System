import React, { useState, useEffect } from "react";
import {
  Users,
  Clock,
  CheckCircle2,
  Star,
  MessageSquare,
} from "lucide-react";
import "../../styles/adviserFeedback.css";
import TeacherEvalList from "./TeacherEvalList";
import TeacherEvalForm from "./TeacherEvalForm";
import DeptHeadEvalList from "./DeptHeadEvalList";
import PrincipalEvalList from "./PrincipalEvalList";
import RoleEvalForm from "./RoleEvalForm";
import { getStoredUser } from "../../utils/auth";

// Mock Data 

const STATS = [
  {
    id: "total",
    label: "Total Peer Feedback Submitted",
    value: "10",
    sub: "All time",
    subType: "success",
  },
  {
    id: "pending",
    label: "Pending Feedback",
    value: "2",
    sub: "Require attention",
    subType: "warning",
  },
  {
    id: "completion",
    label: "Completion",
    value: "83%",
    sub: "Feedbacks submitted",
    subType: "success",
  },
  {
    id: "rating",
    label: "Average Rating",
    value: "4.7/5",
    sub: "",
    subType: "neutral",
  },
];

const GIVE_FEEDBACK_CARDS = [
  {
    id: "teacher",
    title: "Teacher Evaluation",
    description: "Evaluate fellow teachers",
  },
  {
    id: "dept-head",
    title: "Department Head E...",
    description: "Provide feedback to your department head",
  },
  {
    id: "principal",
    title: "Principal Evaluation",
    description: "Evaluate school leadership",
  },
];

const RECENT_COMMENTS = [];

const PENDING_FEEDBACKS = [
  {
    id: 1,
    type: "Teacher to Teacher",
    description: "2 evaluations pending",
    status: "Pending",
  },
  {
    id: 2,
    type: "Teacher to Teacher",
    description: "2 evaluations pending",
    status: "Pending",
  },
];

const PIE_DATA = [
  { label: "Excellent (4.5 – 5.0)", count: 5, percent: 42, color: "#1a3a6b" },
  { label: "Good (3.5 – 4.4)", count: 4, percent: 33, color: "#112d61" },
  { label: "Average (2.5 – 3.4)", count: 2, percent: 17, color: "#b8941f" },
  { label: "Needs Improvement (1.0 – 2.4)", count: 1, percent: 8, color: "#e8c44a" },
];

// Donut / Pie Chart

function DonutChart({ data }) {
  const SIZE = 190;
  const CENTER = SIZE / 2;
  const OUTER_R = 80;
  const INNER_R = 36;

  const toRad = (deg) => (deg * Math.PI) / 180;

  let cumAngle = -90;
  const slices = data.map((item) => {
    const sweep = (item.percent / 100) * 360;
    const start = cumAngle;
    const end = cumAngle + sweep;
    cumAngle += sweep;

    const sx = CENTER + OUTER_R * Math.cos(toRad(start));
    const sy = CENTER + OUTER_R * Math.sin(toRad(start));
    const ex = CENTER + OUTER_R * Math.cos(toRad(end));
    const ey = CENTER + OUTER_R * Math.sin(toRad(end));

    const ix1 = CENTER + INNER_R * Math.cos(toRad(start));
    const iy1 = CENTER + INNER_R * Math.sin(toRad(start));
    const ix2 = CENTER + INNER_R * Math.cos(toRad(end));
    const iy2 = CENTER + INNER_R * Math.sin(toRad(end));

    const large = sweep > 180 ? 1 : 0;

    const d = [
      `M ${ix1} ${iy1}`,
      `L ${sx} ${sy}`,
      `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${ex} ${ey}`,
      `L ${ix2} ${iy2}`,
      `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");

    return { ...item, d };
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="fb-donut-svg">
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="2.5" className="fb-donut-slice" />
      ))}
      <circle cx={CENTER} cy={CENTER} r={INNER_R - 2} fill="#fff" />
    </svg>
  );
}

// Main Component

export default function AdviserFeedback() {
  const currentUser = getStoredUser();
  const [progressReady, setProgressReady] = useState(false);
  // currentView: "dashboard" | "teacher-list" | "eval-form" | "dept-head-list" | "dept-head-form" | "principal-list" | "principal-form"
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [roleFormType, setRoleFormType] = useState(null);

  // Dynamic Backend Data State
  const [userStats, setUserStats] = useState({
    total_submitted: 0,
    total_received: 0,
    avg_rating: "0.0"
  });
  const [recentComments, setRecentComments] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setProgressReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!currentUser?.user_id) return;

    // 1. Fetch user evaluation stats
    fetch(`http://localhost:5000/api/feedback/stats/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) {
          setUserStats(data);
        }
      })
      .catch((err) => console.error("Error fetching feedback stats:", err));

    // 2. Fetch recent peer comments where currentUser is evaluee
    fetch(`http://localhost:5000/api/feedback/evaluee/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          const comments = [];
          data.forEach((item) => {
            if (item.strengths_comments && item.strengths_comments.trim()) {
              comments.push({
                id: `${item.feedback_id}-str`,
                text: `"${item.strengths_comments}"`,
                date: item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent",
                evaluator: item.evaluator_name || "Peer Evaluator"
              });
            }
            if (item.improvements_comment && item.improvements_comment.trim()) {
              comments.push({
                id: `${item.feedback_id}-imp`,
                text: `"${item.improvements_comment}"`,
                date: item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent",
                evaluator: item.evaluator_name || "Peer Evaluator"
              });
            }
          });
          setRecentComments(comments);
        }
      })
      .catch((err) => console.error("Error fetching evaluee comments:", err));
  }, [currentUser?.user_id]);

  // Compute dynamic stats list
  const dynamicStats = [
    {
      id: "total",
      label: "Total Peer Feedback Submitted",
      value: String(userStats.total_submitted),
      sub: "All time",
      subType: "success",
    },
    {
      id: "pending",
      label: "Feedback Received",
      value: String(userStats.total_received),
      sub: "Peer reviews",
      subType: "warning",
    },
    {
      id: "completion",
      label: "Completion Rate",
      value: userStats.total_submitted > 0 ? "100%" : "0%",
      sub: "Feedbacks submitted",
      subType: "success",
    },
    {
      id: "rating",
      label: "Average Rating",
      value: `${userStats.avg_rating || "0.0"}/5`,
      sub: "Received from peers",
      subType: "neutral",
    },
  ];

  // ── Sub-views ──

  // Teacher
  if (currentView === "teacher-list") {
    return (
      <TeacherEvalList
        onBack={() => setCurrentView("dashboard")}
        onCreateFeedback={(teacher) => {
          setSelectedTeacher(teacher);
          setCurrentView("eval-form");
        }}
      />
    );
  }
  if (currentView === "eval-form") {
    return (
      <TeacherEvalForm
        teacher={selectedTeacher}
        onBack={() => setCurrentView("teacher-list")}
        onCancel={() => setCurrentView("teacher-list")}
      />
    );
  }

  // Department Head
  if (currentView === "dept-head-list") {
    return (
      <DeptHeadEvalList
        onBack={() => setCurrentView("dashboard")}
        onCreateFeedback={(person) => {
          setSelectedPerson(person);
          setRoleFormType("dept-head");
          setCurrentView("dept-head-form");
        }}
      />
    );
  }
  if (currentView === "dept-head-form") {
    return (
      <RoleEvalForm
        formType="dept-head"
        person={selectedPerson}
        onBack={() => setCurrentView("dept-head-list")}
        onCancel={() => setCurrentView("dept-head-list")}
      />
    );
  }

  // Principal
  if (currentView === "principal-list") {
    return (
      <PrincipalEvalList
        onBack={() => setCurrentView("dashboard")}
        onCreateFeedback={(person) => {
          setSelectedPerson(person);
          setRoleFormType("principal");
          setCurrentView("principal-form");
        }}
      />
    );
  }
  if (currentView === "principal-form") {
    return (
      <RoleEvalForm
        formType="principal"
        person={selectedPerson}
        onBack={() => setCurrentView("principal-list")}
        onCancel={() => setCurrentView("principal-list")}
      />
    );
  }

  const displayedComments = recentComments.length > 0 ? recentComments : RECENT_COMMENTS;

  return (
    <div className="fb-container">

      {/* ── Page Title ── */}
      <h1 className="fb-page-title">Peer Feedback</h1>

      {/* ── Stat Cards ── */}
      <div className="fb-stats-grid">
        {dynamicStats.map((s) => (
          <div key={s.id} className="fb-stat-card">
            <p className="fb-stat-label">{s.label}</p>
            <p className="fb-stat-value">{s.value}</p>
            {s.sub && <p className={`fb-stat-sub ${s.subType}`}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Progress Bar ── */}
      <div className="fb-progress-section">
        <div className="fb-progress-header">
          <div className="fb-progress-left">
            <span className="fb-three-dots">
              <span /><span /><span />
            </span>
            <span className="fb-progress-label">Progress</span>
          </div>
          <span className="fb-progress-pct">{userStats.total_submitted > 0 ? "100% Complete" : "0% Complete"}</span>
        </div>
        <div className="fb-progress-track">
          <div
            className="fb-progress-fill"
            style={{ width: progressReady ? (userStats.total_submitted > 0 ? "100%" : "15%") : "0%" }}
          />
        </div>
      </div>

      {/* ── Middle Row: Give Feedback + Recent Comments ── */}
      <div className="fb-middle-row">

        {/* Give Feedback */}
        <div className="fb-give-section">
          <div className="fb-section-heading">
            <Users size={18} className="fb-heading-icon" />
            <h2 className="fb-section-title">Give Feedback</h2>
          </div>
          <div className="fb-give-cards-row">
            {GIVE_FEEDBACK_CARDS.map((card) => (
              <div key={card.id} className="fb-give-card">
                <div className="fb-give-avatar">
                  <Users size={26} color="#112d61" />
                </div>
                <p className="fb-give-card-title">{card.title}</p>
                <p className="fb-give-card-desc">{card.description}</p>
                <button
                  className="fb-give-btn"
                  onClick={() => {
                    if (card.id === "teacher") setCurrentView("teacher-list");
                    if (card.id === "dept-head") setCurrentView("dept-head-list");
                    if (card.id === "principal") setCurrentView("principal-list");
                  }}
                >
                  Give Feedback
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Peer Comments */}
        <div className="fb-comments-panel">
          <div className="fb-section-heading">
            <MessageSquare size={18} className="fb-heading-icon" />
            <h2 className="fb-section-title">Recent Peer Comments</h2>
          </div>
          <div className="fb-comments-list">
            {recentComments.length === 0 ? (
              <p style={{ padding: "20px 10px", color: "#64748b", fontSize: "13px" }}>
                No peer comments received yet.
              </p>
            ) : (
              recentComments.map((c) => (
                <div key={c.id} className="fb-comment-row">
                  <Star size={15} fill="#c9a227" color="#c9a227" className="fb-comment-star" />
                  <div className="fb-comment-body">
                    <p className="fb-comment-text">{c.text}</p>
                    <p className="fb-comment-date">{c.date}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="fb-view-more-btn">View More Comments</button>
        </div>
      </div>

      {/* ── Bottom Row: Pending + Distribution ── */}
      <div className="fb-bottom-row">

        {/* Pending Feedbacks */}
        <div className="fb-pending-card">
          <div className="fb-section-heading">
            <span className="fb-three-dots sm">
              <span /><span /><span />
            </span>
            <h2 className="fb-section-title">
              Pending Feedbacks ({PENDING_FEEDBACKS.length})
            </h2>
          </div>

          <div className="fb-pending-list">
            {PENDING_FEEDBACKS.map((pf, i) => (
              <React.Fragment key={pf.id}>
                <div className="fb-pending-item">
                  <div className="fb-pending-avatar">
                    <Users size={20} color="#112d61" />
                  </div>
                  <div className="fb-pending-info">
                    <p className="fb-pending-type">{pf.type}</p>
                    <p className="fb-pending-desc">{pf.description}</p>
                  </div>
                  <span className="fb-pending-badge">{pf.status}</span>
                </div>
                {i < PENDING_FEEDBACKS.length - 1 && (
                  <hr className="fb-pending-divider" />
                )}
              </React.Fragment>
            ))}
          </div>
          <button className="fb-view-all-btn">View All</button>
        </div>

        {/* Performance Distribution */}
        <div className="fb-distribution-card">
          <div className="fb-section-heading">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#112d61" strokeWidth="2" className="fb-heading-icon">
              <rect x="2" y="13" width="4" height="9" rx="1" />
              <rect x="9" y="8" width="4" height="14" rx="1" />
              <rect x="16" y="3" width="4" height="19" rx="1" />
            </svg>
            <h2 className="fb-section-title">Performance Distribution</h2>
          </div>
          <div className="fb-dist-inner">
            <DonutChart data={PIE_DATA} />
            <div className="fb-legend">
              {PIE_DATA.map((item, i) => (
                <div key={i} className="fb-legend-item">
                  <span className="fb-legend-dot" style={{ background: item.color }} />
                  <span className="fb-legend-label">
                    {item.label} {item.count} ({item.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
