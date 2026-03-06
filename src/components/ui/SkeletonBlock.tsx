export function SkeletonBlock() {
    return (
        <div
            style={{
                border: "1px solid #e8e5e0",
                borderRadius: 12,
                marginBottom: 12,
                padding: "18px 22px",
                background: "#fff",
            }}
        >
            <div
                style={{
                    height: 12,
                    width: 80,
                    borderRadius: 4,
                    background: "#f0ede8",
                    marginBottom: 8,
                    animation: "shimmer 1.5s ease-in-out infinite",
                }}
            />
            <div
                style={{
                    height: 18,
                    width: 180,
                    borderRadius: 4,
                    background: "#f0ede8",
                    animation: "shimmer 1.5s ease-in-out infinite",
                }}
            />
        </div>
    )
}
