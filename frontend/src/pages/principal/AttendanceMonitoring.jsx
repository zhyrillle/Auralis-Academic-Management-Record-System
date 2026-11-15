import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  ChevronDown,
  Info,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import FilterToolbar from "../../components/common/FilterToolbar";
import OverlayPanel from "../../components/common/OverlayPanel";
import SearchBar from "../../components/common/SearchBar";
import TablePagination from "../../components/common/TablePagination";
import PageSkeleton, {
  SkeletonCards,
  SkeletonTable,
} from "../../components/common/PageSkeleton";
import useCachedQuery from "../../services/useCachedQuery";
import { cacheKey } from "../../services/navigationCache";
import {
  getAttendanceOptions,
  getAttendanceOverview,
} from "../../services/monitoringOverviewApi";
import { getStoredUser } from "../../utils/auth";
import "../../styles/principalAnalytics.css";
import "../../styles/studentMonitoring.css";
import "../../styles/attendanceMonitoring.css";

const dateLabel = (date) =>
  date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
const levels = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((tier) => [`tier${tier}`, `Tier ${tier}`])),
  none: "No recorded absences",
  upcoming: "Not started",
  unavailable: "Unavailable",
};
const overviewCards = (policy) => [
  { value: "", label: "Total students", note: "Learners in the selected grade and section" },
  ...(policy?.tiers || []).map((tier) => ({
    value: `tier${tier.tier}`, label: `Tier ${tier.tier}`, note: tier.range,
  })),
];
const matchesAlert = (row, alert) => !alert || row.level === alert;

