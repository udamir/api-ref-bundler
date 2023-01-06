import { buildPath, buildRef, mergeValues, ObjPath, parsePath, parseRef } from "./utils"
import { CrawlContext, CrawlHook, isObject, transform } from "./crawler"
import { RefResolver, Resolver } from "./resolver"

export interface Ref {
  ref: string
  pointer: string
}

export interface DereferenceParams {
  refs: Ref[]
  basePath: string
  path: ObjPath
  sibling?: any
}

interface DereferenceOptions {
  ignoreSibling?: boolean
  hooks?: {
    onError: (message: string, ctx: CrawlContext<DereferenceParams>) => void
    onRef: (ref: string, ctx: CrawlContext<DereferenceParams>) => void
    onCrawl: (value: any, ctx: CrawlContext<DereferenceParams>) => void
    onCycle: (ref: string, ctx: CrawlContext<DereferenceParams>) => void
  }
}

export const dereference = async (basePath: string, resolver: Resolver, options?: DereferenceOptions) => {
  const baseRef = parseRef(basePath)

  const refResolver = new RefResolver(baseRef.filePath, resolver)

  const _params: DereferenceParams = { 
    refs: [{ ref: baseRef.filePath, pointer: "#" }],
    basePath: baseRef.filePath, 
    path: parsePath(baseRef.pointer)
  }

  const base = await refResolver.base(baseRef.pointer)
  const cache = new Map<string, any>()

  const hook: CrawlHook<DereferenceParams> = async (value, ctx) => {
    options?.hooks?.onCrawl(value, ctx)
    
    const { params, path, key } = ctx

    if (!isObject(value) || !value.hasOwnProperty("$ref")) {
      return { value, params }
    }

    const { $ref, ...sibling } = value
    const { filePath, pointer, normalized } = parseRef($ref, params.basePath)

    options?.hooks?.onRef(normalized, ctx)

    // check circular ref
    const ref = params.refs.find(({ ref }) => normalized === ref)
    if (ref) {
      options?.hooks?.onCycle(ref.pointer, ctx)
      return { value: { $ref: ref.pointer, ...sibling }, params }
    }

    // resolve reference on Exit and merge with sibling
    const exitHook = async (node: any) => {
      const ref = buildRef(filePath, pointer)
      if (cache.has(ref)) {
        node[key] = mergeValues(cache.get(ref), node[key])
      } else {
        const _data = await refResolver.resolveRef(pointer, filePath)

        if (!_data) {
          options?.hooks?.onError(`Cannot resolve: ${normalized}`, ctx)
          node[key] = { $ref: normalized, ...node[key] }
          return 
        }
  
        const _path = [ ...params.path, ...path ]
        const _ref: Ref = { ref, pointer: buildPath(_path, "#") }
        const _params: DereferenceParams = { 
          refs: [ ...params.refs, _ref],
          basePath: filePath,
          path: _path
        }
  
        const data = await transform(_data, _params, hook)
        cache.set(_ref.ref, data)
  
        node[key] = options?.ignoreSibling ? data : mergeValues(data, node[key])
      }
    }

    return { value: options?.ignoreSibling ? null : sibling, params, exitHook }
  }

  return transform(base, _params, hook)
}
