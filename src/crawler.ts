import { isObject } from "./utils"
import { ObjPath } from "./types"

export interface CrawlContext<T> {
  readonly root: any              // root node
  readonly node: any              // current node
  readonly path: ObjPath          // path to current node
  readonly key: string | number   // current node key
  state?: T                       // crawl state
}

export type ExitHook = () => void

export interface CrawlHookResponse<T> {
  value?: unknown,                        // updated value of current node for crawl
  state?: T,                              // state for next crawl step
  exitHook?: ExitHook                     // on exit hook for current node
}

export type CrawlHook<T> = (value: unknown, ctx: CrawlContext<T>) => Promise<CrawlHookResponse<T> | null> | CrawlHookResponse<T> | null
export type SyncCrawlHook<T> = (value: unknown, ctx: CrawlContext<T>) => | CrawlHookResponse<T> | null

export const stateHookFactory = <T>(state: T): SyncCrawlHook<T> => (value: any) => ({ value, state })

export const explore = async <T>(data: unknown, hooks: CrawlHook<T> | CrawlHook<T>[] = [], asyncCrawl = false) => {
  const root = { "#": data }
  return crawl(data, { path: [], key: "#", root, node: root }, hooks, asyncCrawl)
}

export const transform = async <T>(data: any, hooks: CrawlHook<T> | CrawlHook<T>[] = [], asyncCrawl = false) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]
  const root = { "#": data }

  const transformHook: CrawlHook<T> = async (value, ctx) => {
    if (value === undefined) {
      if (Array.isArray(ctx.node) && typeof ctx.key === "number") {
        ctx.node.splice(ctx.key, 1)
      } else {
        delete ctx.node[ctx.key]
      }
    } else {
      ctx.node[ctx.key] = value
    }
    return { value, state: ctx.state }
  }

  await crawl(data, { path: [], key: "#", root, node: root }, [...hooks, transformHook], asyncCrawl)

  return root["#"]
}


export const clone = async <T>(data: any, hooks: CrawlHook<T> | CrawlHook<T>[] = [], asyncCrawl = false) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]
  const root: any = {}

  const cloneHook: CrawlHook<T> = async (value, ctx) => {
    ctx.node[ctx.key] = isObject(value) ? (Array.isArray(value) ? [] : {}) : value
    return { value, state: ctx.state }
  }

  await crawl(data, { path: [], key: "#", root, node: root }, [...hooks, cloneHook], asyncCrawl)

  return root["#"]
}

export const crawl = async <T>(data: any, ctx: CrawlContext<T>, hooks: CrawlHook<T> | CrawlHook<T>[], asyncCrawl = false) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]

  const exitHooks: ExitHook[] = []
  let result: CrawlHookResponse<T> = { value: data, state: ctx.state }

  for (const hook of hooks) {
    if (!hook) { continue }
    result = await hook(result.value, { ...ctx, state: result.state }) || {}
    result.exitHook && exitHooks.push(result.exitHook)
  }

  const { state, value } = result
  const node = ctx.node[ctx.key]
  const promises = []

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const _ctx = { ...ctx, path: [...ctx.path, i], key: i, state, node }
      if (asyncCrawl) {
        promises.push(crawl(value[i], _ctx, hooks, asyncCrawl))
      } else {
        await crawl(value[i], _ctx, hooks, asyncCrawl)
      }
    }
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const _ctx = { ...ctx, path: [...ctx.path, key], state, key, node }
      if (asyncCrawl) {
        promises.push(crawl(value[key], _ctx, hooks, asyncCrawl))
      } else {
        await crawl(value[key], _ctx, hooks, asyncCrawl)
      }
    }
  }
  
  asyncCrawl && await Promise.all(promises)
  for (const exitHook of exitHooks.reverse()) {
    exitHook()
  }
}

export const syncCrawl = <T>(data: any, ctx: CrawlContext<T>, hooks: SyncCrawlHook<T> | SyncCrawlHook<T>[]) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]

  const exitHooks: ExitHook[] = []
  let result: CrawlHookResponse<T> = { value: data, state: ctx.state }

  for (const hook of hooks) {
    if (!hook) { continue }
    const _result = hook(result.value, { ...ctx, state: result.state })
    result = _result || {}
    if (!_result) { break }
    result.exitHook && exitHooks.push(result.exitHook)
  }

  const { value, state } = result
  const node = ctx.node[ctx.key]

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const _ctx = { ...ctx, state, path: [...ctx.path, i], key: i, node }
      syncCrawl(value[i], _ctx, hooks)
    }
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const _ctx = { ...ctx, state, path: [...ctx.path, key], key, node }
      syncCrawl(value[key], _ctx, hooks)
    }
  }
  
  for (const exitHook of exitHooks.reverse()) {
    exitHook()
  }
}
