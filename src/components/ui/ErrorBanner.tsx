export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    return (
        <div
            style={{
                marginBottom: 24,
                padding: "14px 18px",
                background: "#fff5f5",
                border: "1px solid #fecaca",
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13.5,
                color: "#dc2626",
            }}
        >
            <span>⚠ {message}</span>
            <button
                onClick={onDismiss}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#dc2626",
                    fontSize: 16,
                    padding: "0 4px",
                    opacity: 0.6,
                }}
            >
                ×
            </button>
        </div>
    )
}