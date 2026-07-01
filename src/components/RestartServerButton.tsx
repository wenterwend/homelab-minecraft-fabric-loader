import { useState } from 'react'
import { api } from '../lib/api'

interface RestartServerButtonProps {
  onRestartSuccess?: () => void
  onRestartError?: (error: string) => void
}

export function RestartServerButton({ onRestartSuccess, onRestartError }: RestartServerButtonProps) {
  const [isRestarting, setIsRestarting] = useState(false)

  const handleRestart = async () => {
    setIsRestarting(true)

    try {
      await api.restartServer()
      onRestartSuccess?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart server.'
      onRestartError?.(message)
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <button
      onClick={handleRestart}
      disabled={isRestarting}
      className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-amber-950 transition disabled:opacity-50 hover:enabled:bg-amber-300"
    >
      {isRestarting ? 'Restarting...' : 'Restart Server'}
    </button>
  )
}
