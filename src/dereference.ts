import type { CloneState, CrawlContext, JsonPath } from "json-crawl"
import { buildReferenceGraph } from "./build"
import { emitDereferenced } from "./emit-dereference"
import type { RefErrorDetail } from "./errors"
import type { Resolver } from "./resolver"
import type { SiblingStrategy } from "./siblings"
import type { JsonNode } from "./types"

export interface RefNode {
  pointer: string // pointer to node
  ref: string // normalized ref
  sibling?: JsonNode // sibling content
}

export interface DereferenceState {
  parent: object | null // source parent of the current node
  document: string // document the current subtree comes from
  prefix: JsonPath // output path of the current clone root
}

export type DereferenceContext = CrawlContext<CloneState<DereferenceState>>

export interface DereferenceHooks {
  onError?: (
    message: string,
    ctx: DereferenceContext,
    detail?: RefErrorDetail,
  ) => void // error hook
  onRef?: (ref: string, ctx: DereferenceContext) => void // ref hook
  onCrawl?: (value: JsonNode, ctx: DereferenceContext) => void // node crawl hook
  onExit?: (value: JsonNode, ctx: DereferenceContext) => void // node crawl exit hook
  onCycle?: (ref: string, ctx: DereferenceContext) => void // cycle refs hook
}

export interface DereferenceOptions {
  ignoreSibling?: boolean // ignore $ref sibling content (same as siblingStrategy: "ignore")
  siblingStrategy?: SiblingStrategy // how $ref siblings are combined (default "merge")
  fullCrawl?: boolean // hooks revisit shared (memoised) subtrees
  enableCircular?: boolean // convert circular $refs to JS object cycles
  parallelCrawl?: boolean // load documents discovered in one wave concurrently
  hooks?: DereferenceHooks
}

export const dereference = async (
  basePath: string,
  resolver: Resolver,
  options: DereferenceOptions = {},
): Promise<JsonNode> => {
  const graph = await buildReferenceGraph(basePath, resolver, {
    parallelCrawl: options.parallelCrawl,
  })
  return emitDereferenced(graph, options)
}
