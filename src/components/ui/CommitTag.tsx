import { TYPE_COLORS } from "../../config/theme";

export function CommitTag({ type, scope }: { type: string; scope: string | null }) {
    const color = TYPE_COLORS[type] ?? "#9ca3af"
    const label = scope ? `${type}(${scope})` : type
    return (
        <span
            style={{
                fontSize: 11,
                fontWeight: 600,
                color,
                background: color + "18",
                padding: "2px 8px",
                borderRadius: 4,
                letterSpacing: "0.04em",
                flexShrink: 0,
                fontFamily: "monospace",
            }}
        >
            {label}
        </span>
    )
}