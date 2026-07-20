import { useState } from "react";
import { Calendar, Check } from "lucide-react";

export default function SubmissionFooter({
    deadline,
    isSubmitted,
    onSubmit,

    userRole = "teacher",
    customDeadlineLabel,

    modalTitle = "Send grades to adviser?",
    modalDescription = "This will forward your section's grades to the class adviser for consolidation.",
    confirmText = "Submit",
    cancelText = "Cancel",
}) {
    const [showModal, setShowModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const getDeadlineLabel = () => {
        if (customDeadlineLabel) return customDeadlineLabel;

        switch (userRole) {
            case "admin":
                return "Admin Force-Lock Override:";
            case "registrar":
                return "Registry Verification Deadline:";
            default:
                return "Submission Deadline:";
        }
    };

    const handleConfirm = async () => {
        if (onSubmit) {
            await onSubmit();
        }

        setShowSuccess(true);

        setTimeout(() => {
            setShowSuccess(false);
            setShowModal(false);
        }, 1500);
    };

    return (
        <>
            <div
                className="persistent-footer"
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: "14px",
                    }}
                >
                    <Calendar
                        size={18}
                        color={
                            isSubmitted
                                ? "var(--subtext-color)"
                                : "var(--danger-text-color)"
                        }
                    />

                    <span>{getDeadlineLabel()}</span>

                    <span
                        style={{
                            color: isSubmitted
                                ? "var(--subtext-color)"
                                : "var(--danger-text-color)",
                            fontWeight: 600,
                        }}
                    >
                        {deadline
                            ? new Date(deadline).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                            })
                            : "N/A"}
                    </span>
                </div>

                <button
                    disabled={isSubmitted}
                    onClick={() => setShowModal(true)}
                    style={{
                        fontFamily: "var(--font-montserrat)",
                        backgroundColor: isSubmitted
                            ? "var(--unavailable-bg)"
                            : "var(--success-text-color)",
                        color: isSubmitted ? "var(--unavailable-text-color)" : "var(--white-text-color)",
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 45px",
                        fontWeight: "var(--fw-bold)",
                        cursor: isSubmitted ? "not-allowed" : "pointer",
                        pointerEvents: isSubmitted ? "none" : "auto",
                        transition: "none",
                        transform: "none",
                        boxShadow: "none",
                    }}
                >
                    {isSubmitted ? "Submitted" : "Submit"}
                </button>
            </div>

            {showModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.35)",
                        backdropFilter: "blur(3px)",
                        WebkitBackdropFilter: "blur(3px)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            width: "480px",
                            background: "#fff",
                            borderRadius: "20px",
                            padding: "40px",
                            boxShadow: "0 15px 40px rgba(0,0,0,.15)",
                            textAlign: "center",
                        }}
                    >
                        {!showSuccess ? (
                            <>
                                <h1
                                    style={{
                                        margin: 0,
                                        fontFamily: "var(--font-dm-sans)",
                                        fontSize: "var(--fs-h2)",
                                        fontWeight: "var(--fw-bold)",
                                        color: "var(--primary-highlight-color)",
                                    }}
                                >
                                    {modalTitle}
                                </h1>

                                <p
                                    style={{
                                        marginTop: "14px",
                                        marginBottom: "32px",
                                        fontFamily: "var(--font-montserrat)",
                                        color: "var(--default-text-color)",
                                        fontSize: "var(--fs-subtext)",
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {modalDescription}
                                </p>

                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        gap: "14px",
                                    }}
                                >
                                    <button
                                        onClick={() => setShowModal(false)}
                                        style={{
                                            width: "150px",
                                            height: "35px",
                                            border: "1px solid var(--unavailable-bg)",
                                            borderRadius: "20px",
                                            color: "var(--cancel-text-color)",
                                            background: "var(--unavailable-bg)",
                                            fontFamily: "var(--font-montserrat)",
                                            fontWeight: "var(--fw-bold)",
                                            fontSize: "var(--fs-body)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {cancelText}
                                    </button>

                                    <button
                                        onClick={handleConfirm}
                                        style={{
                                            width: "150px",
                                            height: "35px",
                                            border: "1px solid var(--success-text-color)",
                                            borderRadius: "20px",
                                            color: "var(--white-text-color)",
                                            background: "var(--success-text-color)",
                                            fontFamily: "var(--font-montserrat)",
                                            fontWeight: "var(--fw-bold)",
                                            fontSize: "var(--fs-body)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {confirmText}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div
                                    style={{
                                        width: "80px",
                                        height: "80px",
                                        borderRadius: "50%",
                                        background: "var(--primary-color)",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        margin: "0 auto 24px",
                                    }}
                                >
                                    <Check
                                        size={48}
                                        color="#fff"
                                        strokeWidth={3}
                                    />
                                </div>

                                <h2
                                    style={{
                                        margin: 0,
                                        fontFamily: "var(--font-dm-sans)",
                                        fontSize: "var(--fs-h2)",
                                        fontWeight: "var(--fw-bold)",
                                        color: "var(--primary-highlight-color)",
                                    }}
                                >
                                    Grades submitted successfully
                                </h2>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}