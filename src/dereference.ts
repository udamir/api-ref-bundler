import { 
  buildPointer, buildRef, getValueByPath, MapArray, mergeValues, ObjPath, 
  parsePointer, parseRef, setValueByPath
} from "./utils"
import { clone, CrawlContext, CrawlHook, isObject } from "./crawler"
import { RefResolver, Resolver } from "./resolver"

// Symbol key for cycled nodes (used for enableCircular mode)
const cycleRef = Symbol("cycleRef")

export interface RefNode {
  pointer: string   // pointer to node
  ref: string       // normalized ref
  sibling?: any     // sibling value
}

export interface DereferenceParams {
  refNodes: RefNode[] // parent ref nodes
  basePath: string    // current file
  path: ObjPath       // path in current file
}

interface DereferenceOptions {
  ignoreSibling?: boolean
  enableCircular?: boolean
  hooks?: {
    onError: (message: string, ctx: CrawlContext<DereferenceParams>) => void
    onRef: (ref: string, ctx: CrawlContext<DereferenceParams>) => void
    onCrawl: (value: any, ctx: CrawlContext<DereferenceParams>) => void
    onCycle: (ref: string, ctx: CrawlContext<DereferenceParams>) => void
  }
}

export const dereference = async (basePath: string, resolver: Resolver, options: DereferenceOptions = {}) => {
  const { ignoreSibling, enableCircular, hooks } = options
  const baseRef = parseRef(basePath)

  const refResolver = new RefResolver(baseRef.filePath, resolver)
  const base = await refResolver.base(baseRef.pointer)

  const _params: DereferenceParams = { 
    refNodes: [{ ref: baseRef.filePath, pointer: "" }],
    basePath: baseRef.filePath, 
    path: parsePointer(baseRef.pointer)
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
    hooks?.onCrawl(value, ctx)
    
    const { params, path, key } = ctx

    // console.debug(params.basePath, buildPointer([...params.path, ...ctx.path]))

    /**
     * Exit hook to update nodes with cycle $refs
     * (used for enableCircular mode)
     */
    const circularHook = () => {
      const refs = cycleNodes.get(buildPointer([...params.path, ...ctx.path]))

      if (!refs) { return }

      for (const ref of refs) {
        // get sibling content from cycle node
        const path = ["#", ...ref.slice(ctx.params.path.length)]
        const sibling = getValueByPath(ctx.root, path)

        // skip if already resolved
        if (sibling && sibling[cycleRef]) { continue }

        // merge with sibling
        const value = sibling ? mergeValues(ctx.node[key], sibling) : ctx.node[key]
        // add cycle ref symbol to node
        value[cycleRef] = buildRef([...ctx.path, ...ctx.params.path])

        // update cycle node
        setValueByPath(ctx.root, path, value)
      }
    }

    const exitHook = () => {
      if (!isObject(ctx.node[key])) { return }
      cache.set(buildRef(ctx.path, params.basePath), ctx.node[key])
      enableCircular && circularHook()
    }

    if (!isObject(value) || !value.hasOwnProperty("$ref")) {
      return { value, params, exitHook }
    }

    const { $ref, ...sibling } = value
    const { filePath, pointer, normalized } = parseRef($ref, params.basePath)

    hooks?.onRef(normalized, ctx)

    // check if current $ref was in parent nodes
    const refNode = params.refNodes.find((node, i, refNodes) => {
      // if node has sibling content, previous ref nodes should be equal
      const prevRefNode = refNodes[refNodes.length-1]
      return normalized === node.ref && (!node.sibling || refNodes[i-1]?.ref === prevRefNode.ref)
    })

    if (refNode) {
      hooks?.onCycle(refNode.pointer, ctx)
      if (enableCircular) {
        cycleNodes.add(refNode.pointer, [ ...params.path, ...ctx.path ])
        return { value: (ignoreSibling || refNode.sibling) ? null : sibling, params }
      } else {
        return { value: { $ref: "#" + refNode.pointer, ...(ignoreSibling || refNode.sibling) ? {} : sibling }, params }
      }
    }

    // resolve reference on Exit and merge with sibling
    const refExitHook = async () => {
      let data
      if (cache.has(normalized)) {
        data = cache.get(normalized)
      } else {
        const resolvedPointer = await refResolver.resolvePointer(pointer, filePath)

        if (!resolvedPointer.value) {
          hooks?.onError(`Cannot resolve: ${normalized}`, ctx)
          ctx.node[key] = { $ref: normalized, ...ctx.node[key] }
          return 
        }

        const _params: DereferenceParams = { 
          refNodes: [ ...params.refNodes, { 
            ref: normalized,
            pointer: buildPointer([ ...params.path, ...path ]),
            sibling: !ignoreSibling && !!Object.keys(sibling).length ? ctx.node[key] : undefined 
          }],
          basePath: resolvedPointer.filePath,
          path: [ ...params.path, ...path ]
        }
  
        // dereference resolved value and save to cache
        data = await clone(resolvedPointer.value, _params, hook)
        cache.set(normalized, data)
      }
      ctx.node[key] = (!isObject(data) || ignoreSibling) ? data : mergeValues(data, ctx.node[key])  

      enableCircular && circularHook()
    }

    return { value: ignoreSibling ? null : sibling, params, exitHook: refExitHook }
  }

  return clone(base, _params, hook)
}
