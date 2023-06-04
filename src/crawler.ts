import { isObject } from "./utils"
import { ObjPath } from "./types"

export interface CrawlContext<T> {
  readonly path: ObjPath          // path to current node
  readonly key: string | number   // current node key
  state: T                        // crawl state
}

export type ExitHook = () => void

export interface CrawlHookResponse<T> {
  value?: unknown,                        // updated value of current node for crawl
  state?: T,                              // state for next crawl step
  exitHook?: ExitHook                     // on exit hook for current node
}

export type CloneState<T> = {
  root: { "#": any } 
  node: any
} & T

export type CloneHook<T> = CrawlHook<CloneState<T>>

export type CrawlHook<T> = (value: unknown, ctx: CrawlContext<T>) => Promise<CrawlHookResponse<T> | null> | CrawlHookResponse<T> | null
export type SyncCrawlHook<T> = (value: unknown, ctx: CrawlContext<T>) => | CrawlHookResponse<T> | null

export const explore = async <T>(data: unknown, hooks: CrawlHook<T> | CrawlHook<T>[] = [], _state: T) => {
  return crawl(data, hooks, _state)
}

export const transform = async <T>(data: any, hooks: CloneHook<T> | CloneHook<T>[] = [], _state: T) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]
  const root = { "#": data }

  const transformHook: CloneHook<T> = async (value, { path, key, state }) => {
    key = path.length ? key : "#"
    if (value === undefined) {
      if (Array.isArray(state.node) && typeof key === "number") {
        state.node.splice(key, 1)
      } else {
        delete state.node[key]
      }
    } else {
      state.node[key] = value
    }
    return { value, state }
  }

  await crawl(data, [...hooks, transformHook], { ..._state, root, node: root })

  return root["#"]
}

export const clone = async <T>(data: any, hooks: CloneHook<T> | CloneHook<T>[] = [], _state: T) => {
  hooks = Array.isArray(hooks) ? hooks : [hooks]
  const root: any = {}

  const cloneHook: CloneHook<T> = async (value, { path, key, state }) => {
    key = path.length ? key : "#"
    state.node[key] = isObject(value) ? (Array.isArray(value) ? [] : {}) : value
    return { value, state: { ...state, node: state.node[key] } as CloneState<T> }
  }

  await crawl<CloneState<T>>(data, [...hooks, cloneHook], { ..._state, root, node: root })

  return root["#"]
}

interface CrawlNode<T> {
  // node path
  path: ObjPath 
  // node data
  data: Record<string | number, any>
  
  // node keys
  keys: Array<number | string>
  // current key
  keyIndex: number
  
  // node state
  state: T
  // node onExit hooks 
  hooks?: ExitHook[]
}

export const crawl = async <T>(_data: any, _hooks: CrawlHook<T> | CrawlHook<T>[], state: T) => {
  _hooks = Array.isArray(_hooks) ? _hooks : [_hooks]

  const nodes: CrawlNode<T>[] = [{ data: _data, state, path: [], keys: [], keyIndex: -1 }]

  while (nodes.length > 0) {
    const node = nodes[nodes.length-1]

    if (node.keyIndex >= node.keys.length) {
      // execute exitHooks
      while (node.hooks?.length) { node.hooks.pop()!() }
      
      // move to parent node
      nodes.pop()
      continue
    }

    const key = node.keys[node.keyIndex++]

    const [value, path] = nodes.length > 1 
      ? [node.data[key], [...node.path, key]]
      : [node.data, node.path] // root node
    
    let result: CrawlHookResponse<T> | null = { value, state: node.state }
    const hooks: ExitHook[]  = []

    // execute hooks
    for (const hook of _hooks) {
      if (!hook || !result) { continue }
      result = await hook(result.value, { path, key, state: result.state! })
      result?.exitHook && hooks.push(result.exitHook)
    }
    
    // crawl result value
    if (result && isObject(result.value)) {
      const keys = Array.isArray(result.value) ? [...result.value.keys()] : Object.keys(result.value)
      // move to child nodes
      nodes.push({ hooks, state: result.state!, data: result.value, path, keys, keyIndex: 0 })
    } else {
      // execute exitHooks
      while (hooks.length) { hooks.pop()!() }
    }
  }
}
