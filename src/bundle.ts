import type { CloneState, CrawlContext, JsonPath } from "json-crawl"
import { buildReferenceGraph } from "./build"
import { emitBundle } from "./emit-bundle"
import type { RefErrorDetail } from "./errors"
import { type DefinitionNamingTarget, planBundle } from "./plan"
import type { Resolver } from "./resolver"
import type { SiblingStrategy } from "./siblings"
import type { DefinitionPointer, RefMapRules } from "./types"

export interface BundleState {
  parent: object | null // source parent of the current node
  prefix: JsonPath // output path of the current clone root
}

export type BundleContext = CrawlContext<CloneState<BundleState>, RefMapRules>

export interface BundleHooks {
  onError?: (
    message: string,
    ctx: BundleContext,
    detail?: RefErrorDetail,
  ) => void // error hook
  onRef?: (ref: string, ctx: BundleContext) => void // ref hook
  onCrawl?: (value: unknown, ctx: BundleContext) => void // node crawl hook
  onExit?: (value: unknown, ctx: BundleContext) => void // node crawl exit hook
}

export interface BundleOptions {
  ignoreSibling?: boolean // ignore $ref sibling content (same as siblingStrategy: "ignore")
  siblingStrategy?: SiblingStrategy // how $ref siblings are combined (default "merge")
  parallelCrawl?: boolean // load documents discovered in one wave concurrently
  hooks?: BundleHooks
  rules?: RefMapRules
  definitions?: {
    container?: DefinitionPointer // force the definition container (e.g. "/$defs")
    naming?: (target: DefinitionNamingTarget) => string // base name of a hoisted definition
  }
}

export const bundle = async (
  baseFile: string,
  resolver: Resolver,
  options: BundleOptions = {},
) => {
  const graph = await buildReferenceGraph(baseFile, resolver, {
    rules: options.rules,
    parallelCrawl: options.parallelCrawl,
    definitions: options.definitions,
  })
  const plan = planBundle(graph, options.definitions)
  return emitBundle(graph, plan, options)
}
