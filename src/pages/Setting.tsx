import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

import { useBack } from '../hooks/useBack'
import { getSettings, saveSettings } from "../api/settings"

interface SettingsForm {
  owner: string
  repo: string
  branch: string
  token: string
}

export default function SettingsPage() {
  const goBack = useBack();

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<SettingsForm>({
    defaultValues: { owner: "", repo: "", branch: "", token: "" },
  })

  const [isLoading, setIsLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      setIsLoading(true)
      const settings = await getSettings()
      if (settings) reset(settings)
    } catch (err) {
      setError("Failed to load settings")
    } finally {
      setIsLoading(false)
    }
  }

  async function onSubmit(data: SettingsForm) {
    try {
      setError(null)
      setSuccess(false)
      await saveSettings(data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to save settings")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex justify-center items-center">
        <div className="space-y-4 w-full max-w-md px-6">
          <div className="h-7 bg-primary/8 rounded-sm w-40 animate-shimmer" />
          <div className="h-56 bg-primary/8 rounded-sm animate-shimmer" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg font-primary">
      <div className="max-w-xl mx-auto px-6 py-12">

        {/* Back */}
        <button
          onClick={goBack}
          className="text-sm text-secondary hover:text-primary mb-8 inline-flex items-center gap-1.5 transition-colors duration-150 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="text-xxs font-semibold tracking-widest uppercase text-secondary mb-2.5">
            configuration
          </div>
          <h1 className="text-xl font-bold text-primary tracking-tight leading-tight">
            Repository Settings
          </h1>
          <p className="text-sm text-secondary mt-1.5">
            Configure your GitHub repository for commit tracking
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-sm text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-sm text-green-700 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Settings saved successfully!
          </div>
        )}

        {/* Form */}
        <div className="bg-surface border border-border rounded-md p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {[
              { label: "Repository Owner", name: "owner", placeholder: "e.g., facebook" },
              { label: "Repository Name", name: "repo", placeholder: "e.g., react" },
              { label: "Branch", name: "branch", placeholder: "e.g., main" },
            ].map(({ label, name, placeholder }) => (
              <div key={name}>
                <label className="block text-xs font-semibold tracking-widest uppercase text-secondary mb-1.5">
                  {label}
                </label>
                <input
                  type="text"
                  placeholder={placeholder}
                  {...register(name as keyof SettingsForm, { required: true })}
                  className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm text-primary bg-bg placeholder:text-tertiary focus:outline-none focus:border-primary transition-colors duration-150"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-secondary mb-1.5">
                Personal Access Token
              </label>
              <input
                type="password"
                placeholder="ghp_..."
                {...register("token", { required: true })}
                className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm font-mono text-primary bg-bg placeholder:text-tertiary focus:outline-none focus:border-primary transition-colors duration-150"
              />
            </div>

            <div className="pt-5 border-t border-border">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-white py-2.5 rounded-sm text-sm font-semibold hover:bg-primary/85 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? "Saving…" : "Save Settings"}
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  )
}