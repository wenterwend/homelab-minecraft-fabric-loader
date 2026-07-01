import axios from 'axios'
import cors from 'cors'
import express from 'express'
import type { Request, Response } from 'express'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const minecraftVersion = process.env.MINECRAFT_VERSION ?? '1.21'
const modsDir = process.env.MODS_DIR ?? '/mods'
const frontendDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const modrinthApi = axios.create({
  baseURL: 'https://api.modrinth.com/v2',
  headers: {
    'User-Agent': 'junebox-mod-manager/1.0.0',
  },
  timeout: 15000,
})

app.use(cors())
app.use(express.json())

type InstalledMod = {
  fileName: string
  displayName: string
  status: 'active' | 'disabled'
}

type ModrinthSearchHit = {
  project_id: string
  slug: string
  title: string
  description: string
  downloads: number
  icon_url: string | null
  author: string
  latest_version: string
}

type ModrinthVersion = {
  id: string
  name: string
  version_number: string
  version_type: string
  date_published: string
  game_versions: string[]
  loaders: string[]
  files: Array<{
    url: string
    filename: string
    primary?: boolean
  }>
}

const ensureModsDirectory = async () => {
  await fs.promises.mkdir(modsDir, { recursive: true })
}

const normalizeDisplayName = (fileName: string) => fileName.replace(/\.disabled$/, '')

const listInstalledMods = async (): Promise<InstalledMod[]> => {
  await ensureModsDirectory()
  const entries = await fs.promises.readdir(modsDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.jar') || name.endsWith('.jar.disabled'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => ({
      fileName,
      displayName: normalizeDisplayName(fileName),
      status: fileName.endsWith('.disabled') ? 'disabled' : 'active',
    }))
}

const resolveExistingModPath = async (fileName: string) => {
  const installedMods = await listInstalledMods()
  const mod = installedMods.find((item) => item.fileName === fileName)

  if (!mod) {
    return null
  }

  return path.join(modsDir, mod.fileName)
}

const getProjectVersions = async (slugOrId: string) => {
  const response = await modrinthApi.get<ModrinthVersion[]>(`/project/${slugOrId}/version`)

  return response.data
    .filter(
      (version) =>
        version.loaders.includes('fabric') &&
        version.game_versions.includes(minecraftVersion) &&
        version.files.some((file) => file.filename.endsWith('.jar')),
    )
    .sort(
      (left, right) =>
        new Date(right.date_published).getTime() - new Date(left.date_published).getTime(),
    )
}

const getFileNameFromUrl = (fileUrl: string) => {
  try {
    const parsedUrl = new URL(fileUrl)
    const fileName = path.basename(parsedUrl.pathname)
    return fileName || null
  } catch {
    return null
  }
}

app.get('/api/health', (_request: Request, response: Response) => {
  response.json({ ok: true, minecraftVersion, modsDir })
})

app.get('/api/mods/installed', async (_request: Request, response: Response) => {
  try {
    response.json({ mods: await listInstalledMods() })
  } catch {
    response.status(500).json({ error: 'Failed to read installed mods.' })
  }
})

app.get('/api/mods/search', async (request: Request, response: Response) => {
  try {
    const query = String(request.query.query ?? '').trim()
    const page = Number(request.query.page ?? 1)
    const limit = 12
    const offset = Math.max(page - 1, 0) * limit

    const searchResponse = await modrinthApi.get<{
      hits: ModrinthSearchHit[]
      total_hits: number
    }>('/search', {
      params: {
        query,
        limit,
        offset,
        facets: JSON.stringify([['categories:fabric'], [`versions:${minecraftVersion}`]]),
      },
    })

    response.json({
      page,
      pageSize: limit,
      total: searchResponse.data.total_hits,
      results: searchResponse.data.hits,
    })
  } catch {
    response.status(502).json({ error: 'Failed to fetch search results from Modrinth.' })
  }
})

