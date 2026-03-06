import { createContext, useContext, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"

const HistoryContext = createContext<string[]>([])

export const HistoryProvider = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation()
    const [history, setHistory] = useState<string[]>([])

    useEffect(() => {
        setHistory((prev) => [...prev, location.pathname])
    }, [location])

    return (
        <HistoryContext.Provider value={history}>
            {children}
        </HistoryContext.Provider>
    )
}

export const useAppHistory = () => useContext(HistoryContext)