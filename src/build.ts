import { RefResolveError } from "./errors"
import { GraphBuilder, type ReferenceGraph, type Resolution } from "./graph"
import {
  DocumentLoader,
  type DocumentSource,
  MapDocumentSource,
  type Resolver,
} from "./resolver"
import { refMapRules } from "./rules"
import { schemaRefMap } from "./rules/jsonSchema"
import type { DefinitionPointer, JsonType, RefMapRules } from "./types"
import { calcJsonType, isModernJsonSchema, parseRef } from "./utils"

export interface GraphOptions {
  rules?: RefMapRules
  parallelCrawl?: boolean
  definitions?: { container?: DefinitionPointer }
}

/** Rule tree for a document type; JSON Schema documents get a draft-aware container. */
export const rulesFor = (
  type: JsonType,
  rootNode: unknown,
  container?: DefinitionPointer,
): RefMapRules | undefined => {
  if (type === "JsonSchema") {
    return schemaRefMap(
      container ?? (isModernJsonSchema(rootNode) ? "/$defs" : "/definitions"),
    )
  }
  return refMapRules[type]
}

const rootError = (entry: string, root: Resolution): RefResolveError => {
  if (root.kind === "error") {
    return new RefResolveError(root.detail)
  }
  if (root.kind === "cycle") {
    return new RefResolveError({
      type: "cycle-without-content",
      ref: entry,
      document: root.head.document,
      tokens: root.head.tokens,
    })
  }
  return new RefResolveError({
    type: "missing",
    ref: entry,
    document: root.kind === "pending" ? root.document : entry,
    tokens: [],
  })
}

const completeGraph = (
  builder: GraphBuilder,
  entry: string,
  root: Resolution & { kind: "found" },
  options: GraphOptions,
): ReferenceGraph => {
  const type = calcJsonType(root.value as Record<string, unknown>)
  const rules =
    options.rules ?? rulesFor(type, root.value, options.definitions?.container)
  const rootTarget = builder.targetFor(root.document, root.tokens)
  return builder.finish(
    entry,
    root.document,
    root.tokens,
    root.value,
    rootTarget,
    rules,
  )
}

const parseEntry = (entry: string) => {
  const parsed = parseRef(entry)
  if (!parsed.tokens) {
    throw new RefResolveError({
      type: "invalid-pointer",
      ref: parsed.normalized,
      document: parsed.filePath,
      tokens: [],
    })
  }
  return parsed as typeof parsed & { tokens: string[] }
}

/**
 * Phase 1 (async): loads documents through the resolver, discovers every reference site
 * and resolves it to its target. Rejects when the entry document or pointer cannot be resolved.
 */
export const buildReferenceGraph = async (
  entry: string,
  resolver: Resolver,
  options: GraphOptions = {},
): Promise<ReferenceGraph> => {
  const loader = new DocumentLoader(resolver)
  const builder = new GraphBuilder(loader)
  const parsed = parseEntry(entry)

  let root: Resolution
  while (true) {
    root = builder.walk(
      parsed.filePath,
      parsed.tokens,
      parsed.normalized,
      new Set(),
      false,
    )
    if (root.kind !== "pending") {
      break
    }
    await loader.load(root.document)
  }
  if (root.kind !== "found") {
    throw rootError(entry, root)
  }

  const type = calcJsonType(root.value as Record<string, unknown>)
  const rules =
    options.rules ?? rulesFor(type, root.value, options.definitions?.container)
  builder.setRoot(root.document, root.tokens)
  builder.crawl(null, root.value, root.document, rules)

  while (true) {
    const needed = builder.step()
    if (!needed.size) {
      break
    }
    await loader.loadAll(needed, !!options.parallelCrawl)
  }

  return completeGraph(builder, entry, root, { ...options, rules })
}

/** Phase 1 (sync) over pre-loaded documents keyed by canonical document id. */
export const buildReferenceGraphSync = (
  entry: string,
  documents: Map<string, unknown> | DocumentSource,
  options: GraphOptions = {},
): ReferenceGraph => {
  const source =
    documents instanceof Map ? new MapDocumentSource(documents) : documents
  const builder = new GraphBuilder(source)
  const parsed = parseEntry(entry)

  const root = builder.walk(
    parsed.filePath,
    parsed.tokens,
    parsed.normalized,
    new Set(),
    false,
  )
  if (root.kind !== "found") {
    throw rootError(entry, root)
  }

  const type = calcJsonType(root.value as Record<string, unknown>)
  const rules =
    options.rules ?? rulesFor(type, root.value, options.definitions?.container)
  builder.setRoot(root.document, root.tokens)
  builder.crawl(null, root.value, root.document, rules)
  builder.step()

  return completeGraph(builder, entry, root, { ...options, rules })
}