app.get('/api/mods/:slug/versions', async (request: Request, response: Response) => {
  try {
    const slug = String(request.params.slug ?? '').trim()

    if (!slug) {
      response.status(400).json({ error: 'slug is required.' })
      return
    }

    const versions = await getProjectVersions(slug)

    response.json(
      versions
        .map((version) => {
          const preferredFile =
            version.files.find((file) => file.primary && file.filename.endsWith('.jar')) ??
            version.files.find((file) => file.filename.endsWith('.jar'))

          if (!preferredFile) {
            return null
          }

          return {
            name: version.name,
            versionNumber: version.version_number,
            releaseType: version.version_type,
            downloadUrl: preferredFile.url,
            fileName: preferredFile.filename,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    )
  } catch {
    response.status(502).json({ error: 'Failed to fetch versions from Modrinth.' })
  }
})

app.post('/api/mods/install', async (request: Request, response: Response) => {
  try {
    const fileUrl = String(request.body?.fileUrl ?? '').trim()
    const requestedFileName = String(request.body?.fileName ?? '').trim()
    const versionNumber = String(request.body?.versionNumber ?? '').trim()

    if (!fileUrl) {
      response.status(400).json({ error: 'fileUrl is required.' })
      return
    }

    const parsedUrl = new URL(fileUrl)

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      response.status(400).json({ error: 'fileUrl must be an http or https URL.' })
      return
    }

    if (!parsedUrl.hostname.endsWith('modrinth.com')) {
      response.status(400).json({ error: 'fileUrl must be a Modrinth download URL.' })
      return
    }

    await ensureModsDirectory()
    const inferredFileName = getFileNameFromUrl(fileUrl)
    const fileName = requestedFileName || inferredFileName

    if (!fileName || !fileName.endsWith('.jar')) {
      response.status(400).json({ error: 'A valid mod jar fileName is required.' })
      return
    }

    const targetPath = path.join(modsDir, fileName)
    const disabledTargetPath = `${targetPath}.disabled`

    if (fs.existsSync(targetPath) || fs.existsSync(disabledTargetPath)) {
      response.status(409).json({ error: 'This mod is already installed.', fileName })
      return
    }

    const downloadResponse = await axios.get(fileUrl, {
      responseType: 'stream',
      timeout: 30000,
    })

    await pipeline(downloadResponse.data, fs.createWriteStream(targetPath))

    response.status(201).json({
      fileName,
      version: versionNumber || 'unknown',
      installed: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to install mod.'
    response.status(500).json({ error: message })
  }
})

app.post('/api/mods/toggle', async (request: Request, response: Response) => {
  try {
    const fileName = String(request.body?.fileName ?? '').trim()

    if (!fileName) {
      response.status(400).json({ error: 'fileName is required.' })
      return
    }

    const sourcePath = await resolveExistingModPath(fileName)

    if (!sourcePath) {
      response.status(404).json({ error: 'Mod file not found.' })
      return
    }

    const nextFileName = fileName.endsWith('.disabled')
      ? fileName.replace(/\.disabled$/, '')
      : `${fileName}.disabled`

    await fs.promises.rename(sourcePath, path.join(modsDir, nextFileName))
    response.json({ fileName: nextFileName })
  } catch {
    response.status(500).json({ error: 'Failed to toggle mod state.' })
  }
})

app.delete('/api/mods/:fileName', async (request: Request, response: Response) => {
  try {
    const rawFileName = request.params.fileName
    const fileName = decodeURIComponent(Array.isArray(rawFileName) ? rawFileName[0] : rawFileName)
    const targetPath = await resolveExistingModPath(fileName)

    if (!targetPath) {
      response.status(404).json({ error: 'Mod file not found.' })
      return
    }

    await fs.promises.unlink(targetPath)
    response.status(204).send()
  } catch {
    response.status(500).json({ error: 'Failed to delete mod.' })
  }
})

app.post('/api/server/restart', async (_request: Request, response: Response) => {
  try {
    const execAsync = promisify(exec)
    await execAsync('docker restart minecraft-fabric')
    response.json({ ok: true, message: 'Server restart initiated.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restart server.'
    response.status(500).json({ error: message })
  }
})

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir))
  app.get(/^(?!\/api).*/, (_request: Request, response: Response) => {
    response.sendFile(path.join(frontendDistDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Mod manager listening on port ${port}`)
})