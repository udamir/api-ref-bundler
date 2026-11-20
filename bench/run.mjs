// Runs every benchmark cell and writes results/results.json and README.md.
// Every cell (operation x fixture x library) runs in its own fresh process (`node run.mjs --cell <index>`) that loads
// only its fixture, because cells measured in one process influence each other. Each cell is checked once for
// correctness before it is timed; a library that throws or produces a wrong result is reported with the error instead
// of a time.
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import { CURRENT, PREVIOUS, libraries, versions } from "./lib/libraries.mjs"
import { checks } from "./lib/checks.mjs"
import { fmtMs, runCases, RUNS, WARMUP } from "./lib/harness.mjs"

const read = (url) => JSON.parse(readFileSync(new URL(url, import.meta.url), "utf8"))
const summary = read("./fixtures/generated/summary.json")

const operations = [
  { op: "bundle", title: "Bundle", fixtures: ["openapi", "multi-file", "shared-definitions", "cyclic"] },
  { op: "dereference", title: "Dereference", fixtures: ["openapi", "multi-file", "shared-definitions"] },
  { op: "dereferenceCircular", title: "Dereference with circular references", fixtures: ["cyclic"] },
]

const MUTATES = "changes the documents it is given: every run gets a fresh copy of the files, made outside the timing"
const cases = []
for (const { op, fixtures } of operations) {
  for (const fixture of fixtures) {
    for (const [library, lib] of Object.entries(libraries)) {
      if (!lib[op]) { continue }
      const note = [lib.notes?.[op], lib.mutates ? MUTATES : undefined].filter(Boolean).join("; ") || undefined
      cases.push({ case: op, fixture, library, note })
    }
  }
}

// child mode: measure one cell and print its result row
const cellFlag = process.argv.indexOf("--cell")
if (cellFlag >= 0) {
  const cell = cases[+process.argv[cellFlag + 1]]
  const files = read(`./fixtures/generated/${cell.fixture}.json`)
  const lib = libraries[cell.library]
  const run = lib[cell.case]
  // libraries that change their input get a fresh copy for every run (setup is not timed); the others get the files
  const setup = lib.mutates ? () => structuredClone(files) : undefined
  const [row] = await runCases([{
    ...cell,
    setup,
    check: async () => { checks[cell.case](await run(setup ? setup() : files)) },
    fn: (copy) => run(copy ?? files),
  }], () => {})
  process.stdout.write(`${JSON.stringify(row)}\n`)
  process.exit(0)
}

console.log(`${cases.length} cells, one fresh process each`)
const startedAt = new Date()
const self = fileURLToPath(import.meta.url)
const results = []
for (let i = 0; i < cases.length; i++) {
  const { case: name, fixture, library, note } = cases[i]
  let row
  try {
    const out = execFileSync(process.execPath, [...process.execArgv, self, "--cell", String(i)], { encoding: "utf8", maxBuffer: 1 << 26, env: process.env })
    row = JSON.parse(out.trim().split("\n").pop())
  } catch (e) {
    // a crash of the whole process (e.g. out of memory) is a result too
    row = { case: name, fixture, library, note, status: "error", error: `process failed: ${String(e.message).split("\n")[0]}` }
  }
  results.push(row)
  console.log(`  ${name} | ${fixture} | ${library}: ${row.status === "ok" ? `median ${fmtMs(row.median)} ms, min ${fmtMs(row.min)} ms${row.truncated ? " (truncated)" : ""}` : `ERROR ${row.error}`}`)
}
mkdirSync(new URL("./results/", import.meta.url), { recursive: true })
writeFileSync(new URL("./results/results.json", import.meta.url), JSON.stringify({ startedAt, results }, null, 2))

// ---------------------------------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------------------------------
const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : fmtMs(ms))
// some errors quote the whole reference path; the table keeps the start
const shorten = (text) => (text.length > 160 ? `${text.slice(0, 157)}…` : text)
const describe = (fixture) => {
  const s = summary[fixture]
  return `${fixture} (${s.files} ${s.files === 1 ? "file" : "files"}, ${s.refs.toLocaleString("en-US")} $refs)`
}

