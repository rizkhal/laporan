import { useNavigate } from "react-router-dom"
import { useAppHistory } from "../context/HistoryContext"

export function useBack() {
    const history = useAppHistory()
    const navigate = useNavigate()

    return () => {
        if (history.length > 1) {
            const previous = history[history.length - 2]
            navigate(previous)
        } else {
            navigate("/") // fallback
        }
    }
}