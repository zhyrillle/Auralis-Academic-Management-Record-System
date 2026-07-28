import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function SelectFilter({ value, onChange, options = [], minWidth = "150px" }) {
    const [isHovered, setIsHovered] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = () => {
        setIsOpen((prev) => !prev);
    };

    const handleChange = (e) => {
        onChange(e.target.value);
        setIsOpen(false);
    };

    const handleBlur = () => {
        setIsOpen(false);
    };

    return (
        <div
            style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                minWidth,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >

            <select
                value={value}
                onChange={handleChange}
                onClick={handleClick}
                onBlur={handleBlur}
                className="select-filter"
                style={{
                    width: "100%",
                    minWidth,

                    fontFamily: "var(--font-inter)",
                    fontSize: "var(--fs-caption)",
                    fontWeight: "var(--fw-normal)",

                    backgroundColor: "var(--bg-white)",
                    color: "var(--subtext-color)",

                    border: "1px solid #ffffff",
                    borderRadius: "6px",

                    padding: "6px 36px 6px 12px",

                    cursor: "pointer",
                    appearance: "none",

                    outline: (isHovered || isOpen)
                        ? "1px solid #123062"
                        : "none",

                    boxShadow: "none",

                    transition: "outline 0.2s ease",
                }}
            >
                {options.map((opt) => (
                    <option
                        key={opt.value}
                        value={opt.value}
                        style={{
                            fontFamily: "var(--font-inter)",
                            fontSize: "var(--fs-caption)",
                            fontWeight: "var(--fw-normal)",
                            backgroundColor: "var(--bg-white)",
                            color: "var(--subtext-color)",
                        }}
                    >
                        {opt.label}
                    </option>
                ))}
            </select>


            <ChevronDown
                size={20}
                style={{
                    position: "absolute",
                    right: "10px",
                    pointerEvents: "none",

                    padding: "2px",

                    color: isHovered || isOpen
                        ? "#123062"
                        : "var(--subtext-color)",

                    transform: isOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",

                    transition: "transform 0.2s ease, color 0.2s ease",
                }}
            />

        </div>
    );
}