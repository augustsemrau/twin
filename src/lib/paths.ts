import { homeDir, join } from '@tauri-apps/api/path'

let _twinHome: string | null = null

export async function twinHome(): Promise<string> {
  if (_twinHome) return _twinHome
  const home = await homeDir()
  _twinHome = await join(home, 'twin')
  return _twinHome
}

export async function projectPath(slug: string): Promise<string> {
  return join(await twinHome(), 'projects', slug)
}

export async function projectNotesPath(slug: string): Promise<string> {
  return join(await projectPath(slug), 'notes')
}

export async function inboxPath(): Promise<string> {
  return join(await twinHome(), 'inbox')
}

export async function sessionsPath(): Promise<string> {
  return join(await twinHome(), 'sessions')
}

export async function archivePath(): Promise<string> {
  return join(await twinHome(), 'archive')
}

export async function peoplePath(): Promise<string> {
  return join(await twinHome(), 'people.yaml')
}

export async function globalClaudePath(): Promise<string> {
  return join(await twinHome(), 'CLAUDE.md')
}
