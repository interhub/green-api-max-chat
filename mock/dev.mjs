import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const mockPort = process.env.MOCK_PORT || '8787'
const env = {
  ...process.env,
  MOCK_PORT: mockPort,
  VITE_GREEN_API_URL: `http://localhost:${mockPort}`,
}

const children = [
  spawn(process.execPath, ['mock/greenapi-mock.mjs'], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
  }),
]

let stopping = false

function stopAll(exitCode) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 0))
  child.on('error', (error) => {
    console.error(error.message)
    stopAll(1)
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
