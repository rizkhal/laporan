import { Avatar } from "./Avatar";
import { CommitTag } from './CommitTag'
import { IDBCommit } from "../../types"
import { commitParser } from '../../utils/commit-parser'

export function CommitRow({ commit }: { commit: IDBCommit }) {
    const { type, scope, subject } = commitParser(commit.message)
    const date = new Date(commit.date).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    })

    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid #f0ede8",
                alignItems: "flex-start",
            }}
        >
            <Avatar
                src={undefined}
                name={commit.author}
                size={28}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: "wrap",
                    }}
                >
                    <CommitTag type={type} scope={scope} />
                    <a
                        href={commit.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            fontSize: 13.5,
                            color: "#1a1916",
                            fontWeight: 500,
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.textDecoration = "underline")
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.textDecoration = "none")
                        }
                    >
                        {subject}
                    </a>
                </div>
                <div
                    style={{
                        display: "flex",
                        gap: 12,
                        fontSize: 12,
                        color: "#9b9690",
                        flexWrap: "wrap",
                    }}
                >
                    <code
                        style={{
                            background: "#f0ede8",
                            padding: "1px 6px",
                            borderRadius: 3,
                            fontFamily: "monospace",
                        }}
                    >
                        {commit.sha.slice(0, 7)}
                    </code>
                    <span>{commit.author}</span>
                    <span>{date}</span>
                </div>
            </div>
        </div>
    )
}