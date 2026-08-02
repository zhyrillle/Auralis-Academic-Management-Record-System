import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import sidebarLogo from "../../assets/adviser-assets/SidebarLogo.png";
import dashboardIcon from "../../assets/adviser-assets/Dashboard.png";
import sectionsIcon from "../../assets/adviser-assets/Sections.png";
import notificationIcon from "../../assets/adviser-assets/Notification.png";
import masterSheetIcon from "../../assets/adviser-assets/Mastersheet.png";
import performanceIcon from "../../assets/adviser-assets/Performance.png";
import feedbackIcon from "../../assets/adviser-assets/Feedback.png";
import requestIcon from "../../assets/adviser-assets/Request.png";
import defaultProfileImg from "../../assets/adviser-assets/Default Profile.png";
import logoutIcon from "../../assets/adviser-assets/logout-svgrepo-com 1.png";

export default function PerformanceReport({ user = "User" }) {
  const navigate = useNavigate();
  const [termOptions] = useState([]);
  const [sectionOptions] = useState([]);
  const [dataProvided] = useState(false);

  // (code)
  // useEffect(() => {
  //   async function loadFilters() {
  //     const response = await fetch("/api/adviser/performance/filters");
  //     const data = await response.json();
  //     setTermOptions(data.terms || []);
  //     setSectionOptions(data.sections || []);
  //   }
  //   loadFilters();
  // }, []);
  // (code)

  return (
    <div className="performance-page">
      <aside className="performance-sidebar">
        <div className="brand">
          <img src={sidebarLogo} alt="Sidebar Logo" className="brand-logo" />
        </div>

        <nav className="sidebar-nav">
          <Link className="nav-link" to="/adviser/dashboard">
            <img src={dashboardIcon} alt="Dashboard" className="nav-icon" />
            Dashboard
          </Link>
          <Link className="nav-link" to="#">
            <img src={sectionsIcon} alt="Sections" className="nav-icon" />
            Sections
          </Link>
          <Link className="nav-link" to="#">
            <img src={notificationIcon} alt="Notifications" className="nav-icon" />
            Notifications
          </Link>
          <Link className="nav-link" to="#">
            <img src={masterSheetIcon} alt="Master Sheet" className="nav-icon" />
            Master Sheet
          </Link>
          <Link className="nav-link active" to="/adviser/performance">
            <img src={performanceIcon} alt="Performance" className="nav-icon" />
            Performance
          </Link>
          <Link className="nav-link" to="#">
            <img src={feedbackIcon} alt="Feedback" className="nav-icon" />
            Feedback
          </Link>
          <Link className="nav-link" to="#">
            <img src={requestIcon} alt="Request" className="nav-icon" />
            Request
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="profile-block">
            <img src={defaultProfileImg} alt="Profile" className="profile-avatar" />
            <div>
              <p className="profile-name">{user}</p>
              <p className="profile-role">Adviser</p>
            </div>
          </div>

          <div className="logout-block" onClick={() => navigate("/")}>
            <img src={logoutIcon} alt="Logout" className="logout-icon" />
            <span>Logout</span>
          </div>
        </div>
      </aside>

      <main className="performance-main">
        <div className="performance-content">
          <h1 className="page-title">Performance Report</h1>

          <div className="filters-row">
            <div className="filters-label">FILTERS:</div>
            <div className="filters">
              <label className="filter-control">
                <select defaultValue="" aria-label="Term">
                  <option value="">Term</option>
                  {termOptions.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-control">
                <select defaultValue="" aria-label="Section">
                  <option value="">Section</option>
                  {sectionOptions.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="report-card">
          <h2>Mean and MPS</h2>
          <div className="table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Total Score</th>
                  <th>Number of Takers</th>
                  <th>Score Mean</th>
                  <th>MPS</th>
                </tr>
              </thead>
              <tbody>
                {!dataProvided && (
                  <tr>
                    <td colSpan={5} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-card">
          <h2>Grade Range</h2>
          <div className="table-wrap">
            <table className="performance-table grade-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>No Grade</th>
                  <th>60-74</th>
                  <th>75-79</th>
                  <th>80-84</th>
                  <th>85-89</th>
                  <th>90-100</th>
                </tr>
              </thead>
              <tbody>
                {!dataProvided && (
                  <tr>
                    <td colSpan={7} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
