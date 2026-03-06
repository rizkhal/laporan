import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

import { cn } from "../utils/cn"
import { groupByWeek } from "../utils/date"
import { getSettings } from "../api/settings"
import { IGithubCommit, IWeekGroup } from "../types"
import { WeekBlock } from "../components/ui/WeekBlock"
import { ErrorBanner } from "../components/ui/ErrorBanner"
import { SkeletonBlock } from "../components/ui/SkeletonBlock"

export default function Dashboard() {
    const navigate = useNavigate()

    const [weeks, setWeeks] = useState<IWeekGroup[]>([])
    const [isSyncing, setIsSyncing] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadInitialData()
    }, [])

    async function loadInitialData() {
        try {
            setIsLoading(true)
            const settings = await getSettings()
            if (settings) await syncCommits()
        } catch (err) {
            console.error("Failed to load initial data:", err)
        } finally {
            setIsLoading(false)
        }
    }

    async function syncCommits() {
        try {
            setIsSyncing(true)
            setError(null)

            const response = await fetch(`/api/commits`)
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.message || "Failed to fetch commits")
            }

            const commits: IGithubCommit[] = await response.json()
            setWeeks(groupByWeek(commits))
        } catch (err: any) {
            setError(err.message || "Failed to sync commits")
        } finally {
            setIsSyncing(false)
        }
    }

    const totalCommits = weeks.reduce((s, w) => s + w.commits.length, 0)

    return (
        <div className="min-h-screen bg-bg font-primary">
            {/* Navbar */}
            <nav className="sticky top-0 z-10 border-b border-border bg-bg">
                <div className="max-w-205 mx-auto px-6 h-14 flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary tracking-tight">
                        Weekly Report
                    </span>
                    <div className="flex gap-2 items-center">
                        <button
                            onClick={syncCommits}
                            disabled={isSyncing}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-sm transition-colors duration-150",
                                isSyncing
                                    ? "text-tertiary cursor-not-allowed"
                                    : "text-primary hover:bg-bg-subtle cursor-pointer"
                            )}
                        >
                            {isSyncing ? "Syncing…" : "Sync"}
                        </button>

                        <button
                            onClick={() => navigate("/settings")}
                            className="px-3 py-1.5 text-xs font-semibold border border-border rounded-sm text-secondary hover:bg-bg-subtle transition-colors duration-150 cursor-pointer"
                        >
                            Settings
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main */}
            <main className="max-w-205 mx-auto px-6 py-12">
                {/* Page header */}
                <div className="mb-10">
                    <div className="text-xxs font-semibold tracking-widest uppercase text-secondary mb-2.5">
                        github · weekly report
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-primary leading-tight tracking-tight">
                        Commit Activity
                    </h1>
                    {!isLoading && weeks.length > 0 && (
                        <p className="mt-2.5 text-sm text-secondary">
                            {weeks.length} week{weeks.length !== 1 ? "s" : ""} · {totalCommits} commits · Click a week to expand
                        </p>
                    )}
                </div>

                {/* Error */}
                {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

                {/* Loading skeleton */}
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <SkeletonBlock key={i} />
                        ))}
                    </div>
                ) : weeks.length === 0 ? (
                    /* Empty state */
                    <div className="text-center py-20">
                        <div className="text-[40px] mb-4 opacity-25">◎</div>
                        <h3 className="text-lg font-semibold text-primary mb-2 tracking-tight">
                            No data yet
                        </h3>
                        <p className="text-sm text-secondary mb-6">
                            Configure your repository and sync to get started
                        </p>
                        <button
                            onClick={() => navigate("/settings")}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-sm hover:bg-primary/85 transition-colors duration-150 cursor-pointer"
                        >
                            Configure Repository →
                        </button>
                    </div>
                ) : (
                    /* Week blocks */
                    <div className="space-y-3">
                        {weeks.map((group) => (
                            <WeekBlock key={group.week} group={group} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}