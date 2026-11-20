import { isObject } from "json-crawl"
import {
  type CloneContext,
  type CloneHook,
  cloneTree,
  type WalkBase,
  walkTree,
} from "./crawl"
import type { DereferenceContext, DereferenceOptions } from "./dereference"
import { refErrorMessage } from "./errors"
import type { ReferenceGraph, Site, SourceRef, Target } from "./graph"
import { keptRef, parseTokens, splitRef } from "./ref"
import {
  applySiblings,
  type SiblingStrategy,
  selectSiblings,
  siblingStrategyOf,
} from "./siblings"
import type { JsonNode } from "./types"
import { buildPointer, mergeValues, parseRef, setOwn } from "./utils"

type Hooks = NonNullable<DereferenceOptions["hooks"]>
type OutputNode = Record<string | number, unknown>
type State = { document: string; literal?: boolean }
type Ctx = CloneContext<State>

interface Entry {
  target: Target
  at: WalkBase // position of the materialisation; its path is the output pointer of a cycle back to it
  pointer: string | undefined // that pointer, built on the first cycle and reused by every later one
  node: OutputNode // output parent holding it
  key: string | number
  done: boolean
  patches: Array<{ node: OutputNode; key: string | number }> // enableCircular: cycle sites with siblings
}

interface Layer {
  siblings: Record<string, unknown> | null
  document: string
}

const isRefNode = (
  value: unknown,
): value is Record<string, unknown> & { $ref: string } =>
  isObject(value) && !Array.isArray(value) && typeof value.$ref === "string"

const startsWith = (tokens: string[], prefix: string[]): boolean =>
  tokens.length >= prefix.length && prefix.every((t, i) => tokens[i] === t)

/**
 * Phase 2b: emits the dereferenced document with one clone of the root. Every `$ref` site is
 * replaced by the memoised materialisation of `(target, sibling signature)`; a target already in
 * progress on the current path is a cycle (JS cycle with `enableCircular`, `{ $ref: "#<output pointer>" }` otherwise).
 */