function AttendanceOverview({ cards, counts, alert, onSelect }) {
  return (
    <section className="attendance-monitor__overview" aria-label="Attendance overview">
      <button type="button" className="attendance-monitor__card--total attendance-monitor__total"
        aria-label="View all students" aria-pressed={!alert} onClick={() => onSelect("")}>
        <span>Total students</span>
        <strong className="attendance-monitor__stat-value">{counts[""]}</strong>
        <small>{cards[0].note}</small>
      </button>
      <div className="attendance-monitor__tiers">
        {cards.slice(1).map((card) => (
          <button type="button" key={card.value} className={`attendance-monitor__tier attendance-monitor__card--${card.value}`}
            aria-label={`View ${card.label.toLowerCase()}, ${card.note}`} aria-pressed={alert === card.value}
            onClick={() => onSelect(alert === card.value ? "" : card.value)}>
            <span>{card.label}</span>
            <strong className={`attendance-monitor__stat-value${counts[card.value] === 0 ? " is-zero" : ""}`}>{counts[card.value]}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function Alerts({ student }) {
  return <span className={`attendance-monitor__badge attendance-monitor__badge--${student.level}`}>{levels[student.level]}</span>;
}

function AttendanceInformation({ policy, onClose }) {
  return (
    <OverlayPanel isOpen onClose={onClose} variant="modal" title="How attendance monitoring works" className="attendance-information">
      <section>
        <h3>School-year attendance</h3>
        <p>Monitoring uses saved adviser attendance from the start of the selected school year through the displayed date. Weekends, term breaks, and saved no-class dates are excluded.</p>
      </section>
      <section>
        <h3>Accumulated occurrences</h3>
        <p>Each recorded absence counts as one occurrence. Occurrences accumulate across the selected school year and do not need to be consecutive. Late arrivals are counted separately.</p>
      </section>
      <section>
        <h3>Progressive intervention tiers</h3>
        <ul>{policy.tiers.map((tier) => <li key={tier.tier}><strong>Tier {tier.tier} · {tier.range}:</strong> {tier.guidance}</li>)}</ul>
      </section>
      <section>
        <h3>Reading the counts</h3>
        <p>The overview follows the grade and section filters. Search and the tier selector narrow the learner list. Counts reflect recorded attendance through the displayed date.</p>
      </section>
      <section><h3>Monitoring guidance only</h3><p>{policy.disclaimer}</p></section>
    </OverlayPanel>
  );
}

function DateList({ dates, label }) {
  return (
    <ul className="attendance-review__dates" aria-label={label}>
      {dates.map((date) => (
        <li key={date}>
          <time dateTime={date}>{dateLabel(date)}</time>
        </li>
      ))}
    </ul>
  );
}

function MonthlyBreakdown({ student }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (month) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(month)) next.delete(month); else next.add(month);
    return next;
  });
  return (
    <section className="attendance-review__monthly">
      <h3>Monthly breakdown</h3>
      <p>Expand a month to see recorded absence and late-arrival dates.</p>
      <div className="attendance-monitor__scroll" tabIndex={0} role="region" aria-label="Monthly attendance breakdown">
        <table>
          <thead><tr><th scope="col">Month</th><th scope="col">Occurrences</th><th scope="col">Late</th></tr></thead>
          <tbody>{student.monthly.map((row) => {
            const isOpen = expanded.has(row.month);
            const panelId = `attendance-month-${student.id}-${row.month}`;
            return (
              <Fragment key={row.month}>
                <tr className={isOpen ? "attendance-review__month--open" : ""}>
                  <th scope="row">
                    <button type="button" className="attendance-review__month-toggle" aria-expanded={isOpen}
                      aria-controls={panelId} onClick={() => toggle(row.month)}>
                      <ChevronDown size={16} aria-hidden="true" /><span>{monthLabel(row.month)}</span>
                    </button>
                  </th>
                  <td data-label="Occurrences">{row.occurrences}</td><td data-label="Late">{row.late}</td>
                </tr>
                <tr hidden={!isOpen} id={panelId} className="attendance-review__month-details">
                  <td colSpan={3}><div className="attendance-review__month-content">
                    <section><h4>Absence dates · {row.absent}</h4>
                      {row.absenceDates.length ? <DateList dates={row.absenceDates} label={`Absence dates in ${monthLabel(row.month)}`} />
                        : <p>No absences recorded for this month.</p>}
                    </section>
                    <section><h4>Late-arrival dates · {row.late}</h4>
                      {row.lateDates.length ? <DateList dates={row.lateDates} label={`Late dates in ${monthLabel(row.month)}`} />
                        : <p>No late arrivals recorded for this month.</p>}
                    </section>
                  </div></td>
                </tr>
              </Fragment>
            );
          })}</tbody>
        </table>
      </div>
      {!student.monthly.length && <p>No elapsed class days in this school year.</p>}
    </section>
  );
}

function GuidedIntervention({ student, policy }) {
  const tier = policy.tiers.find((row) => row.tier === student.interventionTier);
  const unavailable = student.level === "upcoming" ? "There are no elapsed class days yet."
    : student.level === "unavailable" ? "Attendance totals are currently unavailable."
      : "No accumulated absences are recorded.";
  return (
    <section className="attendance-review__guidance" aria-label="Guided Intervention">
      <div className="attendance-review__guidance-heading"><h3>Guided Intervention</h3><span>Read-only reference</span></div>
      {tier ? <>
        <p className="attendance-review__tier-label">
          <span className={`attendance-monitor__badge attendance-monitor__badge--${student.level}`}>Tier {tier.tier}</span>
          <strong>{tier.range}</strong>
        </p>
        <p>{tier.guidance}</p>
        <p className="attendance-review__hint">{student.occurrences} cumulative {student.occurrences === 1 ? "absence" : "absences"} recorded this school year. Late arrivals are tracked separately.</p>
      </> : <p>{unavailable}</p>}
    </section>
  );
}

function AttendanceReview({ student, context, policy, onClose }) {
  const unavailable = student.level === "unavailable";
  return (
    <OverlayPanel isOpen onClose={onClose} variant="modal" title="Attendance review"
      description={`${student.name} · Grade ${student.grade} · ${student.section}`} className="attendance-review"
      footer={<button type="button" className="attendance-monitor__primary" onClick={onClose}>Done</button>}>
      <section className="attendance-review__identity" aria-label="Learner attendance context">
        <Alerts student={student} />
        <dl className="attendance-review__facts">
          <div><dt>School year</dt><dd>{context.schoolYear}</dd></div>
          <div><dt>Adviser</dt><dd>{student.adviser}</dd></div>
          <div><dt>Records through</dt><dd>{dateLabel(context.asOf)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>Attendance totals</h3>
        <dl className="attendance-review__totals">
          <div><dt>Actual absences</dt><dd>{unavailable ? "—" : student.absent}</dd></div>
          <div><dt>Late arrivals</dt><dd>{unavailable ? "—" : student.late}</dd></div>
          <div><dt>Longest streak</dt><dd>{unavailable || student.longestStreak == null ? "—" : `${student.longestStreak} ${student.longestStreak === 1 ? "day" : "days"}`}</dd></div>
        </dl>
        <p className="attendance-review__hint">Longest streak counts consecutive class days marked absent. Tiers use cumulative absences.</p>
      </section>
      <GuidedIntervention student={student} policy={policy} />
      <MonthlyBreakdown student={student} />
    </OverlayPanel>
  );
}

export default function AttendanceMonitoring() {
  const user = getStoredUser();
  const userId = user?.user_id || user?.id;
  const options = useCachedQuery(
    cacheKey("attendance-options-v5", { userId }),
    getAttendanceOptions,
  );
  const [year, setYear] = useState("");
  const schoolYear = year || options.data?.defaultSchoolYear || "";
  const overview = useCachedQuery(
    cacheKey("attendance-overview-v5", { userId, schoolYear }),
    () => getAttendanceOverview(schoolYear),
    { enabled: Boolean(schoolYear) },
  );
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [alert, setAlert] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [showInformation, setShowInformation] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const students = useMemo(
    () => overview.data?.students || [],
    [overview.data],
  );
  const sections = [
    ...new Map(
      students
        .filter((row) => !grade || row.grade === Number(grade))
        .map((row) => [
          String(row.sectionId),
          { value: String(row.sectionId), label: row.section },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const scope = students.filter(
    (row) =>
      (!grade || row.grade === Number(grade)) &&
      (!section || String(row.sectionId) === section),
  );
  const cards = overviewCards(overview.data?.policy);
  const alertOptions = [
    { value: "", label: "All alerts" },
    ...cards
      .filter((card) => card.value)
      .map(({ value, label, note }) => ({
        value,
        label: value.startsWith("tier") ? `${label} · ${note}` : label,
      })),
    { value: "none", label: "No recorded absences" },
  ];
  const filtered = scope.filter(
    (row) =>
      matchesAlert(row, alert) &&
      row.name.toLowerCase().includes(search.toLowerCase().trim()),
  );
  const counts = Object.fromEntries(
    cards.map((card) => [
      card.value,
      scope.filter((row) => matchesAlert(row, card.value)).length,
    ]),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 15)),
  );
  const review = students.find((row) => row.id === selected);
  const change = (setter, value) => {
    setter(value);
    setPage(1);
    setSelected(null);
  };
  const loading = options.loading || overview.loading;
  const error = options.error || overview.error;
  const retry = () => (options.error ? options.refresh() : overview.refresh());
  return (
    <div className="pa-page attendance-monitor">
      <header className="attendance-monitor__header">
        <div>
          <div className="attendance-monitor__title">
            <h1>Attendance Monitoring</h1>
            <button
              type="button"
              className="attendance-monitor__info"
              aria-label="How attendance monitoring works"
              disabled={!overview.data?.policy}
              onClick={() => setShowInformation(true)}
            >
              <Info size={18} aria-hidden="true" />
            </button>
          </div>
          <p>School-year attendance alerts from adviser records.</p>
        </div>
        {overview.data && (
          <div className="attendance-monitor__scope">
            <CalendarCheck2 size={16} aria-hidden="true" />{" "}
            {overview.data.context.schoolYear} · Through{" "}
            {dateLabel(overview.data.context.asOf)}
            <button type="button" className="attendance-monitor__info" aria-label="Monitoring guidance only" title="Monitoring guidance only" onClick={() => setShowGuidance(true)}><Info size={18} aria-hidden="true" /></button>
          </div>
        )}
      </header>
      <FilterToolbar
        label="Attendance monitoring filters"
        end={
          <DropdownSelect
            label="School year"
            value={schoolYear}
            options={options.data?.schoolYears || []}
            placeholder="School year"
            disabled={options.loading}
            onChange={(value) => {
              change(setYear, value);
              setSection("");
            }}
          />
        }
      >
        <DropdownSelect
          label="Grade level"
          value={grade}
          options={[
            { value: "", label: "All grade levels" },
            ...[7, 8, 9, 10].map((value) => ({
              value: String(value),
              label: `Grade ${value}`,
            })),
          ]}
          onChange={(value) => {
            change(setGrade, value);
            setSection("");
          }}
        />
        <DropdownSelect
          label="Section"
          value={section}
          options={[{ value: "", label: "All sections" }, ...sections]}
          onChange={(value) => change(setSection, value)}
        />
      </FilterToolbar>
      {error && (
        <div className="attendance-monitor__error" role="alert">
          {String(error)}{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {loading && (
        <PageSkeleton label="Loading school-year attendance">
          <SkeletonCards count={7} />
          <SkeletonTable rows={7} columns={6} />
        </PageSkeleton>
      )}
      {!loading && overview.data && (
        <>
          <AttendanceOverview cards={cards} counts={counts} alert={alert} onSelect={(value) => change(setAlert, value)} />
          <div className="attendance-monitor__table-card">
            <div className="attendance-monitor__table-heading">
              <h2>Learner attendance</h2>
              <div className="attendance-monitor__table-filters">
                <SearchBar
                  query={search}
                  setQuery={(value) => change(setSearch, value)}
                  placeholder="Search learner name…"
                />
                <DropdownSelect
                  label="Attendance alert"
                  value={alert}
                  options={alertOptions}
                  onChange={(value) => change(setAlert, value)}
                />
              </div>
            </div>
            <div
              className="attendance-monitor__scroll"
              tabIndex={0}
              role="region"
              aria-label="Learner attendance records"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Late</th>
                    <th scope="col">Longest streak</th>
                    <th scope="col">Alerts</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((currentPage - 1) * 15, currentPage * 15)
                    .map((student) => (
                      <tr key={student.id}>
                        <td>
                          <strong>{student.name}</strong>
                          <small>
                            Grade {student.grade} · {student.section}
                          </small>
                        </td>
                        <td>{student.level === "unavailable" ? "—" : student.absent}</td>
                        <td>{student.level === "unavailable" ? "—" : student.late}</td>
                        <td>
                          {student.level === "unavailable" || student.longestStreak == null ? "—" : `${student.longestStreak} ${student.longestStreak === 1 ? "day" : "days"}`}
                        </td>
                        <td>
                          <Alerts student={student} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sm-detail-button"
                            onClick={() => setSelected(student.id)}
                            aria-label={`Review ${student.name}`}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <div className="attendance-monitor__empty">
                <AlertTriangle size={20} aria-hidden="true" />
                <h3>No matching learners</h3>
                <p>Try another alert, section, or search.</p>
              </div>
            )}
            <TablePagination
              page={currentPage}
              pageSize={15}
              total={filtered.length}
              onPageChange={setPage}
              itemLabel="learner"
            />
          </div>
        </>
      )}
      {!loading && !error && !schoolYear && (
        <p className="attendance-monitor__notice">
          No school years are configured.
        </p>
      )}
      {review && (
        <AttendanceReview
          key={review.id}
          student={review}
          context={overview.data.context}
          policy={overview.data.policy}
          onClose={() => setSelected(null)}
        />
      )}
      {showGuidance && <OverlayPanel isOpen onClose={() => setShowGuidance(false)} variant="modal" title="Monitoring guidance only" className="attendance-information"><p>{overview.data.policy.disclaimer}</p></OverlayPanel>}
      {showInformation && (
        <AttendanceInformation
          policy={overview.data.policy}
          onClose={() => setShowInformation(false)}
        />
      )}
    </div>
  );
}
