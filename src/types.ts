export type InstalledMod = {
  fileName: string
  displayName: string
  status: 'active' | 'disabled'
}

export type SearchResult = {
  project_id: string
  slug: string
  title: string
  description: string
  downloads: number
  icon_url: string | null
  author: string
  latest_version: string
}

export type SearchResponse = {
  page: number
  pageSize: number
  total: number
  results: SearchResult[]
}

export type ModVersion = {
  name: string
  versionNumber: string
  releaseType: string
  downloadUrl: string
  fileName: string
}