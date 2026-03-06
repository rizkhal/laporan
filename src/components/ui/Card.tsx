import React from "react"

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export default function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={{ pointerEvents: 'auto' }}
    >
      {children}
    </div>
  )
}
