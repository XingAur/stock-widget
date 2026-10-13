import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
const cargoVersion = /\nversion = "([^"]+)"/.exec(cargo)?.[1]

if (!pkg.version || pkg.version !== tauri.version || pkg.version !== cargoVersion) {
  console.error('Version mismatch', { package: pkg.version, tauri: tauri.version, cargo: cargoVersion })
  process.exit(1)
}
console.log('versions ok', pkg.version)
