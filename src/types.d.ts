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
    commits: IGithubCommit[]
}