const table = (op) => {
  const rows = results.filter((r) => r.case === op)
  const libs = [...new Set(rows.map((r) => r.library))]
  const fixtureNames = [...new Set(rows.map((r) => r.fixture))]
  const notes = []
  const footnote = (text) => {
    let i = notes.indexOf(text)
    if (i < 0) { notes.push(text); i = notes.length - 1 }
    return `[${i + 1}]`
  }
  const header = libs.map((l) => {
    const note = rows.find((r) => r.library === l && r.note)?.note
    return note ? `${l} ${footnote(`${l}: ${note}`)}` : l
  })
  const lines = ["median / min ms (lower is better)", "", `| fixture | ${header.join(" | ")} |`, `|---|${libs.map(() => "---").join("|")}|`]
  for (const f of fixtureNames) {
    const cells = libs.map((l) => {
      const r = rows.find((x) => x.library === l && x.fixture === f)
      if (!r) { return "" }
      if (r.status !== "ok") { return `— ${footnote(`${l} on ${f}: ${shorten(r.error)}`)}` }
      return `${fmt(r.median)} / ${fmt(r.min)}${r.truncated ? " †" : ""}`
    })
    lines.push(`| ${describe(f)} | ${cells.join(" | ")} |`)
  }
  if (notes.length) { lines.push("", notes.map((n, i) => `[${i + 1}] ${n}`).join("  \n")) }
  return lines.join("\n")
}

const cpu = os.cpus()[0]?.model ?? "unknown"
const report = `# api-ref-bundler benchmark

${CURRENT} compared with the last release (${PREVIOUS}) and with popular libraries that bundle or dereference \`$ref\` documents. Everything below is produced by the scripts in this directory.

## Run it

\`\`\`sh
pnpm install --ignore-workspace
pnpm run all        # builds the library (pnpm build in the repository root), generates the fixtures, runs every cell and rewrites this file
\`\`\`

## Environment

| item | value |
|---|---|
| Node | ${process.version} |
| CPU | ${cpu}, ${os.cpus().length} logical cores, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM |
| OS | ${os.type()} ${os.release()} (${process.platform} ${process.arch}) |
| Date | ${startedAt.toISOString()} |

| library | version |
|---|---|
| ${CURRENT} | \`dist/index.mjs\` built by \`vp pack\` |
| ${PREVIOUS} | npm release |
${Object.entries(versions).map(([name, v]) => `| ${name} | ${v} |`).join("\n")}

## Method

Fixtures are OpenAPI 3 documents generated deterministically by \`fixtures/generate.mjs\`: \`openapi\` is the Swagger petstore replicated into a ${(summary.openapi.bytes / 2 ** 20).toFixed(1)} MB document with internal \`$ref\`s only; \`multi-file\` is a spec of ${summary["multi-file"].files} files (200 paths, 300 schema files, parameters and shared definitions) with relative references between files, acyclic; \`shared-definitions\` has 2 000 references into one file of 1 000 definitions; \`cyclic\` has 1 000 mutually recursive schemas. Every library resolves the files from memory through its own resolver or loader API, so no file I/O and no parsing is measured. Every cell (one library on one fixture) runs in its own fresh Node process that loads only that fixture. Before it is timed, every output is checked: a bundle must contain no external reference and every internal reference must resolve; a dereferenced document must contain no \`$ref\`; a dereferenced cyclic document must contain no \`$ref\` and must be circular. Then every cell is warmed up for ${WARMUP} iterations and timed for ${RUNS} runs; tables show the median and the minimum. Cells marked † took more than 0.5 s per iteration and ran with a shortened warm-up. Libraries that change the documents they are given get a fresh copy for every run, made outside the timing (api-ref-bundler and @stoplight/json-ref-resolver leave their input unchanged). Bundles differ in layout between libraries; only what a bundle must guarantee is checked, not its shape. @stoplight/json-ref-resolver only dereferences, so it appears in the dereference tables only. Every cell starts in a fresh process, as a one-off run such as a CLI call does: on the cyclic fixture, libraries that recurse through the document overflow the stack there, although in a process where their code is already optimized (smaller stack frames) the same call can finish.

## Results

${operations.map(({ op, title }) => `### ${title}\n\n${table(op)}`).join("\n\n")}
`
writeFileSync(new URL("./README.md", import.meta.url), report)
console.log("wrote README.md")
