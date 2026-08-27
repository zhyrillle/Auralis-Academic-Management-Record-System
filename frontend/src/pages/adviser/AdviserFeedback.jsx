import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Clock,
  CheckCircle2,
  Star,
  MessageSquare,
  Search,
  Pencil,
  X,
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
    avg_rating: "0.0",
    total_peers: 0,
    pending_count: 0,
    completion_rate: 0,
    rating_distribution: {
      excellent: 0,
      good: 0,
      average: 0,
      needs_improvement: 0,
    },
  });
  const [recentComments, setRecentComments] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [pendingPeersList, setPendingPeersList] = useState([]);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsSearchQuery, setCommentsSearchQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setProgressReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  const fetchFeedbackData = () => {
    if (!currentUser?.user_id) return;

    // 1. Fetch backend stats, active users list, and evaluator feedback in parallel
    const statsPromise = fetch(`http://localhost:5000/api/feedback/stats/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch((err) => {
        console.error("Error fetching feedback stats:", err);
        return null;
      });

    const usersPromise = fetch("http://localhost:5000/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    const evalFeedbacksPromise = fetch(`http://localhost:5000/api/feedback/evaluator/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    Promise.all([statsPromise, usersPromise, evalFeedbacksPromise]).then(
      ([statsData, usersData, evalFeedbacksData]) => {
        const evaluatedSet = new Set(
          Array.isArray(evalFeedbacksData) ? evalFeedbacksData.map((f) => Number(f.evaluee_id)) : []
        );

        let pendingTeachers = 0;
        let pendingDeptHeads = 0;
        let pendingPrincipals = 0;
        let totalEligiblePeers = 0;
        const unsubmittedPeers = [];

        if (Array.isArray(usersData)) {
          usersData.forEach((u) => {
            if (Number(u.user_id) === Number(currentUser.user_id)) return;
            const r = (u.role || u.display_role || "").toLowerCase();
            if (r.includes("admin")) return;

            totalEligiblePeers++;
            const isEvaluated = evaluatedSet.has(Number(u.user_id));
            if (!isEvaluated) {
              const displayRoleName = u.display_role || (r.includes("principal") ? "Principal" : r.includes("head") || r.includes("department") ? "Department Head" : "Subject Teacher");
              const deptName = u.department_name || u.head_department_name || u.teacher_department_name || u.department || "";
              
              unsubmittedPeers.push({
                id: u.user_id,
                user_id: u.user_id,
                firstName: u.first_name || "",
                lastName: u.last_name || "",
                role: u.role || "",
                displayRole: displayRoleName,
                department: deptName,
                subject: deptName || "General Education",
                grade: u.gradeLevel || u.section || "High School",
              });

              if (r.includes("principal")) {
                pendingPrincipals++;
              } else if (r.includes("head") || r.includes("department")) {
                pendingDeptHeads++;
              } else {
                pendingTeachers++;
              }
            }
          });
        }

        setPendingPeersList(unsubmittedPeers);

        const totalSubmitted = evaluatedSet.size || (statsData?.total_submitted || 0);
        const pendingCount = pendingTeachers + pendingDeptHeads + pendingPrincipals;

        const mergedStats = {
          total_submitted: totalSubmitted,
          total_received: statsData?.total_received || 0,
          avg_rating: statsData?.avg_rating || "0.0",
          total_peers: totalEligiblePeers || (statsData?.total_peers || (totalSubmitted + pendingCount)),
          pending_count: pendingCount,
          completion_rate:
            totalEligiblePeers > 0
              ? Math.min(100, Math.round((totalSubmitted / totalEligiblePeers) * 100))
              : 100,
          pending_breakdown: {
            teachers: pendingTeachers,
            dept_heads: pendingDeptHeads,
            principals: pendingPrincipals,
          },
          rating_distribution: statsData?.rating_distribution || {
            excellent: 0,
            good: 0,
            average: 0,
            needs_improvement: 0,
          },
        };

        setUserStats(mergedStats);
      }
    );

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
                category: "Strengths & Contributions",
                date: item.created_at
                  ? new Date(item.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Recent",
                evaluator: item.evaluator_name || "Peer Evaluator",
              });
            }
            if (item.improvements_comment && item.improvements_comment.trim()) {
              comments.push({
                id: `${item.feedback_id}-imp`,
                text: `"${item.improvements_comment}"`,
                category: "Areas for Improvement",
                date: item.created_at
                  ? new Date(item.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Recent",
                evaluator: item.evaluator_name || "Peer Evaluator",
              });
            }
          });
          setRecentComments(comments);
        }
      })
      .catch((err) => console.error("Error fetching evaluee comments:", err));
  };

  useEffect(() => {
    fetchFeedbackData();
    window.addEventListener("focus", fetchFeedbackData);
    return () => window.removeEventListener("focus", fetchFeedbackData);
  }, [currentUser?.user_id, currentView]);

  const handleEvaluatePeer = (person) => {
    setShowPendingModal(false);
    const r = (person.role || person.displayRole || "").toLowerCase();
    if (r.includes("principal")) {
      setSelectedPerson(person);
      setRoleFormType("principal");
      setCurrentView("principal-form");
    } else if (r.includes("head") || r.includes("department")) {
      setSelectedPerson(person);
      setRoleFormType("dept-head");
      setCurrentView("dept-head-form");
    } else {
      setSelectedTeacher(person);
      setCurrentView("eval-form");
    }
  };

  const filteredPendingPeers = pendingPeersList.filter((p) => {
    if (!pendingSearchQuery.trim()) return true;
    const q = pendingSearchQuery.toLowerCase();
    const fullName = `${p.lastName}, ${p.firstName}`.toLowerCase();
    const roleStr = (p.displayRole || "").toLowerCase();
    const deptStr = (p.department || "").toLowerCase();
    return fullName.includes(q) || roleStr.includes(q) || deptStr.includes(q);
  });

  const filteredComments = recentComments.filter((c) => {
    if (!commentsSearchQuery.trim()) return true;
    const q = commentsSearchQuery.toLowerCase();
    return (
      c.text.toLowerCase().includes(q) ||
      c.evaluator.toLowerCase().includes(q) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      c.date.toLowerCase().includes(q)
    );
  });

  const totalSubmitted = userStats.total_submitted || 0;
  const totalPeers = userStats.total_peers || 0;

  const completionRate =
    totalPeers > 0
      ? Math.min(100, Math.round((totalSubmitted / totalPeers) * 100))
      : totalSubmitted > 0
      ? 100
      : 0;

  const pendingCount =
    userStats.pending_count !== undefined
      ? userStats.pending_count
      : Math.max(0, totalPeers - totalSubmitted);

  // Compute dynamic stats list
  const dynamicStats = [
    {
      id: "total",
      label: "Total Peer Feedback Submitted",
      value: String(totalSubmitted),
      sub: "All time",
      subType: "success",
    },
    {
      id: "pending",
      label: "Pending Feedback",
      value: String(pendingCount),
      sub: "Require attention",
      subType: "warning",
    },
    {
      id: "completion",
      label: "Completion Rate",
      value: `${completionRate}%`,
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

  const dist = userStats.rating_distribution || {
    excellent: 0,
    good: 0,
    average: 0,
    needs_improvement: 0,
  };
  const distTotal =
    dist.excellent + dist.good + dist.average + dist.needs_improvement;
  const pieData =
    distTotal > 0
      ? [
          {
            label: "Excellent (4.5 – 5.0)",
            count: dist.excellent,
            percent: Math.round((dist.excellent / distTotal) * 100),
            color: "#1a3a6b",
          },
          {
            label: "Good (3.5 – 4.4)",
            count: dist.good,
            percent: Math.round((dist.good / distTotal) * 100),
            color: "#112d61",
          },
          {
            label: "Average (2.5 – 3.4)",
            count: dist.average,
            percent: Math.round((dist.average / distTotal) * 100),
            color: "#b8941f",
          },
          {
            label: "Needs Improvement (1.0 – 2.4)",
            count: dist.needs_improvement,
            percent: Math.round((dist.needs_improvement / distTotal) * 100),
            color: "#e8c44a",
          },
        ]
      : PIE_DATA;

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
            <span className="fb-progress-label">
              Progress ({totalSubmitted} / {totalPeers} Feedbacks Submitted)
            </span>
          </div>
          <span className="fb-progress-pct">{`${completionRate}% Complete`}</span>
        </div>
        <div className="fb-progress-track">
          <div
            className="fb-progress-fill"
            style={{ width: progressReady ? `${completionRate}%` : "0%" }}
          />
        </div>
      </div>

      {/* ── Middle Row: Give Feedback + Pending Feedbacks ── */}
      <div className="fb-middle-row">

        {/* Give Feedback */}
        <div className="fb-give-section">
          <div className="fb-section-heading">
            <Users size={18} className="fb-heading-icon" />
            <h2 className="fb-section-title">Give Feedback</h2>
          </div>
          <div className="fb-give-cards-row">
            {GIVE_FEEDBACK_CARDS.map((card) => {
              let pendingDesc = card.description;
              if (card.id === "teacher" && userStats.pending_breakdown) {
                const count = userStats.pending_breakdown.teachers || 0;
                pendingDesc = count > 0 ? `${count} evaluation${count > 1 ? "s" : ""} pending` : "All evaluated";
              } else if (card.id === "dept-head" && userStats.pending_breakdown) {
                const count = userStats.pending_breakdown.dept_heads || 0;
                pendingDesc = count > 0 ? `${count} evaluation${count > 1 ? "s" : ""} pending` : "All evaluated";
              } else if (card.id === "principal" && userStats.pending_breakdown) {
                const count = userStats.pending_breakdown.principals || 0;
                pendingDesc = count > 0 ? `${count} evaluation${count > 1 ? "s" : ""} pending` : "All evaluated";
              }

              return (
                <div key={card.id} className="fb-give-card">
                  <div className="fb-give-avatar">
                    <Users size={26} color="#112d61" />
                  </div>
                  <p className="fb-give-card-title">{card.title}</p>
                  <p className="fb-give-card-desc">{pendingDesc}</p>
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
              );
            })}
          </div>
        </div>

        {/* Pending Feedbacks */}
        <div className="fb-pending-card">
          <div className="fb-section-heading">
            <span className="fb-three-dots sm">
              <span /><span /><span />
            </span>
            <h2 className="fb-section-title">
              Pending Feedbacks ({pendingCount})
            </h2>
          </div>

          <div className="fb-pending-list">
            {pendingCount === 0 ? (
              <p style={{ padding: "20px 10px", color: "#16a34a", fontSize: "13px", fontWeight: "500" }}>
                ✓ All peer feedback evaluations are complete!
              </p>
            ) : (
              [
                userStats.pending_breakdown?.teachers > 0 && {
                  id: "teacher",
                  type: "Teacher Evaluation",
                  description: `${userStats.pending_breakdown.teachers} evaluation${userStats.pending_breakdown.teachers > 1 ? "s" : ""} pending`,
                  status: "Pending",
                  view: "teacher-list",
                },
                userStats.pending_breakdown?.dept_heads > 0 && {
                  id: "dept-head",
                  type: "Department Head Evaluation",
                  description: `${userStats.pending_breakdown.dept_heads} evaluation${userStats.pending_breakdown.dept_heads > 1 ? "s" : ""} pending`,
                  status: "Pending",
                  view: "dept-head-list",
                },
                userStats.pending_breakdown?.principals > 0 && {
                  id: "principal",
                  type: "Principal Evaluation",
                  description: `${userStats.pending_breakdown.principals} evaluation${userStats.pending_breakdown.principals > 1 ? "s" : ""} pending`,
                  status: "Pending",
                  view: "principal-list",
                },
              ]
                .filter(Boolean)
                .map((pf, i, arr) => (
                  <React.Fragment key={pf.id}>
                    <div
                      className="fb-pending-item"
                      style={{ cursor: "pointer" }}
                      onClick={() => setCurrentView(pf.view)}
                    >
                      <div className="fb-pending-avatar">
                        <Users size={20} color="#112d61" />
                      </div>
                      <div className="fb-pending-info">
                        <p className="fb-pending-type">{pf.type}</p>
                        <p className="fb-pending-desc">{pf.description}</p>
                      </div>
                      <span className="fb-pending-badge">{pf.status}</span>
                    </div>
                    {i < arr.length - 1 && <hr className="fb-pending-divider" />}
                  </React.Fragment>
                ))
            )}
          </div>
          <button className="fb-view-all-btn" onClick={() => setShowPendingModal(true)}>
            View All
          </button>
        </div>
      </div>

      {/* ── Bottom Row: Recent Comments + Performance Distribution ── */}
      <div className="fb-bottom-row">

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
              recentComments.slice(0, 3).map((c) => (
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
          <button className="fb-view-more-btn" onClick={() => setShowCommentsModal(true)}>
            View More Comments
          </button>
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
            <DonutChart data={pieData} />
            <div className="fb-legend">
              {pieData.map((item, i) => (
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

      {/* ── Pending Feedbacks Floating Modal ── */}
      {showPendingModal &&
        createPortal(
          <div className="fb-modal-backdrop" onClick={() => setShowPendingModal(false)}>
            <div className="fb-modal-card" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="fb-modal-header">
                <div className="fb-modal-header-title">
                  <h2>Pending Peer Feedbacks</h2>
                  <span className="fb-modal-badge">
                    {filteredPendingPeers.length} Pending
                  </span>
                </div>
                <button
                  className="fb-modal-close-btn"
                  onClick={() => setShowPendingModal(false)}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="fb-modal-search-wrapper">
                <Search size={16} className="fb-modal-search-icon" />
                <input
                  type="text"
                  className="fb-modal-search-input"
                  placeholder="Search by name, role, or department..."
                  value={pendingSearchQuery}
                  onChange={(e) => setPendingSearchQuery(e.target.value)}
                  autoFocus
                />
                {pendingSearchQuery && (
                  <button
                    className="fb-modal-clear-search"
                    onClick={() => setPendingSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* List of Pending Peers */}
              <div className="fb-modal-list">
                {filteredPendingPeers.length === 0 ? (
                  <div className="fb-modal-empty">
                    <p>No pending peer feedbacks found.</p>
                  </div>
                ) : (
                  filteredPendingPeers.map((peer) => (
                    <div key={peer.id} className="fb-modal-peer-row">
                      <div className="fb-modal-peer-avatar">
                        <Users size={22} color="#112d61" />
                      </div>
                      <div className="fb-modal-peer-info">
                        <p className="fb-modal-peer-name">
                          {peer.lastName}, {peer.firstName}
                        </p>
                        <p className="fb-modal-peer-meta">
                          <span className="fb-role-pill">{peer.displayRole}</span>
                          {peer.department && ` • ${peer.department}`}
                        </p>
                      </div>
                      <button
                        className="fb-evaluate-now-btn"
                        onClick={() => handleEvaluatePeer(peer)}
                      >
                        <Pencil size={13} />
                        Evaluate Now
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── All Peer Comments Floating Modal ── */}
      {showCommentsModal &&
        createPortal(
          <div className="fb-modal-backdrop" onClick={() => setShowCommentsModal(false)}>
            <div className="fb-modal-card" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="fb-modal-header">
                <div className="fb-modal-header-title">
                  <h2>All Peer Comments Received</h2>
                  <span className="fb-modal-badge">
                    {filteredComments.length} Comment{filteredComments.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  className="fb-modal-close-btn"
                  onClick={() => setShowCommentsModal(false)}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="fb-modal-search-wrapper">
                <Search size={16} className="fb-modal-search-icon" />
                <input
                  type="text"
                  className="fb-modal-search-input"
                  placeholder="Search comments by keyword, evaluator, or date..."
                  value={commentsSearchQuery}
                  onChange={(e) => setCommentsSearchQuery(e.target.value)}
                  autoFocus
                />
                {commentsSearchQuery && (
                  <button
                    className="fb-modal-clear-search"
                    onClick={() => setCommentsSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* List of Comments */}
              <div className="fb-modal-list">
                {filteredComments.length === 0 ? (
                  <div className="fb-modal-empty">
                    <p>No peer comments found.</p>
                  </div>
                ) : (
                  filteredComments.map((c) => (
                    <div key={c.id} className="fb-modal-comment-row">
                      <Star size={16} fill="#c9a227" color="#c9a227" className="fb-comment-star" />
                      <div className="fb-modal-comment-body">
                        <div className="fb-modal-comment-header">
                          <span className="fb-comment-category-tag">{c.category || "Peer Review"}</span>
                          <span className="fb-comment-author">{c.evaluator}</span>
                          <span className="fb-comment-dot">•</span>
                          <span className="fb-modal-comment-date">{c.date}</span>
                        </div>
                        <p className="fb-modal-comment-text">{c.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
