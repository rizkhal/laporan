import { useState } from 'react'
import { IWeekGroup } from '../../types';
import { generateSummary } from '../../api/commits';
import { TYPE_COLORS } from '../../config/theme';
import { SummaryCard } from './SummaryCard';
import { CommitRow } from './CommitRow';

function parseCommit(msg: string): { type: string; scope: string | null; subject: string } {
    const m = msg.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.*)/)
    if (m) return { type: m[1], scope: m[2] ?? null, subject: m[3] }
    return { type: "other", scope: null, subject: msg }
}

export function WeekBlock({ group }: { group: IWeekGroup }) {
    const [isOpen, setIsOpen] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const authors = [...new Set(group.commits.map((c) => c.commit.author.name))]

    const toggle = async () => {
        const opening = !isOpen
        setIsOpen(opening)
        if (opening && summary === null && !loading) {
            setLoading(true)
            const text = await generateSummary(group.commits)
            setSummary(text)
            setLoading(false)
        }
    }

    // Count types
    const typeCounts = group.commits.reduce<Record<string, number>>((acc, c) => {
        const { type } = parseCommit(c.commit.message)
        acc[type] = (acc[type] ?? 0) + 1
        return acc
    }, {})
    const dominantTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

    return (
        <div
            style={{
                border: `1px solid ${isOpen ? "#d0cdc7" : "#e8e5e0"}`,
                borderRadius: 12,
                marginBottom: 12,
                background: "#fff",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxShadow: isOpen ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
            }}
        >
            {/* Header */}
            <button
                onClick={toggle}
                style={{
                    width: "100%",
                    padding: "18px 22px",
                    background: isOpen ? "#faf9f7" : "#fff",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    textAlign: "left",
                    borderRadius: isOpen ? "12px 12px 0 0" : 12,
                    transition: "background 0.2s",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 20,
                        flexWrap: "wrap",
                        flex: 1,
                    }}
                >
                    {/* Week info */}
                    <div style={{ minWidth: 0 }}>
                        <div
                            style={{
                                fontSize: 11,
                                color: "#9b9690",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                marginBottom: 3,
                                fontFamily: "monospace",
                            }}
                        >
                            {group.week}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1916" }}>
                            {group.label}
                        </div>
                    </div>

                    {/* Stats */}
                    <div
                        style={{
                            display: "flex",
                            gap: 16,
                            fontSize: 12.5,
                            color: "#6b6660",
                            flexWrap: "wrap",
                            alignItems: "center",
                        }}
                    >
                        <span>
                            <strong style={{ color: "#1a1916" }}>{group.commits.length}</strong>{" "}
                            commit{group.commits.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "#c0bdb8" }}>·</span>
                        <span>{authors.join(", ")}</span>
                        <span style={{ color: "#c0bdb8" }}>·</span>
                        <div style={{ display: "flex", gap: 6 }}>
                            {dominantTypes.map(([type, count]) => {
                                const color = TYPE_COLORS[type] ?? "#9ca3af"
                                return (
                                    <span
                                        key={type}
                                        style={{
                                            fontSize: 11,
                                            color,
                                            background: color + "18",
                                            padding: "1px 7px",
                                            borderRadius: 4,
                                            fontWeight: 600,
                                            fontFamily: "monospace",
                                        }}
                                    >
                                        {type} ×{count}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <span
                    style={{
                        fontSize: 18,
                        color: "#9b9690",
                        flexShrink: 0,
                        display: "block",
                        transition: "transform 0.25s ease",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                >
                    ›
                </span>
            </button>

            {/* Body */}
            {isOpen && (
                <div style={{ padding: "16px 22px 20px", borderTop: "1px solid #f0ede8" }}>
                    <SummaryCard text={summary ?? ""} loading={loading} />
                    {group.commits.map((c) => (
                        <CommitRow key={c.sha} commit={c} />
                    ))}
                </div>
            )}
        </div>
    )
}