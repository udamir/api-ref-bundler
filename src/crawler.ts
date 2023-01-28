import { ObjPath } from "./utils"

export const isObject = (value: any): value is Record<string | number | symbol, any> => typeof value === "object" && value !== null

export interface CrawlContext<T> {
  readonly root?: any             // root node
  readonly node?: any             // current node
  readonly path: ObjPath          // path to current node
  readonly key: string | number   // current node key
  readonly params: T              // custom context parameters
}

export interface CrawlHookResponse<T> {
  value?: any,                            // updated value for current node 
  params?: T,                             // updated params
  exitHook?: () => Promise<void> | void   // on exit from current node
}

export type CrawlHook<T> = (value: any, ctx: CrawlContext<T>) => Promise<CrawlHookResponse<T> | null> | CrawlHookResponse<T> | null

export const explore = async <T>(data: any, params: T, hook?: CrawlHook<T>) => {
  const root = { "#": data }

  const context: CrawlContext<T> = { path: [], key: "#", params, root, node: root }
  const _hook: CrawlHook<T> = async (value, ctx) => {
    return hook ? await hook(value, ctx) : { value: value, params: ctx.params }
  }
  return crawl(data, context, _hook)
}

export const transform = async <T>(data: any, params: T, hook?: CrawlHook<T>) => {
  const root = { "#": data }

  const _hook: CrawlHook<T> = async (value, ctx) => {
    if (!hook) {
      return { value, params: ctx.params }
    }

    const res = await hook(value, ctx)

    if (isObject(res)) {
      ctx.node[ctx.key] = res.value
    } else {
      if (Array.isArray(ctx.node) && typeof ctx.key === "number") {
        ctx.node.splice(ctx.key, 1)
      } else {
        delete ctx.node[ctx.key]
      }
    }

    return res
  }

  await crawl(data, { path: [], key: "#", params, root, node: root }, _hook)

  return root["#"]
}

export const clone = async <T>(data: any, params: T, hook?: CrawlHook<T>) => {
  const root: any = {}

  const _hook: CrawlHook<T> = async (value, ctx) => {
    const res = hook ? await hook(value, ctx) : { value, params: ctx.params }

    if (isObject(res)) {
      ctx.node[ctx.key] = isObject(res.value) ? (Array.isArray(res.value) ? [] : {}) : res.value
    }
    return res
  }

  await crawl(data, { path: [], key: "#", params, root, node: root }, _hook)

  return root["#"]
}

export const crawl = async <T>(data: any, ctx: CrawlContext<T>, hook: CrawlHook<T>) => {
  const { value, params = ctx.params, exitHook } = await hook(data, ctx) || {}
  const node = ctx.node[ctx.key]
  // const promises = []

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const _ctx = { ...ctx, params, path: [...ctx.path, i], key: i, node }
      // promises.push(crawl(value[i], _ctx, hook))
      await crawl(value[i], _ctx, hook)
    }
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const _ctx = { ...ctx, params, path: [...ctx.path, key], key, node }
      // promises.push(crawl(value[key], _ctx, hook))
      await crawl(value[key], _ctx, hook)
    }
  }
  
  // await Promise.all(promises)
  exitHook && await exitHook()
}
