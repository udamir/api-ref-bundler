import { isObject } from "json-crawl"
import type { BundleContext, BundleOptions } from "./bundle"
import { type CloneContext, type CloneHook, cloneTree } from "./crawl"
import { type RefErrorDetail, refErrorMessage } from "./errors"
import type { ReferenceGraph, Site, SourceRef, Target } from "./graph"
import type { BundlePlan } from "./plan"
import { keptRef, parseTokens, splitRef } from "./ref"
import {
  applySiblings,
  refWithSiblings,
  type SiblingStrategy,
  selectSiblings,
  siblingStrategyOf,
} from "./siblings"
import type { BundledDocument } from "./types"
import { buildPointer, parseRef, setOwn, setValueByPath } from "./utils"

type Hooks = NonNullable<BundleOptions["hooks"]>
type SiblingLayer = { siblings: Record<string, unknown> | null }
type Ctx = CloneContext<null>

const isRefNode = (
  value: unknown,
): value is Record<string, unknown> & { $ref: string } =>
  isObject(value) && !Array.isArray(value) && typeof value.$ref === "string"

const LEGACY_DRAFT = /json-schema\.org\/draft-0[34]\//

const declaresLegacyDraft = (node: unknown): boolean =>
  isObject(node) &&
  typeof node.$schema === "string" &&
  LEGACY_DRAFT.test(node.$schema)

/**
 * Phase 2a: emits the bundled document from the graph and the plan with one clone of the
 * root plus one per appended definition slot (rooted at the slot's output path).
 */
