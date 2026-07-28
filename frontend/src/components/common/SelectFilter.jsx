export default function SelectFilter({ value, onChange, options = [], minWidth = "150px" }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="select-filter"
            style={{
                minWidth,
                fontFamily: "var(--font-inter)",       /* Uses your Inter/UI font variable */
                fontSize: "var(--fs-caption)",           /* 13px small font token */
                fontWeight: "var(--fw-normal)",
                backgroundColor: "var(--bg-white)", /* Clean white background box */
                color: "var(--subtext-color)",                   /* Sleek charcoal text color */
                border: "1px solid #ffffffff",        /* Subtle gray border */
                borderRadius: "6px",
                padding: "6px 12px",
                cursor: "pointer",
                outline: "none"
            }}
        >
            {options.map((opt) => (
                <option
                    key={opt.value}
                    value={opt.value}
                    style={{
                        fontFamily: "var(--font-inter)",       /* Uses your Inter/UI font variable */
                        fontSize: "var(--fs-caption)",           /* 13px small font token */
                        fontWeight: "var(--fw-normal)",
                        backgroundColor: "var(--bg-white)", /* Clean white background box */
                        color: "var(--subtext-color)"
                    }}
                >
                    {opt.label}
                </option>
            ))}
        </select>
    );
}