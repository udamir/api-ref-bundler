import {
  type CrawlContext,
  type CrawlRules,
  isObject,
  type JsonPath,
  syncCrawl,
} from "json-crawl"
import { setOwn } from "./utils"

/**
 * Thin adapters over json-crawl's `syncCrawl` (1.2, `lazyPath: true`): json-crawl does the iterative traversal, the
 * per-node rule resolution, the parent of each node and its path, built only when read. On top of that the adapters
 * add the output containers of a clone and absolute paths for a traversal started inside another one (sibling layers,
 * definition slots, fullCrawl revisits): such a traversal receives the outer node's context (or a fixed path) as its
 * `base`.
 *
 * Per node the adapters allocate one context object and nothing else: the walk returns no response for ordinary nodes,
 * and the clone keeps its output containers and states on two stacks, popped by one shared exit hook, instead of a new
 * state and response object per container.
 */

/** Where a traversal starts: the context of an outer node, or a fixed path. */
export interface WalkBase {
  readonly depth: number
  readonly path: JsonPath
}

export interface WalkContext<R extends object> extends WalkBase {
  readonly value: unknown
  readonly key: string | number
  readonly parent: unknown // source parent (undefined for the root)
  readonly rules: CrawlRules<R> | undefined
}

export interface WalkResult {
  skip?: boolean // do not descend into this node
  exit?: () => void // called after the children (or right away for leaves / skipped nodes)
}

export type WalkHook<R extends object> = (
  ctx: WalkContext<R>,
) => WalkResult | undefined

type OutputNode = Record<string | number, unknown>

const DONE = { done: true } as const

const absolutePath = <R extends object>(
  base: WalkBase | undefined,
  c: CrawlContext<object, R>,
): JsonPath => (base ? [...base.path, ...c.path] : c.path.slice())

// The contexts are classes with `path` and `depth` getters on the prototype: every instance shares one hidden class.
// An object literal with its own `get path()` per node falls back to dictionary mode, which made every walk several
// times slower (148 ms instead of 22 ms on a 5.5 MB document).
class WalkNode<R extends object> implements WalkContext<R> {
  declare readonly value: unknown
  declare readonly key: string | number
  declare readonly parent: unknown
  declare readonly rules: CrawlRules<R> | undefined
  readonly #c: CrawlContext<object, R>
  readonly #base: WalkBase | undefined

  constructor(c: CrawlContext<object, R>, base: WalkBase | undefined) {
    this.value = c.value
    this.key = c.key ?? ""
    this.parent = c.parent
    this.rules = c.rules
    this.#c = c
    this.#base = base
  }

  get path(): JsonPath {
    return absolutePath(this.#base, this.#c)
  }

  get depth(): number {
    return (this.#base?.depth ?? 0) + this.#c.path.length
  }
}

/** An array of the source length: json-crawl does not visit holes, so they stay holes. */
// oxlint-disable-next-line unicorn/no-new-array
const sparseArray = (length: number): unknown[] => new Array(length)

/** Pre-order traversal; `ctx.rules` are the json-crawl rules resolved for the node. */
export const walkTree = <R extends object>(
  root: unknown,
  hook: WalkHook<R>,
  rules?: CrawlRules<R>,
  base?: WalkBase,
): void => {
  syncCrawl<object, R>(
    root,
    (c) => {
      const result = hook(new WalkNode<R>(c, base))
      if (result === undefined) {
        return undefined
      }
      if (result.skip) {
        result.exit?.()
        return DONE
      }
      return result.exit ? { exitHook: result.exit } : undefined
    },
    { rules, lazyPath: true },
  )
}

export interface CloneContext<S> extends WalkBase {
  readonly value: unknown
  readonly key: string | number
  readonly parent: unknown // source parent (undefined for the root)
  readonly node: OutputNode // output parent
  readonly state: S
}

export interface CloneResult<S> {
  value?: unknown // source value to descend into (default: ctx.value)
  state?: S // state for the children
  assign?: boolean // `value` is the finished output: store it, do not descend
  exit?: () => void // called after the children (or right away when nothing is descended)
}

export type CloneHook<S> = (ctx: CloneContext<S>) => CloneResult<S> | undefined

class CloneNode<S> implements CloneContext<S> {
  declare readonly value: unknown
  declare readonly key: string | number
  declare readonly parent: unknown
  declare readonly node: OutputNode
  declare readonly state: S
  // read at every materialised reference: kept as a number (the clone's stack height), not derived from the path,
  // which would build the path at every reference (+30% on deep recursive schemas)
  declare readonly depth: number
  readonly #c: CrawlContext<object>
  readonly #base: WalkBase | undefined

  constructor(
    c: CrawlContext<object>,
    key: string | number,
    node: OutputNode,
    state: S,
    depth: number,
    base: WalkBase | undefined,
  ) {
    this.value = c.value
    this.key = key
    this.parent = c.parent
    this.node = node
    this.state = state
    this.depth = depth
    this.#c = c
    this.#base = base
  }

  get path(): JsonPath {
    return absolutePath(this.#base, this.#c)
  }
}

/**
 * Deep clone driven by a hook. The hook may replace the value that is descended into,
 * assign a finished output directly, change the state for the children and register an exit
 * callback that runs when the node's children have been emitted. Shared input objects are
 * copied separately (the output is a tree unless a hook assigns shared values).
 */
export const cloneTree = <S>(
  root: unknown,
  hook: CloneHook<S>,
  state: S,
  base?: WalkBase,
): unknown => {
  const holder: OutputNode = {}
  const baseDepth = base?.depth ?? 0
  // the output container and the state of the node being crawled are on top; a container's entry is popped by its
  // exit hook, once its children have been emitted
  const nodes: OutputNode[] = [holder]
  const states: S[] = [state]
  const pop = () => {
    nodes.pop()
    states.pop()
  }
  const POP = { exitHook: pop }

  syncCrawl<object>(
    root,
    (c) => {
      const key = c.key ?? "#"
      const node = nodes[nodes.length - 1]
      const nodeState = states[states.length - 1]
      const result = hook(
        new CloneNode<S>(
          c,
          key,
          node,
          nodeState,
          baseDepth + nodes.length - 1,
          base,
        ),
      )
      const next = result && "value" in result ? result.value : c.value
      if (result?.assign || !isObject(next)) {
        setOwn(node, key, next)
        result?.exit?.()
        return DONE
      }
      const container = (
        Array.isArray(next) ? sparseArray(next.length) : {}
      ) as OutputNode
      setOwn(node, key, container)
      nodes.push(container)
      states.push(result?.state ?? nodeState)
      const exit = result?.exit
      if (next === c.value && exit === undefined) {
        return POP
      }
      return {
        value: next,
        exitHook:
          exit === undefined
            ? pop
            : () => {
                pop()
                exit()
              },
      }
    },
    { lazyPath: true },
  )
  return holder["#"]
}
