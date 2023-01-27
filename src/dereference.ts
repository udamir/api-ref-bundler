import { 
  buildPointer, buildRef, getValueByPath, MapArray, mergeValues, ObjPath, 
  parsePointer, parseRef, setValueByPath
} from "./utils"
import { clone, CrawlContext, CrawlHook, isObject } from "./crawler"
import { RefResolver, Resolver } from "./resolver"

const cycleRef = Symbol("cycleRef")

export interface Ref {
  ref: string
  pointer: string
  sibling?: any
}

export interface DereferenceParams {
  refs: Ref[]
  basePath: string
  path: ObjPath
  sibling?: any
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

  const _params: DereferenceParams = { 
    refs: [{ ref: baseRef.filePath, pointer: "" }],
    basePath: baseRef.filePath, 
    path: parsePointer(baseRef.pointer)
  }

  const base = await refResolver.base(baseRef.pointer)
  const cache = new Map<string, any>()
  const cycleRefs = new MapArray<string, ObjPath>()

  const hook: CrawlHook<DereferenceParams> = async (value, ctx) => {
    hooks?.onCrawl(value, ctx)
    
    const { params, path, key } = ctx

    // console.debug(params.basePath, buildPointer([...params.path, ...ctx.path]))

    const circularHook = () => {
      const refs = cycleRefs.get(buildPointer([...params.path, ...ctx.path]))
      if (refs) {
        for (const ref of refs) {
          const path = ["#", ...ref.slice(ctx.params.path.length)]
          const sibling = getValueByPath(ctx.root, path)
          if (sibling && sibling[cycleRef]) { continue }
          const value =  sibling ? mergeValues(ctx.node[key], sibling) : ctx.node[key]
          value[cycleRef] = buildRef(ctx.params.path)
          setValueByPath(ctx.root, path, value)
        }
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

    // check circular ref
    const ref = params.refs.find((ref, i, refs) => {
      if (normalized === ref.ref) {
        if (!ref.sibling) { return true }
        if (refs[i-1]?.ref === refs[refs.length-1].ref) {
          return true
        }
      }
    })
    if (ref) {
      hooks?.onCycle(ref.pointer, ctx)
      if (enableCircular) {
        cycleRefs.add(ref.pointer, [ ...params.path, ...ctx.path ])
        return { value: (ignoreSibling || ref.sibling) ? null : sibling, params }
      } else {
        return { value: { $ref: "#" + ref.pointer, ...(ignoreSibling || ref.sibling) ? {} : sibling }, params }
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
  
        const _path = [ ...params.path, ...path ]
        const _sibling = !ignoreSibling && !!Object.keys(sibling).length ? ctx.node[key] : undefined
        const _ref: Ref = { ref: normalized, pointer: buildPointer(_path), sibling: _sibling }
        const _params: DereferenceParams = { 
          refs: [ ...params.refs, _ref],
          basePath: resolvedPointer.filePath,
          path: _path
        }
  
        data = await clone(resolvedPointer.value, _params, hook)
        cache.set(_ref.ref, data)
      }
      ctx.node[key] = (!isObject(data) || ignoreSibling) ? data : mergeValues(data, ctx.node[key])  

      enableCircular && circularHook()
    }

    return { value: ignoreSibling ? null : sibling, params, exitHook: refExitHook }
  }

  return clone(base, _params, hook)
}
