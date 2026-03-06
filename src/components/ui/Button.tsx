import React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost"
    children: React.ReactNode
}

export default function Button({
    variant = "primary",
    children,
    className = "",
    ...props
}: ButtonProps) {
    const baseStyles = "px-4 py-2 rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2"

    const variants = {
        primary: "bg-black text-white hover:bg-gray-900",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        ghost: "text-gray-700 hover:bg-gray-100",
    }

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    )
}
