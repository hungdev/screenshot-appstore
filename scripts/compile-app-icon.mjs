import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const iconSource = resolve('build/AppIcon.icon')
const buildDirectory = resolve('build')

if (!existsSync(iconSource)) {
  throw new Error(`Missing Icon Composer asset: ${iconSource}`)
}

execFileSync('xcrun', [
  'actool',
  '--compile', buildDirectory,
  '--platform', 'macosx',
  '--minimum-deployment-target', '26.0',
  '--app-icon', 'AppIcon',
  '--output-partial-info-plist', resolve('build/AppIcon-info.plist'),
  iconSource
], { stdio: 'inherit' })
