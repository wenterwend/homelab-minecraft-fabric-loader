import { useEffect, useMemo, useState } from 'react'
import { api } from './lib/api'
import type { InstalledMod, ModVersion, SearchResult } from './types'
import { RestartServerBanner } from './components/RestartServerBanner'

type AsyncState = 'idle' | 'loading'

function App() {
  const [query, setQuery] = useState('sodium')
  const [draftQuery, setDraftQuery] = useState('sodium')
  const [page, setPage] = useState(1)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([])
  const [searchState, setSearchState] = useState<AsyncState>('loading')
  const [inventoryState, setInventoryState] = useState<AsyncState>('loading')
  const [versionModalResult, setVersionModalResult] = useState<SearchResult | null>(null)
  const [versionsByProject, setVersionsByProject] = useState<Record<string, ModVersion[]>>({})
  const [versionsStateByProject, setVersionsStateByProject] = useState<Record<string, AsyncState>>({})
  const [selectedDownloadUrlByProject, setSelectedDownloadUrlByProject] = useState<Record<string, string>>({})
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)
  const [busyFileName, setBusyFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRestartRequired, setIsRestartRequired] = useState(false)

  const installedFileNames = useMemo(
    () =>
      new Set(
        installedMods.flatMap((mod) => {
          const normalized = mod.fileName.replace(/\.disabled$/, '')
          return [mod.fileName, normalized]
        }),
      ),
    [installedMods],
  )

  const loadInstalledMods = async () => {
    try {
      const response = await api.getInstalledMods()
      setInstalledMods(response.mods)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load installed mods.')
    } finally {
      setInventoryState('idle')
    }
  }

  const refreshInstalledMods = async () => {
    setInventoryState('loading')
    await loadInstalledMods()
  }

  useEffect(() => {
    void loadInstalledMods()
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setSearchState('loading')

      try {
        const payload = await api.searchMods(query, page)

        if (!active) {
          return
        }

        setSearchResults(payload.results)
        setSearchTotal(payload.total)
      } catch (error) {
        if (!active) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load search results.')
      } finally {
        if (active) {
          setSearchState('idle')
        }
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [page, query])

  const loadVersionsForProject = async (projectId: string, slugOrId: string) => {
    if (versionsByProject[projectId]) {
      return
    }

    setVersionsStateByProject((current) => ({
      ...current,
      [projectId]: 'loading',
    }))
    setErrorMessage(null)

    try {
      const versions = await api.getModVersions(slugOrId)

      setVersionsByProject((current) => ({
        ...current,
        [projectId]: versions,
      }))
      setSelectedDownloadUrlByProject((current) => ({
        ...current,
        [projectId]: versions[0]?.downloadUrl ?? '',
      }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load mod versions.')
    } finally {
      setVersionsStateByProject((current) => ({
        ...current,
        [projectId]: 'idle',
      }))
    }
  }

  const handleInstall = async (projectId: string) => {
    const versions = versionsByProject[projectId] ?? []
    const selectedDownloadUrl = selectedDownloadUrlByProject[projectId]
    const selectedVersion = versions.find((version) => version.downloadUrl === selectedDownloadUrl)

    if (!selectedVersion) {
      setErrorMessage('Select a version before installing.')
      return
    }

    setBusyProjectId(projectId)
    setErrorMessage(null)

    try {
      await api.installMod({
        fileUrl: selectedVersion.downloadUrl,
        fileName: selectedVersion.fileName,
        versionNumber: selectedVersion.versionNumber,
      })
      await refreshInstalledMods()
      setIsRestartRequired(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to install mod.')
    } finally {
      setBusyProjectId(null)
    }
  }

  const handleToggle = async (fileName: string) => {
    setBusyFileName(fileName)
    setErrorMessage(null)

    try {
      await api.toggleMod(fileName)
      await refreshInstalledMods()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to toggle mod.')
    } finally {
      setBusyFileName(null)
    }
  }

  const handleDelete = async (fileName: string) => {
    setBusyFileName(fileName)
    setErrorMessage(null)

    try {
      await api.deleteMod(fileName)
      await refreshInstalledMods()
      setIsRestartRequired(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete mod.')
    } finally {
      setBusyFileName(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(searchTotal / 12))
  const modalProjectId = versionModalResult?.project_id ?? null
  const modalVersionState = modalProjectId ? (versionsStateByProject[modalProjectId] ?? 'idle') : 'idle'
  const modalVersions = modalProjectId ? (versionsByProject[modalProjectId] ?? []) : []
  const modalSelectedDownloadUrl = modalProjectId ? (selectedDownloadUrlByProject[modalProjectId] ?? '') : ''
  const modalSelectedVersion = modalVersions.find((version) => version.downloadUrl === modalSelectedDownloadUrl)
  const modalSelectedIsInstalled = modalSelectedVersion
    ? installedFileNames.has(modalSelectedVersion.fileName)
    : false

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.24),_transparent_34%),linear-gradient(180deg,_#08120f_0%,_#10221b_52%,_#07110d_100%)] px-4 py-8 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {isRestartRequired && (
          <RestartServerBanner
            onRestartSuccess={() => setIsRestartRequired(false)}
            onRestartError={(error) => setErrorMessage(error)}
          />
        )}
        <section className="overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-black/25 shadow-2xl shadow-emerald-950/40 backdrop-blur">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.35fr_0.9fr] lg:px-10 lg:py-10">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.38em] text-emerald-300/75">Fabric Server Control</p>
              <h1 className="max-w-3xl font-[Georgia] text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Browse Modrinth, install directly into your server, and toggle mods without shell access.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                This panel proxies Modrinth search and version selection through a local Node API, then writes jar files into the mounted server mods directory.
              </p>
              <form
                className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  setPage(1)
                  setQuery(draftQuery.trim() || 'fabric')
                }}
              >
                <input
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="Search Fabric mods for Minecraft 1.21"
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-5 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-emerald-400"
                />
                <button
                  type="submit"
                  className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
                >
                  Search Modrinth
                </button>
              </form>
            </div>

            <aside className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/6 p-5 text-sm text-stone-300">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/75">Mounted Flow</p>
                <p className="mt-2 leading-7">
                  Container app writes to <span className="font-semibold text-white">/mods</span>, which should map to your host path for the Fabric server mods directory.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-2xl font-semibold text-white">{installedMods.length}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-400">Tracked Files</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-2xl font-semibold text-white">{searchTotal}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-400">Search Hits</p>
                </div>
              </div>
              {errorMessage ? (
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-rose-100">
                  {errorMessage}
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5 backdrop-blur">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/75">Browse Modrinth</p>
                <h2 className="mt-2 font-[Georgia] text-2xl text-white">Installable Fabric mods</h2>
              </div>
              <p className="text-sm text-stone-400">Page {page} of {totalPages}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {searchResults.map((result) => {
                const hasInstalledVersion = installedMods.some((mod) =>
                  mod.displayName.toLowerCase().includes(result.slug.toLowerCase()),
                )

                return (
                  <article
                    key={result.project_id}
                    className="group flex h-full flex-col rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/30 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/10">
                        {result.icon_url ? (
                          <img src={result.icon_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xl font-semibold text-emerald-300">M</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-semibold text-white">{result.title}</h3>
                        <p className="mt-1 line-clamp-3 text-sm leading-6 text-stone-300">{result.description}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone-400">
                      <span>{result.downloads.toLocaleString()} downloads</span>
                      <span>{result.latest_version}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVersionModalResult(result)
                        void loadVersionsForProject(result.project_id, result.slug || result.project_id)
                      }}
                      className="mt-5 rounded-full border border-cyan-300/25 bg-cyan-400/85 px-4 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300"
                    >
                      {hasInstalledVersion ? 'Manage Version' : 'Select Version'}
                    </button>
                  </article>
                )
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || searchState === 'loading'}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || searchState === 'loading'}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5 backdrop-blur">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-200/75">Installed Mods</p>
                <h2 className="mt-2 font-[Georgia] text-2xl text-white">Server inventory</h2>
              </div>
              <button
                type="button"
                onClick={() => void refreshInstalledMods()}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:border-white/20"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {inventoryState === 'loading' && installedMods.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-stone-400">
                  Reading mounted mods directory...
                </div>
              ) : null}

              {inventoryState === 'idle' && installedMods.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-stone-400">
                  No jar files found yet. Install a mod from the browse panel.
                </div>
              ) : null}

              {installedMods.map((mod) => (
                <article
                  key={mod.fileName}
                  className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-white">{mod.displayName}</p>
                    <p className="mt-1 text-sm text-stone-400">
                      {mod.status === 'active' ? 'Installed and active' : 'Installed but deactivated'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleToggle(mod.fileName)}
                      disabled={busyFileName === mod.fileName}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mod.status === 'active' ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300' : 'bg-amber-300 text-amber-950 hover:bg-amber-200'} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {busyFileName === mod.fileName ? 'Working...' : mod.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(mod.fileName)}
                      disabled={busyFileName === mod.fileName}
                      className="rounded-full border border-rose-300/25 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      {versionModalResult ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-white/15 bg-[#0d1814] p-5 shadow-2xl shadow-black/60 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/75">Version Picker</p>
                <h3 className="mt-2 font-[Georgia] text-2xl text-white">{versionModalResult.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-300">Choose a Fabric release for your configured Minecraft server version, then install that exact jar.</p>
              </div>
              <button
                type="button"
                onClick={() => setVersionModalResult(null)}
                className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-300 transition hover:border-white/35 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <select
                value={modalSelectedDownloadUrl}
                onChange={(event) => {
                  if (!modalProjectId) {
                    return
                  }

                  setSelectedDownloadUrlByProject((current) => ({
                    ...current,
                    [modalProjectId]: event.target.value,
                  }))
                }}
                disabled={modalVersionState === 'loading' || modalVersions.length === 0 || (modalProjectId ? busyProjectId === modalProjectId : false)}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {modalVersions.length === 0 ? (
                  <option value="">{modalVersionState === 'loading' ? 'Loading versions...' : 'No compatible versions found'}</option>
                ) : (
                  modalVersions.map((version) => (
                    <option key={version.downloadUrl} value={version.downloadUrl}>
                      {`${version.versionNumber} (${version.releaseType.charAt(0).toUpperCase()}${version.releaseType.slice(1)})`}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                disabled={!modalProjectId || busyProjectId === modalProjectId || modalVersions.length === 0 || !modalSelectedDownloadUrl || modalSelectedIsInstalled}
                onClick={() => {
                  if (!modalProjectId) {
                    return
                  }

                  void handleInstall(modalProjectId)
                }}
                className="rounded-full border border-emerald-300/25 bg-emerald-400/90 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-stone-500"
              >
                {modalProjectId && busyProjectId === modalProjectId
                  ? 'Installing...'
                  : modalSelectedIsInstalled
                    ? 'Already Installed'
                    : 'Download & Install'}
              </button>
            </div>

            {modalSelectedVersion ? (
              <p className="mt-3 text-sm text-stone-300">
                Selected file: <span className="font-semibold text-white">{modalSelectedVersion.fileName}</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
