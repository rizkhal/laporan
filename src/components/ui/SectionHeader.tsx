import React from "react"

interface SectionHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export default function SectionHeader({
  title,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
