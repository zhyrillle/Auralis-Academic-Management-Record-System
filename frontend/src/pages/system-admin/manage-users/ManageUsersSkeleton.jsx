const SkeletonBlock = ({ className = "" }) => (
  <span className={`manage-users-skeleton__block${className ? ` ${className}` : ""}`} />
);

export default function ManageUsersSkeleton() {
  return (
    <div className="manage-users-skeleton" role="status" aria-label="Loading user management data">
      <section className="users-panel" aria-hidden="true">
        <div className="users-panel-header manage-users-skeleton__panel-header">
          <div>
            <SkeletonBlock className="manage-users-skeleton__panel-title" />
            <SkeletonBlock className="manage-users-skeleton__panel-copy" />
          </div>
          <SkeletonBlock className="manage-users-skeleton__count" />
        </div>

        <div className="filter-container">
          <SkeletonBlock className="manage-users-skeleton__search" />
          <SkeletonBlock className="manage-users-skeleton__dropdown" />
          <SkeletonBlock className="manage-users-skeleton__dropdown" />
        </div>

        <div className="manage-users-skeleton__table">
          <SkeletonBlock className="manage-users-skeleton__table-header" />
          {Array.from({ length: 7 }, (_, index) => (
            <SkeletonBlock className="manage-users-skeleton__table-row" key={index} />
          ))}
        </div>
      </section>

      <span className="visually-hidden">Loading users.</span>
    </div>
  );
}
