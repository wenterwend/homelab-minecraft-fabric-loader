import type { InstalledMod, ModVersion, SearchResponse } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${input}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = 'Request failed.'

    try {
      const payload = (await response.json()) as { error?: string }
      message = payload.error ?? message
    } catch {
      message = response.statusText || message
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  getInstalledMods: () => request<{ mods: InstalledMod[] }>('/api/mods/installed'),
  searchMods: (query: string, page: number) =>
    request<SearchResponse>(`/api/mods/search?query=${encodeURIComponent(query)}&page=${page}`),
  getModVersions: (slugOrId: string) =>
    request<ModVersion[]>(`/api/mods/${encodeURIComponent(slugOrId)}/versions`),
  installMod: (payload: { fileUrl: string; fileName: string; versionNumber: string }) =>
    request<{ fileName: string; version: string; installed: boolean }>('/api/mods/install', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleMod: (fileName: string) =>
    request<{ fileName: string }>('/api/mods/toggle', {
      method: 'POST',
      body: JSON.stringify({ fileName }),
    }),
  deleteMod: (fileName: string) =>
    request<void>(`/api/mods/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
    }),
  getModDownloadUrl: (fileName: string) =>
    `${apiBaseUrl}/api/mods/${encodeURIComponent(fileName)}/download`,
  restartServer: () =>
    request<{ ok: boolean; message: string }>('/api/server/restart', {
      method: 'POST',
    }),
}