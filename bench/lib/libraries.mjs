// Every library under test, wrapped so that all of them take the same input: `files`, a map from file path (relative to
// the entry) to the parsed document, served from memory. `mutates` marks libraries that change the documents they are
// given: the harness hands them a fresh copy of the files for every run, made outside the timed part. `note` marks
// output that differs in form from api-ref-bundler's; the report prints it as a footnote.
import { readFileSync } from "node:fs"
import $RefParser from "@apidevtools/json-schema-ref-parser"
import * as redocly from "@redocly/openapi-core"
import { Resolver } from "@stoplight/json-ref-resolver"
import { bundle as scalarBundle } from "@scalar/json-magic/bundle"
import { dereference as scalarDereference } from "@scalar/openapi-parser"
import * as current from "../../dist/index.mjs"
import * as previous from "api-ref-bundler-0.5.1"

// read from node_modules directly: not every package exports its package.json
const version = (name) => JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8")).version

export const ENTRY = "api.json"
// the repository is not released yet, so it is labelled by where it comes from, not by its package.json version
export const CURRENT = "api-ref-bundler (this repository)"
export const PREVIOUS = `api-ref-bundler ${version("api-ref-bundler-0.5.1")}`
export const versions = {
  "@apidevtools/json-schema-ref-parser": version("@apidevtools/json-schema-ref-parser"),
  "@redocly/openapi-core": version("@redocly/openapi-core"),
  "@stoplight/json-ref-resolver": version("@stoplight/json-ref-resolver"),
  "@scalar/json-magic": version("@scalar/json-magic"),
  "@scalar/openapi-parser": version("@scalar/openapi-parser"),
}

// libraries that need absolute locations get the files under this root
const ROOT = "/spec/"
const keyOf = (url) => decodeURI(String(url).replace(/^file:\/\//, "")).replace(ROOT, "")

const apiRefBundler = (lib) => {
  const resolver = (files) => async (path) => files[path]
  return {
    mutates: false,
    bundle: (files) => lib.bundle(ENTRY, resolver(files)),
    dereference: (files) => lib.dereference(ENTRY, resolver(files)),
    dereferenceCircular: (files) => lib.dereference(ENTRY, resolver(files), { enableCircular: true }),
  }
}

const refParserOptions = (files) => ({
  resolve: { file: false, http: false, mem: { order: 1, canRead: true, read: (file) => files[keyOf(file.url)] } },
})

const redoclyConfig = await redocly.createConfig({})
const redoclyBundle = (files, dereference) => {
  // the documents are handed out already parsed: Redocly's own resolver would read and parse text
  class MemoryResolver extends redocly.BaseResolver {
    async loadExternalRef(absoluteRef) { return new redocly.Source(absoluteRef, "", "application/json") }
    parseDocument(source) { return { source, parsed: files[keyOf(source.absoluteRef)] } }
  }
  const doc = { source: new redocly.Source(`${ROOT}${ENTRY}`, "", "application/json"), parsed: files[ENTRY] }
  return redocly.bundle({ doc, config: redoclyConfig, externalRefResolver: new MemoryResolver(), dereference }).then((r) => r.bundle.parsed)
}

const stoplight = (files) =>
  new Resolver({ resolvers: { file: { resolve: async (uri) => files[keyOf(uri.toString())] } } })
    .resolve(files[ENTRY], { baseUri: `${ROOT}${ENTRY}` })
    .then((r) => r.result)

const scalarLoader = (files) => ({ type: "loader", validate: (value) => keyOf(value) in files, exec: async (value) => ({ ok: true, data: files[keyOf(value)], raw: "" }) })
const scalarBundled = (files) => scalarBundle(`${ROOT}${ENTRY}`, { plugins: [scalarLoader(files)], treeShake: false })

export const libraries = {
  [CURRENT]: apiRefBundler(current),
  [PREVIOUS]: apiRefBundler(previous),
  "json-schema-ref-parser": {
    mutates: true,
    bundle: (files) => $RefParser.bundle(`${ROOT}${ENTRY}`, refParserOptions(files)),
    dereference: (files) => $RefParser.dereference(`${ROOT}${ENTRY}`, refParserOptions(files)),
    dereferenceCircular: (files) => $RefParser.dereference(`${ROOT}${ENTRY}`, refParserOptions(files)),
    notes: { bundle: "inlines external files at their first reference instead of collecting them in components" },
  },
  "@redocly/openapi-core": {
    mutates: true,
    bundle: (files) => redoclyBundle(files, false),
    dereference: (files) => redoclyBundle(files, true),
    dereferenceCircular: (files) => redoclyBundle(files, true),
  },
  "@stoplight/json-ref-resolver": {
    mutates: false,
    dereference: stoplight,
    dereferenceCircular: stoplight,
    notes: { bundle: "no bundling" },
  },
  "@scalar/openapi-parser": {
    mutates: true,
    bundle: scalarBundled,
    dereference: async (files) => scalarDereference(await scalarBundled(files)).schema,
    dereferenceCircular: async (files) => scalarDereference(await scalarBundled(files)).schema,
    notes: {
      bundle: "@scalar/json-magic bundle: external files are collected under x-ext",
      dereference: "bundled with @scalar/json-magic, then dereferenced with @scalar/openapi-parser",
    },
  },
}
