import { useState } from 'react'

import { cn } from '../../utils/cn';
import { CommitRow } from './CommitRow';
import { IWeekGroup } from '../../types';
import { SummaryCard } from './SummaryCard';
import { TYPE_COLORS } from '../../config/theme';
import { generateSummary } from '../../api/commits';
import { commitParser } from '../../utils/commit-parser'
import { exportWeekToExcel } from '../../utils/xlsx-converter';

export function WeekBlock({ group }: { group: IWeekGroup }) {
    const [isOpen, setIsOpen] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const authors = [...new Set(group.commits.map((c) => c.author))]

    const handleConvertAndDownloadExcel = () => exportWeekToExcel(group);

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
        const { type } = commitParser(c.message)
        acc[type] = (acc[type] ?? 0) + 1
        return acc
    }, {})
    const dominantTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

    return (
        <div
            className={cn(
                "rounded-lg mb-3 bg-white transition-all duration-200",
                isOpen ? "border border-tertiary shadow-card" : "border border-border"
            )}
        >
            {/* Header */}
            <button
                onClick={toggle}
                className={cn(
                    "w-full px-5.5 py-4.5 border-none cursor-pointer flex justify-between items-center gap-4 text-left transition-colors duration-200",
                    isOpen && "bg-bg-subtle rounded-t-lg",
                    !isOpen && "bg-white rounded-lg"
                )}
            >
                <div className="flex items-center gap-5 flex-wrap flex-1">
                    {/* Week info */}
                    <div className="min-w-0">
                        <div className="text-sm text-tertiary font-medium tracking-[0.08em] uppercase mb-0.75 font-mono">
                            {group.week}
                        </div>
                        <div className="text-md font-medium text-primary">
                            {group.label}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-4 text-sm text-secondary flex-wrap items-center">
                        <span>
                            <strong className="text-primary">{group.commits.length}</strong>{" "}
                            commit{group.commits.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-border-strong">·</span>
                        <span>{authors.join(", ")}</span>
                        <span className="text-border-strong">·</span>
                        <div className="flex gap-1.5">
                            {dominantTypes.map(([type, count]) => {
                                const color = TYPE_COLORS[type] ?? "#9ca3af"
                                return (
                                    <span
                                        key={type}
                                        style={{
                                            color,
                                            background: color + "18",
                                        }}
                                        className="text-xxs p-[1px_7px] text-xs rounded-md font-medium font-mono"
                                    >
                                        {type} ×{count}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <span className={cn(
                    "text-lg text-tertiary shrink-0 block transition-transform duration-250",
                    isOpen && "rotate-90",
                    !isOpen && "rotate-0"
                )}>
                    ›
                </span>
            </button>

            {/* Body */}
            {isOpen && (
                <div className="px-5.5 pt-4 pb-5 border-t border-border">
                    <SummaryCard text={summary ?? ""} loading={loading} />
                    {group.commits.map((c) => (
                        <CommitRow key={c.sha} commit={c} />
                    ))}
                    <div className="w-full mt-4 flex justify-end">
                        <button
                            onClick={handleConvertAndDownloadExcel}
                            className='border h-10 px-4 rounded-md bg-emerald-400 hover:bg-emerald-500 font-primary border-secondary'
                        >Download Excel</button>
                    </div>
                </div>
            )}
        </div>
    )
}