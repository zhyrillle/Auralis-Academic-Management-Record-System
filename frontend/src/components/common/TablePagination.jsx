export default function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = "student",
  itemLabelPlural = `${itemLabel}s`
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <footer className="student-admin-pagination">
    <span>{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} {total === 1 ? itemLabel : itemLabelPlural}</span>
    <div><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </footer>;
}
