import { ObjPath } from "./utils"

export const isObject = (value: any): value is Record<string | number | symbol, any> => typeof value === "object" && value !== null

export interface CrawlContext<T> {
  readonly root?: any
  readonly path: ObjPath
  readonly key: string | number
  readonly params: T
}

export interface CrawlHookResponse<T> {
  value?: any,
  params?: T,
  exitHook?: (v: any) => Promise<void> | void
}

export type CrawlHook<T> = (value: any, ctx: CrawlContext<T>) => Promise<CrawlHookResponse<T> | null> | CrawlHookResponse<T> | null

export const explore = async <T>(data: any, params: T, hook?: CrawlHook<T>) => {
  const context: CrawlContext<T> = { path: [], key: "", params }
  const _hook: CrawlHook<T> = async (value, ctx) => {
    return hook ? await hook(value, ctx) : { value: value, params: ctx.params }
  }
  return crawl(data, context, _hook)
}

export const transform = async <T>(data: any, params: T, hook?: CrawlHook<T>) => {
  const root: any = {}
  const _ctx = { path: [], key: "", params, root }

  let node = root
  const _hook: CrawlHook<T> = async (value, ctx) => {
    const res = hook ? await hook(value, ctx) : { value, params: ctx.params }

    const _node = node
    if (isObject(res)) {
      if (isObject(res.value)) {
        node[ctx.key] = Array.isArray(res.value) ? [] : {}
        node = node[ctx.key]
      } else {
        node[ctx.key] = res.value
      }
    }

    const exitHook = () => {
      node = _node
      return res?.exitHook && res.exitHook(_node)
    }

    return { ...res, exitHook }
  }

  await crawl(data, _ctx, _hook)

  return _ctx.root[""]
}

export const crawl = async <T>(data: any, ctx: CrawlContext<T>, hook: CrawlHook<T>) =>{
  const { value, params = ctx.params, exitHook } = await hook(data, ctx) || {}
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const _ctx = { ...ctx, params, path: [...ctx.path, i], key: i }
      await crawl(value[i], _ctx, hook)
    }
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      const _ctx = { ...ctx, params, path: [...ctx.path, key], key }
      await crawl(value[key], _ctx, hook)
    }
  }
  exitHook && await exitHook(value)
}