export const emitDereferenced = (
  graph: ReferenceGraph,
  options: DereferenceOptions,
): JsonNode => {
  const strategy: SiblingStrategy = siblingStrategyOf(options)
  const { enableCircular, fullCrawl } = options
  const hooks: Hooks | undefined = options.hooks
  const root: { "#": unknown } = { "#": undefined }

  const memo = new Map<Target, Map<string, Entry>>()
  const inProgress = new Map<Target, Entry[]>()
  // a `$ref` node with siblings is a target of its own (`#/a` → `{ $ref, ...siblings }`)
  const ownTargets = new WeakMap<object, Target>()
  for (const target of graph.targets.values()) {
    if (target.canonical && isRefNode(target.node)) {
      ownTargets.set(target.node, target)
    }
  }
  const outputOf = (entry: Entry): unknown => entry.node[entry.key]
  /** Output pointer of an in-progress entry, built once for all the cycles back to it. */
  const pointerOf = (entry: Entry): string =>
    (entry.pointer ??= buildPointer(entry.at.path))
  let rootVisited = false

  const userCtx = (ctx: {
    value: unknown
    key: string | number
    path: unknown
    parent?: unknown
    node?: OutputNode
    state?: State
  }): DereferenceContext =>
    ({
      value: ctx.value,
      key: ctx.key,
      path: ctx.path,
      state: {
        root,
        node: ctx.node,
        parent: ctx.parent ?? null,
        document: ctx.state?.document ?? graph.rootDocument,
        prefix: [],
      },
    }) as unknown as DereferenceContext

  const locate = (ref: SourceRef): string | undefined =>
    ref.document === graph.rootDocument &&
    startsWith(ref.tokens, graph.rootTokens)
      ? `#${buildPointer(ref.tokens.slice(graph.rootTokens.length))}`
      : undefined

  /** fullCrawl: hooks revisit a memoised subtree without re-resolving anything. */
  const revisit = (output: unknown, at: WalkBase) => {
    if (!hooks?.onCrawl && !hooks?.onExit) {
      return
    }
    const seen = new WeakSet<object>()
    walkTree(
      output,
      (ctx) => {
        if (isObject(ctx.value)) {
          if (seen.has(ctx.value)) {
            return { skip: true }
          }
          seen.add(ctx.value)
        }
        const uctx = userCtx(ctx)
        hooks.onCrawl?.(ctx.value as JsonNode, uctx)
        return { exit: () => hooks.onExit?.(ctx.value as JsonNode, uctx) }
      },
      undefined,
      at,
    )
  }

  const startEntry = (target: Target, sig: string, ctx: Ctx): Entry => {
    const entry: Entry = {
      target,
      at: ctx,
      pointer: undefined,
      node: ctx.node,
      key: ctx.key,
      done: false,
      patches: [],
    }
    let bySig = memo.get(target)
    if (!bySig) {
      bySig = new Map()
      memo.set(target, bySig)
    }
    bySig.set(sig, entry)
    const active = inProgress.get(target)
    if (active) {
      active.push(entry)
    } else {
      inProgress.set(target, [entry])
    }
    return entry
  }

  /** Takes an entry off the current path (it is no longer an ancestor of what is emitted next). */
  const leavePath = (entry: Entry) => {
    const active = inProgress.get(entry.target)
    const index = active ? active.lastIndexOf(entry) : -1
    if (index < 0) {
      return
    }
    ;(active as Entry[]).splice(index, 1)
    if (!(active as Entry[]).length) {
      inProgress.delete(entry.target)
    }
  }

  const completeEntries = (entries: Entry[]) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      entry.done = true
      leavePath(entry)
      for (const patch of entry.patches) {
        setOwn(
          patch.node,
          patch.key,
          mergeValues(outputOf(entry), patch.node[patch.key]),
        )
      }
    }
  }

  const emitSiblings = (layer: Layer, at: WalkBase): unknown =>
    cloneTree(layer.siblings, hook, { document: layer.document }, at)

  const hook: CloneHook<State> = (ctx) => {
    const { value, key, state } = ctx
    const uctx = hooks ? userCtx(ctx) : undefined
    hooks?.onCrawl?.(value as JsonNode, uctx as DereferenceContext)
    const exit = hooks?.onExit
      ? () =>
          hooks.onExit?.(ctx.node[key] as JsonNode, uctx as DereferenceContext)
      : undefined
    const isRoot = !rootVisited
    rootVisited = true

    if (state.literal) {
      return { exit } // data: copied as is
    }
    if (isObject(value) && graph.isLiteral(value)) {
      return { state: { ...state, literal: true }, exit }
    }
    if (isObject(value)) {
      const site =
        graph.siteOf(value) ??
        (isRefNode(value)
          ? graph.lookupRef(state.document, value.$ref)
          : undefined)
      if (site) {
        return handleSite(site, ctx, uctx, exit)
      }
      if (isRoot && graph.rootTarget && !inProgress.has(graph.rootTarget)) {
        // the root node materialises the root target
        const entry = startEntry(graph.rootTarget, "", ctx)
        return {
          exit: () => {
            completeEntries([entry])
            exit?.()
          },
        }
      }
      return { exit }
    }
    return { exit }
  }

  const handleSite = (
    first: Site,
    ctx: Ctx,
    uctx: DereferenceContext | undefined,
    exit: (() => void) | undefined,
  ) => {
    hooks?.onRef?.(first.normalized, uctx as DereferenceContext)

    const started: Entry[] = []
    const chain: Layer[] = []
    const own =
      first.node && first.siblings ? ownTargets.get(first.node) : undefined
    if (own && !inProgress.has(own)) {
      // the `$ref` node encloses its siblings: a reference back to it is a cycle
      started.push(startEntry(own, "", ctx))
      chain.push({ siblings: null, document: first.document })
    }
    let combined: Record<string, unknown> | null = null
    let cur = first

    const applyChain = (out: unknown): unknown => {
      let result = out
      for (let i = chain.length - 1; i >= 0; i--) {
        const layer = chain[i]
        // the siblings of site i lie outside its target and the targets it aliases to
        for (let j = i; j < started.length; j++) {
          leavePath(started[j])
        }
        if (layer.siblings) {
          result = applySiblings(strategy, result, emitSiblings(layer, ctx))
        }
      }
      return result
    }

    const finish = (value: unknown, document: string) => ({
      value,
      state: { document },
      exit: () => {
        if (chain.length) {
          setOwn(ctx.node, ctx.key, applyChain(ctx.node[ctx.key]))
        }
        completeEntries(started)
        exit?.()
      },
    })

    const assign = (output: unknown) => {
      setOwn(ctx.node, ctx.key, output)
      completeEntries(started)
      return { value: output, assign: true, exit }
    }

    while (true) {
      const siblings = selectSiblings(strategy, cur.siblings)
      const layer: Layer = { siblings, document: cur.document }
      const combinedHere: Record<string, unknown> | null = siblings
        ? combined
          ? (mergeValues(siblings, combined) as Record<string, unknown>)
          : siblings
        : combined

      if (cur.error) {
        const error = cur.error
        hooks?.onError?.(
          refErrorMessage(error),
          uctx as DereferenceContext,
          error,
        )
        let ref = keptRef(graph, cur)
        if (error.type === "cycle-without-content") {
          const parsed = parseRef(cur.ref, cur.document)
          const candidates: SourceRef[] = []
          if (parsed.tokens) {
            candidates.push({
              document: parsed.filePath,
              tokens: parsed.tokens,
            })
          }
          for (const member of error.members ?? []) {
            const [document, pointer] = splitRef(member)
            const tokens = parseTokens(pointer)
            if (tokens) {
              candidates.push({ document, tokens })
            }
          }
          candidates.push({ document: error.document, tokens: error.tokens })
          for (const candidate of candidates) {
            const located = locate(candidate)
            if (located) {
              ref = located
              break
            }
          }
        }
        return finish({ $ref: ref, ...siblings }, cur.document)
      }

      const target = cur.target as Target
      const active = inProgress.get(target)
      if (active?.length) {
        const entry = active[0]
        if (hooks?.onCycle) {
          hooks.onCycle(pointerOf(entry), uctx as DereferenceContext)
        }
        if (enableCircular) {
          if (!combinedHere) {
            return assign(outputOf(entry))
          }
          entry.patches.push({ node: ctx.node, key: ctx.key })
          return finish(combinedHere, cur.document)
        }
        return finish(
          { $ref: `#${pointerOf(entry)}`, ...siblings },
          cur.document,
        )
      }

      const sig = combinedHere ? JSON.stringify(combinedHere) : ""
      const bySig = memo.get(target)
      const done = bySig?.get(sig)
      if (done?.done) {
        if (fullCrawl) {
          revisit(outputOf(done), ctx)
        }
        return assign(outputOf(done))
      }
      const plain = sig ? bySig?.get("") : undefined
      if (plain?.done) {
        // already materialised without siblings: reuse it, siblings merged into a copy
        if (fullCrawl) {
          revisit(outputOf(plain), ctx)
        }
        chain.push(layer)
        let out: unknown = outputOf(plain)
        for (let i = chain.length - 1; i >= 0; i--) {
          const outer = chain[i]
          for (let j = i; j < started.length; j++) {
            leavePath(started[j])
          }
          if (outer.siblings) {
            const emitted = emitSiblings(outer, ctx)
            out =
              strategy === "allOf"
                ? { allOf: [out, emitted] }
                : isObject(out) && !Array.isArray(out)
                  ? mergeValues(out, emitted)
                  : out
          }
        }
        return assign(out)
      }

      started.push(startEntry(target, sig, ctx))
      chain.push(layer)
      combined = combinedHere

      if (isRefNode(target.node)) {
        cur =
          graph.siteOf(target.node) ??
          graph.lookupRef(target.document, target.node.$ref)
        continue
      }
      return finish(target.node, target.document)
    }
  }

  const output = cloneTree(graph.rootNode, hook, {
    document: graph.rootDocument,
  })
  root["#"] = output
  return output as JsonNode
}
