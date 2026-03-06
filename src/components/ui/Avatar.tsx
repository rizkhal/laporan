export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size * 2}&background=f0ede8&color=6b6660`

    return (
        <img
            src={src || fallback}
            alt={name}
            width={size}
            height={size}
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                border: "1px solid #e5e3de",
                flexShrink: 0,
                display: "block",
            }}
            onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = fallback
            }}
        />
    )
}