import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDirectory = join(dirname(fileURLToPath(import.meta.url)), "..")
const skillsDirectory = join(pluginDirectory, "skills")
const metaDirectory = join(pluginDirectory, "meta")
const outputDirectory = join(pluginDirectory, "vscode-skills")
const includePattern = /^(\s*)@\$\{CLAUDE_SKILL_DIR\}\/(.+)$/gm

function expandFile(file, skillDirectory, ancestry = new Set()) {
    const resolvedFile = join(file)
    if (ancestry.has(resolvedFile))
        throw new Error(`circular skill include: ${relative(pluginDirectory, resolvedFile)}`)

    const nextAncestry = new Set(ancestry)
    nextAncestry.add(resolvedFile)

    return readFileSync(resolvedFile, "utf8").replace(includePattern, (_, indentation, includePath) => {
        const includedFile = includePath.startsWith("../../meta/")
            ? join(metaDirectory, basename(includePath))
            : join(skillDirectory, includePath)

        if (!existsSync(includedFile))
            throw new Error(`missing skill include: ${includePath} in ${relative(pluginDirectory, resolvedFile)}`)

        return expandFile(includedFile, skillDirectory, nextAncestry)
            .split("\n")
            .map((line) => line ? `${indentation}${line}` : line)
            .join("\n")
    })
}

rmSync(outputDirectory, { force: true, recursive: true })
mkdirSync(outputDirectory, { recursive: true })

for (const skill of readdirSync(skillsDirectory).sort()) {
    const skillDirectory = join(skillsDirectory, skill)
    const sourceFile = join(skillDirectory, "SKILL.md")
    if (!existsSync(sourceFile))
        continue

    const targetDirectory = join(outputDirectory, skill)
    mkdirSync(targetDirectory, { recursive: true })
    cpSync(join(skillDirectory, "help.md"), join(targetDirectory, "help.md"))
    writeFileSync(join(targetDirectory, "SKILL.md"), expandFile(sourceFile, skillDirectory))
}