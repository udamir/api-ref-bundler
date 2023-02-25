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

export interface DereferenceParams {
  refNodes: RefNode[] // parent ref nodes
  baseFile: string    // current file
}

export type DereferenceContext = CrawlContext<DereferenceParams>

export interface DereferenceOptions {
  ignoreSibling?: boolean   // ignore $ref sibling content
  fullCrawl?: boolean       // crawl all nodes includin cached
  enableCircular?: boolean  // convert circular $refs to nodes
  hooks?: {
    onError?: (message: string, ctx: DereferenceContext) => void  // error hook
    onRef?: (ref: string, ctx: DereferenceContext) => void        // ref hook
    onCrawl?: (value: any, ctx: DereferenceContext) => void       // node crawl hook
    onExit?: (value: any, ctx: DereferenceContext) => void        // node crawl exit hook
    onCycle?: (ref: string, ctx: DereferenceContext) => void      // cycle refs hook
  }
}

export const dereference = async (basePath: string, resolver: Resolver, options: DereferenceOptions = {}) => {
  const { ignoreSibling, enableCircular, fullCrawl, hooks } = options
  const baseRef = parseRef(basePath)

  const refResolver = new RefResolver(baseRef.filePath, resolver)
  const base = await refResolver.base(baseRef.pointer)

  const _params: DereferenceParams = { 
    refNodes: [{ ref: baseRef.filePath, pointer: "" }],
    baseFile: baseRef.filePath, 
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

  const hook: CrawlHook<DereferenceParams> = async (value, ctx) => {
    const { params, path, key, node } = ctx

    // console.debug(buildPointer(path), params.baseFile)

    const exitHook = () => {
      hooks?.onExit && hooks.onExit(node[key], ctx)
      if (!isObject(node[key])) { return }
      cache.set(buildRef(path, baseRef.filePath), node[key])
      
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

    if (!isObject(value) || !value.hasOwnProperty("$ref")) {
      hooks?.onCrawl && hooks.onCrawl(value, ctx)
      return { value, params, exitHook }
    }

    const { $ref, ...rest } = value
    const sibling = (!Object.keys(rest).length || ignoreSibling) ? null : rest

    const { filePath, pointer, normalized } = parseRef($ref, params.baseFile)

    hooks?.onRef && hooks.onRef(normalized, ctx)

    // check if current $ref was in parent nodes
    const refNode = params.refNodes.find((node, i, refNodes) => {
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
      return { value, params, exitHook: () => { hooks?.onExit && hooks.onExit(node[key], ctx) } }
    }

    // resolve reference and merge with sibling
    if (cache.has(normalized)) {
      const data = cache.get(normalized)
      const value = (!isObject(data) || !sibling) ? data : mergeValues(data, sibling)
      hooks?.onCrawl && hooks.onCrawl(value, ctx)
      if (fullCrawl) {
        return { value, params: params, exitHook }
      } else {
        return { value: sibling, params, exitHook: () => {
          node[key] = (!isObject(data) || !sibling) ? data : mergeValues(data, node[key])
          exitHook()
        } }
      }
    } else {
      const resolved = await refResolver.resolvePointer(pointer, filePath)

      if (!resolved.value) {
        hooks?.onError && hooks.onError(`Cannot resolve: ${normalized}`, ctx)
        return { value: { $ref: normalized, ...sibling }, params }
      }
      
      // merge resolved value with silbing
      const data = (!isObject(resolved.value) || !sibling)
        ? resolved.value
        : mergeValues(resolved.value, sibling)

      // dereference resolved value merged with sibling
      const result = await hook(data, { 
        ...ctx, 
        params: { 
          refNodes: [ ...params.refNodes, { 
            ref: normalized,
            pointer: buildPointer(path),
            sibling
          }],
          baseFile: resolved.filePath
        }
      })

      // save dereferenced result to cache if no sibling content
      return { ...result, exitHook: () => {
        !sibling && isObject(node[key]) && cache.set(normalized, node[key])
        result?.exitHook && result.exitHook()
      }}
    }
  }

  return clone(base, _params, hook)
}
