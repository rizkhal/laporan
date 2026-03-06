export function SummaryCard({ text, loading }: { text: string; loading: boolean }) {
    const parts = text.split(/\*\*(.*?)\*\*/g)
    return (
        <div
            style={{
                background: "#f8f7f4",
                border: "1px solid #e5e3de",
                borderRadius: 10,
                padding: "18px 22px",
                marginBottom: 24,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "#9b9690",
                    textTransform: "uppercase",
                    marginBottom: 10,
                }}
            >
                ✦ AI Summary
            </div>
            {loading ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                        <span
                            key={i}
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "#c0bdb8",
                                display: "inline-block",
                                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }}
                        />
                    ))}
                    <span style={{ fontSize: 13, color: "#9b9690", marginLeft: 8 }}>
                        Generating summary…
                    </span>
                </div>
            ) : (
                <p style={{ margin: 0, lineHeight: 1.75, color: "#3d3a35", fontSize: 14 }}>
                    {parts.map((part, i) =>
                        i % 2 === 1 ? (
                            <strong key={i} style={{ color: "#1a1916" }}>
                                {part}
                            </strong>
                        ) : (
                            part
                        )
                    )}
                </p>
            )}
        </div>
    )
}