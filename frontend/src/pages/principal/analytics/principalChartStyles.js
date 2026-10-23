// Stable presentation only: never changes recorded values or classification.
// Assign against the full set so filtering and legend toggles never recolor it.
const mutedColors = [
  "#365779", "#A4773E", "#507C75", "#806486",
  "#A3635B", "#7C804F", "#587F9C", "#716C99",
  "#8C7059", "#55745D", "#986D80", "#677789",
];
export function mutedSeriesStyles(items) {
  const styles = new Map();
  const used = new Set();
  [...items].sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true })).forEach(item => {
    if (styles.has(item.id)) return;
    const hash = [...String(item.id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    let color;
    for (let offset = 0; offset < mutedColors.length; offset += 1) {
      const candidate = mutedColors[(hash + offset) % mutedColors.length];
      if (!used.has(candidate)) { color = candidate; break; }
    }
    // Larger rosters retain unique colors without introducing bright neon hues.
    let offset = 0;
    while (!color || used.has(color)) {
      color = `hsl(${((hash * 137.508 + offset * 137.508) % 360).toFixed(2)} 30% 42%)`;
      offset += 1;
    }
    used.add(color);
    styles.set(item.id, { color, dash: "", marker: "circle", lineWidth: 1.4 });
  });
  return styles;
}
export const hasRecordedGrades = item => item.status !== "No data" && (item.hasGrades ?? item.gradedLearners > 0);
