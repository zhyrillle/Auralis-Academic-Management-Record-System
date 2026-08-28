import {
  AlarmClock,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Paperclip,
  RotateCcwKey,
  X,
} from "lucide-react";
import DropdownSelect from "../../../components/common/DropdownSelect";
import "../../../styles/ReviewRequestDrawer.css";

const customDurationUnitOptions = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

function formatAttachmentSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function attachmentIsImage(attachment) {
  const type = String(attachment?.type || "").toLowerCase();
  const extension = String(attachment?.name || "").split(".").pop()?.toLowerCase();
  return type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
}

function attachmentTypeLabel(attachment) {
  if (attachment?.type) return attachment.type;
  const extension = String(attachment?.name || "").split(".").pop();
  return extension ? `${extension.toUpperCase()} file` : "File type unavailable";
}

export default function ReviewRequestDrawer({
  request,
  durationOptions,
  durationValue,
  customDurationMinutes,
  customDurationUnit,
  adminNote,
  surfaceRef,
  onDurationChange,
  onCustomDurationChange,
  onCustomDurationUnitChange,
  onAdminNoteChange,
  onClose,
  onDeny,
  onApprove,
  onPreviewAttachment,
}) {
  if (!request) {
    return null;
  }

  const customDurationLimits = {
    minutes: { min: 5, max: 43200 },
    hours: { min: 1, max: 720 },
    days: { min: 1, max: 30 },
  };
  const selectedLimits =
    customDurationLimits[customDurationUnit] || customDurationLimits.minutes;
  const customDurationNumber = Number(customDurationMinutes);
  const hasInvalidCustomDuration =
    durationValue === "custom" &&
    (!customDurationNumber ||
      customDurationNumber < selectedLimits.min ||
      customDurationNumber > selectedLimits.max);

  return (
    <div className="grade-lock-overlay" role="presentation">
      <aside
        className="grade-lock-drawer grade-lock-drawer--review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-request-drawer-title"
        ref={surfaceRef}
      >
        <div className="grade-lock-surface__header">
          <div>
            <h2 id="review-request-drawer-title">Review Reopening Request</h2>
          </div>
          <button
            type="button"
            className="grade-lock-icon-button"
            onClick={onClose}
            aria-label="Close review request"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grade-lock-drawer__body">
          <section aria-labelledby="request-details-title">
            <h3 id="request-details-title" className="grade-lock-form-title">
              Request Details
            </h3>
            <dl className="review-details">
              <div>
                <dt>Teacher</dt>
                <dd>{request.teacherName}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{request.subject}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>
                  {request.gradeLevel} {request.section}
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{request.reason}</dd>
              </div>
            </dl>

            <div className="review-attachment" aria-labelledby="request-attachment-title">
              <div className="review-attachment__heading">
                <Paperclip size={16} aria-hidden="true" />
                <h4 id="request-attachment-title">Attachment</h4>
              </div>

              {request.attachment ? (
                <div className="review-attachment__card">
                  <span className="review-attachment__preview" aria-hidden="true">
                    {attachmentIsImage(request.attachment) && request.attachment.url ? (
                      <img src={request.attachment.url} alt="" />
                    ) : attachmentIsImage(request.attachment) ? (
                      <ImageIcon size={20} />
                    ) : (
                      <FileText size={20} />
                    )}
                  </span>
                  <div className="review-attachment__details">
                    <strong>{request.attachment.name || "Request attachment"}</strong>
                    <span>
                      {attachmentTypeLabel(request.attachment)} • {formatAttachmentSize(request.attachment.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="review-attachment__action"
                    onClick={() => onPreviewAttachment(request.attachment)}
                    disabled={!request.attachment.url}
                    title={request.attachment.url ? "Preview attachment" : "The attachment file is unavailable"}
                  >
                    <Eye size={16} aria-hidden="true" />
                    <span>{request.attachment.url ? "View attachment" : "File unavailable"}</span>
                  </button>
                </div>
              ) : (
                <div className="review-attachment__empty">
                  No attachment provided.
                </div>
              )}
            </div>

            <div
              className="review-policy-reference"
              tabIndex={0}
              aria-label="View correction policy"
              aria-describedby="correction-policy-description"
            >
              <Info size={17} aria-hidden="true" />
              <div id="correction-policy-description">
                <strong>Correction policy</strong>
                <p>
                  Requests are accepted for seven days after the submission
                  deadline. Approved access applies only to this grade sheet.
                </p>
              </div>
            </div>
          </section>

          <section
            className="review-duration-section"
            aria-labelledby="temporary-duration-title"
          >
            <h3 id="temporary-duration-title" className="grade-lock-form-title">
              Temporary Access Duration
            </h3>
            <div className="grade-lock-field review-duration-field">
              <span>Duration</span>
              <DropdownSelect
                className="review-duration-dropdown"
                label="Temporary access duration"
                value={durationValue}
                options={durationOptions}
                onChange={onDurationChange}
              />
            </div>

            {durationValue === "custom" && (
              <div className="grade-lock-field review-duration-field">
                <span>Custom duration</span>
                <div className="custom-duration-control">
                  <input
                    type="number"
                    min={selectedLimits.min}
                    max={selectedLimits.max}
                    step="1"
                    value={customDurationMinutes}
                    aria-label="Custom duration value"
                    onChange={(event) =>
                      onCustomDurationChange(event.target.value)
                    }
                  />
                  <DropdownSelect
                    className="review-duration-unit-dropdown"
                    label="Custom duration unit"
                    value={customDurationUnit}
                    options={customDurationUnitOptions}
                    onChange={onCustomDurationUnitChange}
                  />
                </div>
              </div>
            )}

            <div
              className="grade-lock-info-box"
              tabIndex={0}
              aria-label="View temporary access expiration information"
              aria-describedby="temporary-access-expiration-description"
            >
              <AlarmClock size={19} aria-hidden="true" />
              <div id="temporary-access-expiration-description">
                <strong>Temporary Access expiration</strong>
                <p>Editing access will end when this period expires.</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="admin-note-title">
            <div className="grade-lock-label-row">
              <label id="admin-note-title" htmlFor="reopening-admin-note">
                Admin Note <span>(optional)</span>
              </label>
              <span>{adminNote.length} / 500</span>
            </div>
            <textarea
              id="reopening-admin-note"
              value={adminNote}
              maxLength="500"
              rows="4"
              placeholder="Add a note for this reopening..."
              onChange={(event) => onAdminNoteChange(event.target.value)}
            />
          </section>
        </div>

        <div className="grade-lock-surface__footer">
          <button
            type="button"
            className="grade-lock-button grade-lock-button--danger-outline"
            onClick={() => onDeny(request.id)}
          >
            Deny Request
          </button>
          <button
            type="button"
            className="grade-lock-button grade-lock-button--primary"
            onClick={() => onApprove(request.id, durationValue)}
            disabled={hasInvalidCustomDuration}
          >
            <RotateCcwKey size={16} aria-hidden="true" />
            Approve Reopening
          </button>
        </div>
      </aside>
    </div>
  );
}
