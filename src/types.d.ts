// Database commit structure (returned from /api/commits)
export interface IDBCommit {
    id: string
    sha: string
    message: string
    author: string
    email?: string
    date: string // ISO date string
    week: number
    year: number
    url?: string
    settingId: number
    createdAt: string
    updatedAt: string
}

// GitHub API commit structure (used during sync from GitHub)
export interface IGithubCommit {
    sha: string
    commit: {
        author: { name: string; date: string }
        message: string
    }
    author: { login: string; avatar_url: string } | null
    html_url: string
}

export interface IWeekGroup {
    week: string
    label: string
    commits: IDBCommit[]
}