export default function StatusBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  const isCompliant = normalized === "compliant";
  const isPartial = normalized === "partial";
  const background = isCompliant
    ? "rgba(16,185,129,0.1)"
    : isPartial
      ? "rgba(245,158,11,0.12)"
      : "rgba(239,68,68,0.1)";
  const border = isCompliant
    ? "rgba(16,185,129,0.3)"
    : isPartial
      ? "rgba(245,158,11,0.35)"
      : "rgba(239,68,68,0.3)";
  const color = isCompliant
    ? "var(--accent-compliant)"
    : isPartial
      ? "var(--accent-warning)"
      : "var(--accent-gap)";

  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 4,
        background,
        border: `1px solid ${border}`,
        color,
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {normalized}
    </span>
  );
}
