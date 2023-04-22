import { 
  buildPointer, buildRef, getValueByPath, MapArray, mergeValues, 
  ObjPath, parseRef, setValueByPath, isObject
} from "./utils"
import { clone, CrawlContext, CrawlHook } from "./crawler"
import { RefResolver, Resolver } from "./resolver"

// Symbol key for cycled nodes (used for enableCircular mode)
const cycleRef = Symbol("cycleRef")

export interface RefNode {
  pointer: string   // pointer to node
  ref: string       // normalized ref
  sibling?: any     // sibling content
}

export interface DereferenceState {
  refNodes: RefNode[] // parent ref nodes
  baseFile: string    // current file
}

export interface DereferenceOptions {
  ignoreSibling?: boolean   // ignore $ref sibling content
  fullCrawl?: boolean       // crawl all nodes includin cached
  enableCircular?: boolean  // convert circular $refs to nodes
  parallelCrawl?: boolean   // parallel crawl can speedup dereference [experimental]
  hooks?: {
    onError?: (message: string, ctx: CrawlContext<DereferenceState>) => void  // error hook
    onRef?: (ref: string, ctx: CrawlContext<DereferenceState>) => void        // ref hook
    onCrawl?: (value: any, ctx: CrawlContext<DereferenceState>) => void       // node crawl hook
    onExit?: (value: any, ctx: CrawlContext<DereferenceState>) => void        // node crawl exit hook
    onCycle?: (ref: string, ctx: CrawlContext<DereferenceState>) => void      // cycle refs hook
  }
}

export const dereferenceHook = (basePath: string, refResolver: RefResolver, options: DereferenceOptions = {}): CrawlHook<DereferenceState> => {
  const { ignoreSibling, enableCircular, fullCrawl, hooks } = options

  const defaultState: DereferenceState = { 
    refNodes: [{ ref: basePath, pointer: "" }],
    baseFile: basePath, 
  }

  /**
   * Dereferenced $refs cache
   * key   - normilized ref
   * value - dereferenced node
   */
  const cache = new Map<string, any>()

  /**
   * Map of cycle nodes paths (used for enableCircular mode)
   * key    - pointer to source node
   * value  - path to cycle node
   */
  const cycleNodes = new MapArray<string, ObjPath>()

  const hook: CrawlHook<DereferenceState> = async (value, ctx) => {
    const { path, key, node, state = defaultState } = ctx

    // console.debug(buildPointer(path), state.baseFile)

    const exitHook = () => {
      hooks?.onExit && hooks.onExit(node[key], ctx)
      if (!isObject(node[key])) { return }
      cache.set(buildRef(path, state.baseFile), node[key])
      
      // update nodes with cycle $refs
      if (enableCircular) {
        const refs = cycleNodes.get(buildPointer(path))

        if (!refs) { return }
  
        for (const ref of refs) {
          // get sibling content from cycle node
          const sibling = getValueByPath(ctx.root["#"], ref)
  
          // skip if already resolved
          if (sibling && sibling[cycleRef]) { continue }
  
          // merge with sibling
          const value = sibling ? mergeValues(node[key], sibling) : node[key]
          // add cycle ref symbol to node
          value[cycleRef] = buildRef(path)
  
          // update cycle node
          setValueByPath(ctx.root["#"], ref, value)
        }
      }
    }

    if (!isObject(value) || !value.hasOwnProperty("$ref") || typeof value.$ref !== "string") {
      hooks?.onCrawl && hooks.onCrawl(value, ctx)
      return { value, state, exitHook }
    }

    const { $ref, ...rest } = value
    const sibling = (!Object.keys(rest).length || ignoreSibling) ? null : rest

    const { filePath, pointer, normalized } = parseRef($ref, state.baseFile)

    hooks?.onRef && hooks.onRef(normalized, ctx)

    // check if current $ref was in parent nodes
    const refNode = state.refNodes.find((node, i, refNodes) => {
      // if node has sibling content, previous ref nodes should be equal
      if (normalized !== node.ref) { return }
      const prevRefNode = refNodes[refNodes.length-1]
      return !node.sibling || refNodes[i-1]?.ref === prevRefNode.ref
    })

    if (refNode) {
      hooks?.onCycle && hooks.onCycle(refNode.pointer, ctx)
      let value
      if (enableCircular) {
        cycleNodes.add(refNode.pointer, path)
        value = (!sibling) ? null : sibling
      } else {
        value = { $ref: "#" + refNode.pointer, ...sibling }
      }
      hooks?.onCrawl && hooks.onCrawl(value, ctx)
      return { value, state, exitHook: () => { hooks?.onExit && hooks.onExit(node[key], ctx) } }
    }

    // resolve reference and merge with sibling
    if (cache.has(normalized)) {
      const data = cache.get(normalized)
      const value = (!isObject(data) || !sibling) ? data : mergeValues(data, sibling)
      hooks?.onCrawl && hooks.onCrawl(value, ctx)
      if (fullCrawl) {
        return { value, state, exitHook }
      } else {
        return { value: sibling, state, exitHook: () => {
          node[key] = (!isObject(data) || !sibling) ? data : mergeValues(data, node[key])
          exitHook()
        } }
      }
    } else {
      const resolved = await refResolver.resolvePointer(pointer, filePath)

      if (!resolved.value) {
        hooks?.onError && hooks.onError(`Cannot resolve: ${normalized}`, ctx)
        return { value: { $ref: normalized, ...sibling }, state }
      }
      
      // merge resolved value with silbing
      const data = (!isObject(resolved.value) || !sibling)
        ? resolved.value
        : mergeValues(resolved.value, sibling)

      // dereference resolved value merged with sibling
      const result = await hook(data, { ...ctx, state: { 
        refNodes: [ ...state.refNodes, { 
          ref: normalized,
          pointer: buildPointer(path),
          sibling
        }],
        baseFile: resolved.filePath
      }})

      // save dereferenced result to cache if no sibling content
      return { ...result, exitHook: () => {
        !sibling && isObject(node[key]) && cache.set(normalized, node[key])
        result?.exitHook && result.exitHook()
      }}
    }
  }

  return hook
}

export const dereference = async (basePath: string, resolver: Resolver, options: DereferenceOptions = {}) => {
  const baseRef = parseRef(basePath)

  const refResolver = new RefResolver(baseRef.filePath, resolver)
  const base = await refResolver.base(baseRef.pointer)

  return clone(base, dereferenceHook(baseRef.filePath, refResolver, options), options.parallelCrawl)
}
