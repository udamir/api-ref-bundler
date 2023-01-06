import { 
  buildPath, buildRef, calcJsonType, filename, getValueByPath, isJsonSchema,
  JsonType, mergeValues, normalize, parseRef, setValueByPath,
} from "./utils"
import { CrawlContext, CrawlHook, isObject, transform } from "./crawler"
import { RefResolver, Resolver } from "./resolver"
import { DereferenceParams } from "./dereference"

interface BundleParams extends DereferenceParams {
  defPrefix?: string
}

interface BundleOptions {
  ignoreSibling?: boolean
  hooks?: {
    onError: (message: string, ctx: CrawlContext<BundleParams>) => void
    onRef: (ref: string, ctx: CrawlContext<BundleParams>) => void
    onCrawl: (value: any, ctx: CrawlContext<BundleParams>) => void
  }
}

export const bundle = async (basePath: string, resolver: Resolver, options?: BundleOptions) => {
  const refResolver = new RefResolver(basePath, resolver)

  basePath = buildRef(normalize(basePath))
  const bundleParams: BundleParams = { refs: [ { ref: basePath, pointer: "#" }], basePath, path: ["#"] }
  const base = await refResolver.base()
  const apiType: JsonType = calcJsonType(base)
  const defLinks = new Map<string, string>()
  const newDefs = new Map<string, boolean>()
  const rootDefs: any = {}

  const hook: CrawlHook<BundleParams> = async (value, ctx) => {
    options?.hooks?.onCrawl(value, ctx)

    const { params, path, key } = ctx
    const currentPath = buildPath([ ...params.path, ...path ], "")

    // if current definition is alrady added to definitions then skip
    if (newDefs.has(currentPath)) {
      if (newDefs.get(currentPath)) { return null }
      newDefs.set(currentPath, true)
    }
    
    if (!isObject(value) || !value.hasOwnProperty("$ref")) {
      return { value, params }
    }

    const { $ref, ...rest } = value
    const { filePath, pointer, normalized } = parseRef($ref, params.basePath)

    options?.hooks?.onRef(normalized, ctx)

    if (filePath === basePath) {
      // resolve internal reference
      return { value: { $ref: buildRef("", pointer), ...rest }, params }
    } else {
      // check if ref already added to root definitions
      if (defLinks.has(normalized)) {
        return { value: { $ref: defLinks.get(normalized) }, params }
      }

      // resolve source
      const _value = await refResolver.resolveRef(pointer, filePath)

      if (!_value) {
        options?.hooks?.onError(`Cannot resolve: ${normalized}`, ctx)

        return { value: { $ref: normalized }, params }
      }

      // reference to text file
      if (typeof _value === "string") {
        return { value: _value, params }
      }

      const defPath = getDefinitionPath(apiType, pointer, _value)
      if (defPath) {
        const { $defs, definitions, ...jsonSchema } = _value

        // generate new definition name
        const name = _value.$id || _value.id || filename(pointer || filePath)
        const defs = { ...getValueByPath(base, defPath), ...getValueByPath(rootDefs, defPath) }
        const defName = uniqueDefinitionName(defs, !filePath ? name : name, normalized)
        defPath.push(defName)
        const defPointer = buildPath(defPath, "#")

        defLinks.set(normalized, defPointer)
        newDefs.set(defPointer, false)

        const _ref = { 
          ref: buildRef(filePath, pointer),
          pointer: defPointer
        }

        const _params: BundleParams = { 
          basePath: filePath,
          path: defPath,
          refs: [ ...params.refs, _ref ],
          defPrefix: defName + "-"
        }

        const _data = await transform(jsonSchema, _params, hook)
        setValueByPath(rootDefs, defPath, _data)

        return { value: { $ref: defPointer, ...rest }, params }
      }

      const exitHook = async (node: any) => {
        const _path = [ ...params.path, ...path ]

        const _ref = { 
          ref: buildRef(filePath, pointer),
          pointer: buildPath(_path, "")
        }
        
        const _params: BundleParams = {
          refs: [ ...params.refs, _ref ],
          basePath: filePath,
          path: _path
        }

        const data = await transform(_value, _params, hook)

        node[key] = options?.ignoreSibling ? data : mergeValues(data, node[key])
      }
       
      return { value: options?.ignoreSibling ? {} : rest, params, exitHook }
    }
  }

  const result = await transform(base, bundleParams, hook)

  return mergeValues(result, rootDefs)
}

const getDefinitionPath = (apiType: JsonType, ref: string, value: any): string[] | undefined => {
  switch (apiType) {
    case "OpenApi3":
      if (/^\/components\/(schemas|responses|parameters|examples|requestBodies|headers|securitySchemes|links|callbacks)\/+/.test(ref)) {
        return ref.split("/").slice(1, 3)
      } else {
        return isJsonSchema(value) ? ["components", "schemas"] : undefined
      }
    case "OpenApi2":
      if (/^\/(definitions|parameters|responses|securityDefinitions)/.test(ref)) {
        return ref.split("/").slice(1, 2)
      } else {
        return isJsonSchema(value) ? ["definitions"] : undefined
      }
    case "AsyncApi2":
      if (/^\/components\/(schemas|servers|serverVariables|channels|messages|securitySchemes|parameters|correlationIds|operationTraits|messageTraits|serverBindings|channelBindings|operationBindings|messageBindings)\/+/.test(ref)) {
        return ref.split("/").slice(1, 3)
      } else {
        return isJsonSchema(value) ? ["components", "schemas"] : undefined
      }
    case "JsonSchema":
      return isJsonSchema(value) ? ["definitions"] : undefined
    default:
      return
  }
}

const uniqueDefinitionName = (defs: any, name: string, ref: string, i = 0): string => {
  const _name = i ? name + i : name
  if (!defs || !defs[_name]) { return _name }

  // replace existing definition with ref to same name
  if (defs[_name]) {
    const { $ref, ...rest } = defs[_name]
    if ($ref && !Object.keys(rest).length && ref === parseRef($ref).normalized) {
      return _name
    }
  }

  return uniqueDefinitionName(defs, name, ref, i + 1)
}
