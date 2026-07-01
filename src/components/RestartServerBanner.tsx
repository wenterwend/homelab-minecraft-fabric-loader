import { RestartServerButton } from './RestartServerButton'

interface RestartServerBannerProps {
  onRestartSuccess?: () => void
  onRestartError?: (error: string) => void
}

export function RestartServerBanner({ onRestartSuccess, onRestartError }: RestartServerBannerProps) {
  return (
    <div className="rounded-[1.5rem] border border-amber-300/30 bg-amber-500/15 px-6 py-5 backdrop-blur">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-amber-100">Changes Detected</p>
          <p className="mt-2 text-sm text-amber-50/80">
            A server restart is required for changes to take effect.
          </p>
        </div>
        <RestartServerButton
          onRestartSuccess={onRestartSuccess}
          onRestartError={onRestartError}
        />
      </div>
    </div>
  )
}