export const emitBundle = (
  graph: ReferenceGraph,
  plan: BundlePlan,
  options: BundleOptions,
): BundledDocument => {
  const strategy: SiblingStrategy = siblingStrategyOf(options)
  const hooks: Hooks | undefined = options.hooks
  const inProgress = new Set<Target>()
  const root: { "#": unknown } = { "#": undefined }

  const userCtx = (ctx: Ctx): BundleContext =>
    ({
      value: ctx.value,
      key: ctx.key,
      path: ctx.path,
      state: { root, node: ctx.node, parent: ctx.parent ?? null, prefix: [] },
      rules: undefined,
    }) as unknown as BundleContext

  /**
   * Content copied from another document loses its resource identity (`$id`, draft-04 `id`): its
   * pointers are rewritten against the bundle root, which an embedded `$id` would re-base. Only the
   * identifier the copied node itself declares is removed from the emitted object.
   */
  const stripIdentity = (out: unknown, targets: Iterable<Target>) => {
    if (!isObject(out) || Array.isArray(out)) {
      return
    }
    for (const target of targets) {
      const node = target.node
      if (target.document === graph.rootDocument || !isObject(node)) {
        continue
      }
      if (typeof node.$id === "string" && out.$id === node.$id) {
        delete out.$id
      }
      if (
        typeof node.id === "string" &&
        out.id === node.id &&
        (declaresLegacyDraft(node) || declaresLegacyDraft(graph.rootNode))
      ) {
        delete out.id
      }
    }
  }

  /** Output pointer of a source location, when it is structurally present in the output. */
  const locate = (ref: SourceRef): string | undefined => {
    const location = plan.locateRef(ref.document, ref.tokens)
    return location ? `#${buildPointer(location)}` : undefined
  }

  /** For a pure loop: the written reference, else a loop member inside the output, else the loop head. */
  const cyclePointer = (site: Site): string => {
    const parsed = parseRef(site.ref, site.document)
    const immediate =
      parsed.tokens &&
      locate({ document: parsed.filePath, tokens: parsed.tokens })
    if (immediate) {
      return immediate
    }
    for (const member of site.error?.members ?? []) {
      const [document, pointer] = splitRef(member)
      const tokens = parseTokens(pointer)
      const location = tokens && locate({ document, tokens })
      if (location) {
        return location
      }
    }
    const error = site.error as RefErrorDetail
    return (
      locate({ document: error.document, tokens: error.tokens }) ??
      site.normalized
    )
  }

  const hook: CloneHook<null> = (ctx) => {
    const { value, key } = ctx
    const uctx = hooks ? userCtx(ctx) : undefined
    hooks?.onCrawl?.(value, uctx as BundleContext)
    const exit = hooks?.onExit
      ? () => hooks.onExit?.(ctx.node[key], uctx as BundleContext)
      : undefined

    if (isObject(value)) {
      const site = graph.siteOf(value)
      if (site) {
        return handleSite(site, ctx, uctx, exit)
      }
      return { exit }
    }

    if (typeof value === "string" && isObject(ctx.parent)) {
      const site = graph.stringSiteOf(ctx.parent, String(key))
      if (site?.target) {
        const location = plan.location(site.target)
        if (location) {
          return { value: `#${buildPointer(location)}`, assign: true, exit }
        }
      }
    }
    return { exit }
  }

  const handleSite = (
    first: Site,
    ctx: Ctx,
    uctx: BundleContext | undefined,
    exit: (() => void) | undefined,
  ) => {
    hooks?.onRef?.(first.normalized, uctx as BundleContext)

    const chain: SiblingLayer[] = []
    const inlined: Target[] = []
    let cur = first

    const finish = (value: unknown, assign = false) => ({
      value,
      assign,
      exit: () => {
        if (chain.length) {
          let out = ctx.node[ctx.key]
          for (let i = chain.length - 1; i >= 0; i--) {
            const layer = chain[i]
            if (layer.siblings) {
              out = applySiblings(
                strategy,
                out,
                cloneTree(layer.siblings, hook, null, ctx),
              )
            }
          }
          setOwn(ctx.node, ctx.key, out)
        }
        stripIdentity(ctx.node[ctx.key], inlined)
        for (const target of inlined) {
          inProgress.delete(target)
        }
        exit?.()
      },
    })

    while (true) {
      const siblings = selectSiblings(strategy, cur.siblings)

      if (cur.error) {
        const error = cur.error
        hooks?.onError?.(refErrorMessage(error), uctx as BundleContext, error)
        const ref =
          error.type === "cycle-without-content"
            ? cyclePointer(cur)
            : keptRef(graph, cur)
        return finish({ $ref: ref, ...siblings })
      }

      const target = cur.target as Target
      const emitHere = plan.contentSite.get(cur) === target

      // a structurally valid written pointer stays as written (alias-collapsed only when it crosses a `$ref`)
      const immediate =
        !emitHere && cur.immediate ? locate(cur.immediate) : undefined
      if (immediate) {
        return finish(refWithSiblings(strategy, immediate, siblings))
      }

      const location = plan.location(target)
      if (
        emitHere ||
        (!location &&
          typeof target.node !== "string" &&
          !inProgress.has(target))
      ) {
        chain.push({ siblings })
        inProgress.add(target)
        inlined.push(target)
        if (isRefNode(target.node)) {
          const next = graph.siteOf(target.node)
          if (next && next !== cur) {
            cur = next
            continue
          }
        }
        return finish(target.node)
      }

      if (!location) {
        // string targets (.md) are inlined; unlocatable cyclic targets keep the reference
        if (typeof target.node === "string") {
          return finish(target.node, true)
        }
        return finish({ $ref: cur.normalized, ...siblings })
      }

      return finish(
        refWithSiblings(strategy, `#${buildPointer(location)}`, siblings),
      )
    }
  }

  const output = cloneTree(graph.rootNode, hook, null)
  root["#"] = output

  if (!plan.slots.length) {
    return output
  }
  const container: Record<string | number, unknown> = isObject(output)
    ? output
    : {}
  for (const slot of plan.slots) {
    const emitted = cloneTree(slot.target.node, hook, null, {
      depth: slot.path.length,
      path: slot.path,
    })
    stripIdentity(emitted, [slot.target])
    setValueByPath(container, slot.path, emitted)
  }
  return output
}
