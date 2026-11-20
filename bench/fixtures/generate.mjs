// Generates every fixture deterministically into bench/fixtures/generated/<name>.json. A fixture is a set of files,
// stored as { "<file path>": <parsed document> }, with the entry file first. Every library resolves exactly these files
// from memory, so every cell of the report sees the same input and no file I/O is measured.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, "generated")
mkdirSync(out, { recursive: true })

// 1. openapi: the Swagger petstore (fixtures/petstore.yaml) replicated until ~5 MB of JSON, internal $refs only
const petstore = YAML.parse(readFileSync(path.join(here, "petstore.yaml"), "utf8"))
const renameRefs = (value, suffix) => {
  if (Array.isArray(value)) return value.map((v) => renameRefs(v, suffix))
  if (value && typeof value === "object") {
    const o = {}
    for (const k of Object.keys(value)) {
      const v = value[k]
      o[k] = k === "$ref" && typeof v === "string" ? v.replace(/^#\/components\/schemas\/(\w+)$/, `#/components/schemas/$1_${suffix}`) : renameRefs(v, suffix)
    }
    return o
  }
  return value
}
const openapi = (targetBytes) => {
  const doc = { openapi: petstore.openapi, info: petstore.info, servers: petstore.servers, tags: petstore.tags, paths: {}, components: { schemas: {}, securitySchemes: petstore.components.securitySchemes } }
  let k = 0
  for (;;) {
    for (const [p, item] of Object.entries(petstore.paths)) {
      const copy = renameRefs(item, k)
      for (const op of Object.values(copy)) {
        if (op && typeof op === "object" && !Array.isArray(op) && op.operationId) { op.operationId = `${op.operationId}_${k}` }
      }
      doc.paths[`${p}_${k}`] = copy
    }
    for (const [name, schema] of Object.entries(petstore.components.schemas)) { doc.components.schemas[`${name}_${k}`] = renameRefs(schema, k) }
    k++
    if (k % 50 === 0 && JSON.stringify(doc).length >= targetBytes) break
  }
  return { "api.json": doc }
}

// 2. multi-file: 200 paths, 300 schema files, a parameters file and a common file; relative references between files
//    (sibling, parent directory, with and without a pointer). Acyclic, so every library can dereference it fully:
//    schema i references schema i+1 within groups of 10.
const multiFile = () => {
  const N = 300
  const files = {}
  const paths = {}
  for (let i = 0; i < 200; i++) {
    paths[`/items${i}/{id}`] = {
      get: {
        operationId: `get${i}`,
        parameters: [{ $ref: `params.json#/P${i % 50}` }],
        responses: {
          200: { description: "ok", content: { "application/json": { schema: { $ref: `schemas/s${i % N}.json` } } } },
          404: { description: "missing", content: { "application/json": { schema: { $ref: "common.json#/definitions/Error" } } } },
        },
      },
    }
  }
  files["api.json"] = { openapi: "3.0.1", info: { title: "multi-file", version: "1.0.0" }, paths }
  const params = {}
  for (let i = 0; i < 50; i++) { params[`P${i}`] = { name: `p${i}`, in: "query", schema: { $ref: "common.json#/definitions/Tag" } } }
  files["params.json"] = params
  files["common.json"] = {
    definitions: {
      Tag: { type: "string", maxLength: 64 },
      Meta: { type: "object", properties: { tag: { $ref: "#/definitions/Tag" }, created: { type: "string", format: "date-time" } } },
      Error: { type: "object", properties: { code: { type: "integer" }, meta: { $ref: "#/definitions/Meta" } } },
    },
  }
  for (let i = 0; i < N; i++) {
    const properties = {
      id: { type: "integer" },
      name: { type: "string", maxLength: 100 },
      meta: { $ref: "../common.json#/definitions/Meta" },
    }
    if (i % 10 !== 9) {
      properties.child = { $ref: `s${i + 1}.json` }
      properties.ids = { type: "array", items: { $ref: `./s${i + 1}.json#/properties/id` } }
    }
    files[`schemas/s${i}.json`] = { type: "object", description: `schema ${i}`, properties, required: ["id"] }
  }
  return files
}

// 3. shared-definitions: 2 000 references to one file with 1 000 definitions (every definition referenced twice);
//    definitions refer to each other within groups of 5
const sharedDefinitions = () => {
  const D = 1000
  const definitions = {}
  for (let i = 0; i < D; i++) {
    definitions[`D${i}`] = {
      type: "object",
      properties: { id: { type: "integer" }, label: { type: "string" }, ...(i % 5 !== 4 ? { next: { $ref: `#/definitions/D${i + 1}` } } : {}) },
    }
  }
  const schemas = {}
  for (let i = 0; i < 2 * D; i++) { schemas[`S${i}`] = { type: "object", properties: { value: { $ref: `definitions.json#/definitions/D${i % D}` } } } }
  return {
    "api.json": { openapi: "3.0.1", info: { title: "shared-definitions", version: "1.0.0" }, paths: {}, components: { schemas } },
    "definitions.json": { definitions },
  }
}

// 4. cyclic: 1 000 mutually recursive schemas in one document (every schema references three others)
const cyclic = () => {
  const N = 1000
  const schemas = {}
  for (let i = 0; i < N; i++) {
    schemas[`C${i}`] = {
      type: "object",
      properties: {
        a: { $ref: `#/components/schemas/C${(i + 1) % N}` },
        b: { $ref: `#/components/schemas/C${(i * 13) % N}` },
        c: { type: "array", items: { $ref: `#/components/schemas/C${(i * 7 + 5) % N}` } },
        d: { type: "string" },
      },
    }
  }
  return { "api.json": { openapi: "3.0.1", info: { title: "cyclic", version: "1.0.0" }, paths: {}, components: { schemas } } }
}

const countRefs = (v) => {
  let refs = 0
  let nodes = 0
  const stack = [v]
  while (stack.length) {
    const x = stack.pop()
    nodes++
    if (x && typeof x === "object") {
      if (typeof x.$ref === "string") { refs++ }
      for (const k of Object.keys(x)) { stack.push(x[k]) }
    }
  }
  return { refs, nodes }
}

const fixtures = { openapi: openapi(5 * 1024 * 1024), "multi-file": multiFile(), "shared-definitions": sharedDefinitions(), cyclic: cyclic() }
const summary = {}
for (const [name, files] of Object.entries(fixtures)) {
  const json = JSON.stringify(files)
  writeFileSync(path.join(out, `${name}.json`), json)
  const { refs, nodes } = countRefs(files)
  summary[name] = { files: Object.keys(files).length, bytes: json.length, nodes, refs }
  console.log(`${name.padEnd(20)} ${String(summary[name].files).padStart(4)} files ${String(json.length).padStart(9)} bytes ${String(nodes).padStart(8)} nodes ${String(refs).padStart(6)} $refs`)
}
writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2))
