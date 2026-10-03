import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const secretPatterns = [
  { label: 'Google API key shape', expression: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { label: 'AQ token shape', expression: /\bAQ\.[A-Za-z0-9_-]{20,}\b/g },
]

let trackedFiles
try {
  trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
} catch {
  console.error('Secret scan could not list Git-tracked files.')
  process.exit(2)
}

const findings = []
for (const relativePath of trackedFiles) {
  const fileName = basename(relativePath)
  if (fileName === 'package-lock.json' || fileName === '.env' || !existsSync(resolve(repositoryRoot, relativePath))) continue

  const content = readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
  for (const { label, expression } of secretPatterns) {
    expression.lastIndex = 0
    if (expression.test(content)) findings.push(`${relativePath}: ${label}`)
  }
}

if (findings.length > 0) {
  console.error('Potential key-shaped values found in tracked files:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log('Secret scan passed: no key-shaped values found in tracked files.')
