import { readFile, writeFile } from "node:fs/promises"
import { format, resolveConfig } from "prettier"

const targetPath = process.argv[2]

if (!targetPath) {
  throw new Error("Usage: bun scripts/fix_generated_eeconfig.ts <path>")
}

const parseInt32Before = "  return v >= 0x80000000 ? v - 0x100000000 : v"
const parseInt32After = "  return v >= 2 ** 31 ? v - 2 ** 32 : v"

const source = await readFile(targetPath, "utf8")

if (!source.includes(parseInt32Before)) {
  throw new Error(`Expected parseInt32 line not found in ${targetPath}`)
}

const fixedSource = source.replace(parseInt32Before, parseInt32After)
const prettierConfig = (await resolveConfig(targetPath)) ?? {}
const formattedSource = await format(fixedSource, {
  ...prettierConfig,
  filepath: targetPath,
})

await writeFile(targetPath, formattedSource)
