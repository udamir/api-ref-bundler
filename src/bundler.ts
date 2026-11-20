import { buildReferenceGraph, buildReferenceGraphSync } from "./build"
import type { BundleOptions } from "./bundle"
import type { DereferenceOptions } from "./dereference"
import { emitBundle } from "./emit-bundle"
import { emitDereferenced } from "./emit-dereference"
import type { RefErrorDetail, SourceMap } from "./errors"
import type { ReferenceGraph } from "./graph"
import { planBundle } from "./plan"
import type { Resolver } from "./resolver"
import type { BundledDocument, JsonNode } from "./types"

export type BundlerOptions = BundleOptions & DereferenceOptions

export interface Bundler {
  graph: ReferenceGraph
  /** Bundles from the shared graph (synchronous: every document is already loaded). */
  bundle(options?: BundleOptions): BundledDocument
  /** Dereferences from the shared graph. */
  dereference(options?: DereferenceOptions): JsonNode
  /** Typed errors collected while building the graph. */
  errors: RefErrorDetail[]
  /** `outputPointer → { document, tokens }` for the default bundle plan. */
  sourceMap: SourceMap
}

const makeBundler = (
  graph: ReferenceGraph,
  options: BundlerOptions,
): Bundler => {
  const defaultPlan = planBundle(graph, options.definitions)
  return {
    graph,
    bundle: (bundleOptions = options) => {
      const plan =
        bundleOptions.definitions === options.definitions
          ? defaultPlan
          : planBundle(graph, bundleOptions.definitions)
      return emitBundle(graph, plan, bundleOptions)
    },
    dereference: (dereferenceOptions = options) =>
      emitDereferenced(graph, dereferenceOptions),
    errors: graph.errors,
    sourceMap: defaultPlan.sourceMap,
  }
}

/** Builds the reference graph once; `bundle()` and `dereference()` emit from it. */
export const createBundler = async (
  entry: string,
  resolver: Resolver,
  options: BundlerOptions = {},
): Promise<Bundler> => {
  const graph = await buildReferenceGraph(entry, resolver, {
    rules: options.rules,
    parallelCrawl: options.parallelCrawl,
    definitions: options.definitions,
  })
  return makeBundler(graph, options)
}

/** Synchronous `bundle` over pre-loaded documents keyed by their (normalised) path or URL. */
export const bundleSync = (
  entry: string,
  documents: Map<string, unknown>,
  options: BundleOptions = {},
) => {
  const graph = buildReferenceGraphSync(entry, documents, {
    rules: options.rules,
    definitions: options.definitions,
  })
  return emitBundle(graph, planBundle(graph, options.definitions), options)
}

/** Synchronous `dereference` over pre-loaded documents keyed by their (normalised) path or URL. */
export const dereferenceSync = (
  entry: string,
  documents: Map<string, unknown>,
  options: DereferenceOptions = {},
): JsonNode => {
  const graph = buildReferenceGraphSync(entry, documents)
  return emitDereferenced(graph, options)
}
