import { useState } from "react";
import { Search } from "lucide-react";

export default function SearchBar({ query, setQuery, placeholder = "Search..." }) {
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Dynamic border color based on interaction state
    const getBorderColor = () => {
        if (isFocused) return "#112d61"; // Primary active color
        if (isHovered) return "color-mix(in srgb, var(--subtext-color) 70%, #000000)"; // Darker hover color
        return "var(--subtext-color)"; // Default static color
    };

    return (
        <div
            className="search-bar-container"
            style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                width: "100%",
                maxWidth: "480px",
            }}
        >
            {/* Absolute positioned wrapper for the icon background layer */}
            <div
                className="icon-container"
                style={{
                    position: "absolute",
                    left: "0px",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "50px",
                    height: "33px",
                    borderTopLeftRadius: "30px",
                    borderBottomLeftRadius: "30px",
                    borderTopRightRadius: "20px",
                    borderBottomRightRadius: "20px",
                    backgroundColor: isFocused ? "var(--primary-color)" : "transparent",
                    transition: "background-color 0.2s ease"
                }}
            >
                <Search
                    size={18}
                    className="search-icon"
                    style={{
                        color: isFocused ? "var(--white-text-color)" : "var(--subtext-color)",
                        pointerEvents: "none",
                        transition: "color 0.2s ease"
                    }}
                />
            </div>

            <input
                type="text"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="search-input"
                style={{
                    width: "100%",
                    fontFamily: "var(--font-inter)",
                    fontSize: "var(--fs-caption)",
                    fontWeight: "var(--fw-normal)",
                    backgroundColor: "var(--bg-white)",
                    color: "var(--subtext-color)",
                    border: `1px solid ${getBorderColor()}`,
                    borderRadius: "30px",

                    /* --- THE FIX --- */
                    /* Changed left padding to 60px. This leaves a clean 10px buffer space 
                       after your 50px wide icon container so text never touches it. */
                    padding: "8px 16px 8px 60px",

                    outline: "none",
                    boxShadow: "none",
                    transition: "border-color 0.2s ease"
                }}
            />
        </div>
    );
}