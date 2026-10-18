import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  BookOpen,
  GraduationCap,
  RefreshCw,
  UserRound,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import SearchBar from "../../components/common/SearchBar";
import EmptyState from "../../components/common/EmptyState";
import FilterToolbar from "../../components/common/FilterToolbar";
import BackButton from "../../components/common/BackButton";
import ClassCard from "../../components/sections/ClassCard";
import useCachedQuery from "../../services/useCachedQuery";
import { cacheKey } from "../../services/navigationCache";
import {
  getDepartmentSections,
  getDepartmentPhilIri,
  useDepartmentContext,
} from "../../services/deptHeadMonitoringApi";
import DeptClassRecord from "./DeptClassRecord";
import DeptPhilIriDetail from "./DeptPhilIriDetail";
import "../../styles/departmentMonitoring.css";

const gradeLabel = (section) =>
  String(
    section.gradeLevelName || `G${Number(section.gradeLevelId) + 6}`,
  ).replace(/^Grade\s*/i, "G");

export function MonitoringState({
  loading,
  error,
  onRetry,
  title = "No sections found",
  description = "Try another school year, grade level, or search.",
}) {
  return (
    <div
      className="dept-monitor-state"
      role={loading ? "status" : error ? "alert" : undefined}
    >
      {loading ? (
        <>
          <RefreshCw className="dept-monitor-spin" size={23} />
          <strong>Loading records…</strong>
        </>
      ) : (
        <>
          <EmptyState
            icon={BookOpen}
            title={error ? "Records are unavailable" : title}
            description={error || description}
          />
          {error && (
            <button
              type="button"
              className="dept-monitor-button"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function DepartmentDirectory({ mode = "records" }) {
  const philIri = mode === "phil-iri";
  const context = useDepartmentContext();
  const [params, setParams] = useSearchParams();
  const scroll = useRef(0);
  const sectionId = params.get("section");
  const yearId =
    params.get("year") ||
    String(
      (
        context.data?.schoolYears.find((year) => year.isCurrent) ||
        context.data?.schoolYears[0]
      )?.id || "",
    );
  const gradeId = params.get("grade") || "all";
  const search = params.get("q") || "";

  const allowed = Boolean(
    context.data && (!philIri || context.data.canViewPhilIri),
  );
  const directory = useCachedQuery(
    cacheKey("department-directory", { mode, yearId }),
    () =>
      philIri ? getDepartmentPhilIri(yearId) : getDepartmentSections(yearId),
    { enabled: Boolean(yearId && allowed) },
  );
  const update = (changes) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(changes).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        next.delete("page");
        next.delete("section");
        return next;
      },
      { replace: true },
    );
  const sections = directory.data?.sections || [];
  const filtered = sections.filter(
    (section) =>
      (gradeId === "all" || String(section.gradeLevelId) === gradeId) &&
      `${section.sectionName} ${section.teacherName} ${section.adviserName || ""} ${section.programCode}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  const selected = sections.find(
    (section) => String(section.sectionId) === sectionId,
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = document.querySelector(".page-content-area");
      if (container) container.scrollTop = sectionId ? 0 : scroll.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [sectionId]);
  const open = (section) => {
    scroll.current =
      document.querySelector(".page-content-area")?.scrollTop || 0;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("section", section.sectionId);
      next.set("year", yearId);
      return next;
    });
  };
  const back = () =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("section");
      return next;
    });
  if (context.loading || context.error)
    return (
      <div className="dept-monitor-page">
        <MonitoringState
          loading={context.loading}
          error={context.error}
          onRetry={context.refresh}
        />
      </div>
    );
  if (!allowed)
    return (
      <div className="dept-monitor-page">
        <MonitoringState
          title="PHIL-IRI access is restricted"
          description="PHIL-IRI monitoring is available to the English Department Head."
        />
      </div>
    );
  if (sectionId) {
    if (directory.loading || directory.error)
      return (
        <div className="dept-monitor-page">
          <MonitoringState
            loading={directory.loading}
            error={directory.error}
            onRetry={directory.refresh}
          />
        </div>
      );
    if (!selected)
      return (
        <div className="dept-monitor-page">
          <BackButton onClick={back} />
          <MonitoringState
            title="Section not available"
            description="This section has no assigned subject offering in the selected school year."
          />
        </div>
      );
    return philIri ? (
      <DeptPhilIriDetail
        key={`${yearId}:${sectionId}`}
        section={selected}
        schoolYearId={yearId}
        context={context.data}
        onBack={back}
      />
    ) : (
      <DeptClassRecord
        key={`${yearId}:${sectionId}`}
        selection={{
          section: selected,
          schoolYearId: yearId,
          context: context.data,
        }}
        onBack={back}
      />
    );
  }
  return (
    <div className="dept-monitor-page">
      <header className="dept-monitor-header">
        <div>
          <p className="dept-monitor-eyebrow">
            {context.data.department.name} DEPARTMENT
          </p>
          <h1>{philIri ? "PHIL-IRI Monitoring" : "Class Records"}</h1>
          <p>
            {philIri
              ? "Review recorded screening and post-test results by section."
              : `Browse sections and review ${context.data.subject.name} class records.`}
          </p>
        </div>
        <span className="dept-monitor-readonly">
          <GraduationCap size={16} />
          Read-only monitoring
        </span>
      </header>
      <FilterToolbar label="Section navigation" className="dept-monitor-navigation" end={<>
        <DropdownSelect label="School year" value={yearId}
          options={context.data.schoolYears.map(year => ({ value: String(year.id), label: 'SY ' + year.label }))}
          onChange={value => update({ year: value })} />
        <DropdownSelect label="Grade level" value={gradeId}
          options={[{ value: 'all', label: 'All grade levels' }, ...context.data.gradeLevels.map(grade => ({ value: String(grade.id), label: grade.name }))]}
          onChange={value => update({ grade: value })} />
        <span className="dept-monitor-section-count" aria-label="Section count" aria-live="polite">
          <strong>{directory.loading || directory.error ? '—' : filtered.length}</strong> {filtered.length === 1 ? 'section' : 'sections'}
        </span>
      </>}>
        <SearchBar query={search} setQuery={value => update({ q: value })} placeholder="Search sections or teachers…" />
      </FilterToolbar>
      {directory.loading || directory.error || !filtered.length ? (
        <MonitoringState
          loading={directory.loading}
          error={directory.error}
          onRetry={directory.refresh}
          title={
            !context.data.schoolYears.length
              ? "No school years available"
              : "No sections found"
          }
        />
      ) : (
        <>

          <div className="section-card-grid dept-monitor-grid">
            {filtered.map((section) => (
              <ClassCard key={section.sectionId} className="section-card dept-adviser-card"
                gradeId={section.gradeLevelId}
                cls={{ sectionName: section.sectionName, gradeLevel: gradeLabel(section),
                  subject: context.data.subject.name, programCode: section.programCode,
                  is_specialized: section.programCode !== 'EBEC' }}
                hideClassType showSecondaryActions={false}
                viewAriaLabel={philIri ? 'View PHIL-IRI Results' : 'View Class Records'}
                onView={() => open(section)}>
                <div className="dept-class-card-facts">
                  <span><Users size={14} aria-hidden="true" />{section.learnerCount} students</span>
                  <span title={'Class adviser: ' + (section.adviserName || 'Not assigned')}><UserRound size={14} aria-hidden="true" /><span>Adviser: {section.adviserName || 'Not assigned'}</span></span>
                </div>
                {philIri && (
                  <div className="dept-monitor-completion">
                    <p>
                      <span>Screening</span>
                      <strong>
                        {section.screeningComplete === null
                          ? "Unavailable"
                          : `${section.screeningComplete} / ${section.learnerCount} complete`}
                      </strong>
                    </p>
                    <p>
                      <span>Post-Test</span>
                      <strong>
                        {section.postTestComplete === null
                          ? "Unavailable"
                          : `${section.postTestComplete + section.postTestIncomplete} recorded`}
                      </strong>
                    </p>
                  </div>
                )}
              </ClassCard>
            ))}
          </div>

        </>
      )}
    </div>
  );
}
