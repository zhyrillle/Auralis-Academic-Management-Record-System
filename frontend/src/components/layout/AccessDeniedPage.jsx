import { Home, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getRoleDefaultPath, getRoleDisplayTitle } from "../../utils/auth";
import "../../styles/accessDenied.css";

export default function AccessDeniedPage({ role, mode = "forbidden" }) {
  const navigate = useNavigate();
  const isNotFound = mode === "not-found";
  const destination = getRoleDefaultPath(role);

  return (
    <section className="route-status-page" aria-live="polite">
      <div className="route-status-card">
        <div className={`route-status-icon${isNotFound ? " route-status-icon--not-found" : ""}`}>
          <ShieldAlert size={30} aria-hidden="true" />
        </div>
        <p className="route-status-code">{isNotFound ? "404" : "403"}</p>
        <h1>{isNotFound ? "Page not found" : "Access denied"}</h1>
        <p className="route-status-description">
          {isNotFound
            ? "We couldn’t find a page at this address. Check the link or return to your dashboard."
            : `Your ${getRoleDisplayTitle(role)} account doesn’t have permission to view this page.`}
        </p>
        <button
          type="button"
          className="route-status-button"
          onClick={() => navigate(destination, { replace: true })}
        >
          <Home size={17} aria-hidden="true" />
          Return to my dashboard
        </button>
      </div>
    </section>
  );
}
