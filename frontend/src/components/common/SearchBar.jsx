import { useState } from "react";
import { Search } from "lucide-react";

export default function SearchBar({ query, setQuery, placeholder = "Search...", id }) {
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
                minWidth: 0,
                maxWidth: "480px",
            }}
        >
            {/* Absolute positioned wrapper for the icon background layer */}
            <div
                className="icon-container"
                style={{
                    position: "absolute",
                    left: "1px",
                    top: "1px",
                    bottom: "1px",
                    pointerEvents: "none",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "46px",
                    borderTopLeftRadius: "30px",
                    borderBottomLeftRadius: "30px",
                    borderTopRightRadius: "0px",
                    borderBottomRightRadius: "0px",
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
                id={id}
                type="text"
                aria-label={placeholder}
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
                    boxSizing: "border-box",
                    fontFamily: "var(--font-inter)",
                    fontSize: "var(--fs-caption)",
                    fontWeight: "var(--fw-normal)",
                    backgroundColor: "var(--bg-white)",
                    color: "var(--subtext-color)",
                    border: `1px solid ${getBorderColor()}`,
                    borderRadius: "30px",

                    padding: "8px 16px 8px 60px",

                    outline: "none",
                    boxShadow: "none",
                    transition: "border-color 0.2s ease"
                }}
            />
        </div>
    );
}
