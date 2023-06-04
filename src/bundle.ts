import { 
  buildPointer, createRef, calcJsonType, filename, getValueByPath,
  mergeValues, parseRef, setValueByPath, isObject, getRefMapRule
} from "./utils"
import { clone, CloneHook, CrawlContext } from "./crawler"
import { RefResolver, Resolver } from "./resolver"
import { DereferenceState } from "./dereference"
import { JsonType, ObjPath } from "./types"
import { normalize } from "./normalize"
import { refMapRules } from "./rules"

export interface BundleState extends DereferenceState {
  defPrefix?: string
  path: ObjPath                     // path in current file
}

export interface BundleOptions {
  ignoreSibling?: boolean           // ignore $ref sibling content
  hooks?: {
    onError?: (message: string, ctx: CrawlContext<BundleState>) => void // error hook
    onRef?: (ref: string, ctx: CrawlContext<BundleState>) => void       // ref hook
    onCrawl?: (value: any, ctx: CrawlContext<BundleState>) => void      // node crawl hook
    onExit?: (value: any, ctx: CrawlContext<BundleState>) => void       // node crawl exit hook
  }
}

export const bundle = async (baseFile: string, resolver: Resolver, options: BundleOptions = {}) => {
  const refResolver = new RefResolver(baseFile, resolver)

  const base = await refResolver.base()
  const type = calcJsonType(base)

  const basePath = createRef(normalize(baseFile))

  const rootDefs: any = {}
  const defLinks = new Map<string, string>()
  const newDefs = new Map<string, boolean>()
  const { hooks, ignoreSibling } = options

  const hook: CloneHook<BundleState> = async (value, ctx) => {
    hooks?.onCrawl && hooks?.onCrawl(value, ctx)

    const { path, state } = ctx
    const key = path.length ? ctx.key : "#"
    const fullPath = [ ...state.path, ...path ]
    const currentPointer = buildPointer(fullPath)

    // console.debug(state.baseFile, currentPointer)

    // if current definition is alrady added to definitions then skip
    if (newDefs.has(currentPointer)) {
      if (newDefs.get(currentPointer)) { return null }
      newDefs.set(currentPointer, true)
    }
    
    if (!isObject(value) || !value.hasOwnProperty("$ref") || typeof value.$ref !== "string") {
      return { value, state }
    }

    const exitHook = () => {
      hooks?.onExit && hooks.onExit(ctx.state.node[key], ctx)
    }

    const { $ref, ...rest } = value
    const { filePath, pointer, normalized } = parseRef($ref, state.baseFile)

    hooks?.onRef && hooks.onRef(normalized, ctx)

    if (filePath === basePath) {
      // resolve internal reference
      return { value: { $ref: createRef("", pointer), ...rest }, state, exitHook }
    } else if (defLinks.has(normalized)) {
      // check if ref already added to root definitions
      return { value: { $ref: defLinks.get(normalized), ...rest }, state, exitHook }
    } else if (defLinks.has(filePath) && !/\/(definitions|defs)/g.test(pointer)) {
      // check if filepath already added to root definitions
      return { value: { $ref: defLinks.get(filePath) + pointer, ...rest }, state, exitHook }
    } else {
      // resolve source
      const resolvedPointer = await refResolver.resolvePointer(pointer, filePath)

      if (!resolvedPointer.value) {
        hooks?.onError && hooks.onError(`Cannot resolve: ${normalized}`, ctx)

        return { value: { $ref: normalized }, state, exitHook }
      }

      // reference to text file
      if (typeof resolvedPointer.value === "string") {
        return { value: resolvedPointer.value, state: state, exitHook }
      }

      const defPath = getDefinitionPath(type, fullPath)
      if (defPath) {
        const { $defs, definitions, ...jsonSchema } = resolvedPointer.value

        const pathDefs = getValueByPath(rootDefs, defPath) || {}

        // try to find definition in new definitions
        let defName = pathDefs && findDefinitionName(pathDefs, normalized, basePath)
        if (!defName) {
          const resolvedDefs = await refResolver.resolvePointerRef(buildPointer(defPath), basePath)
          // try to find definition in root definitions
          defName = findDefinitionName(resolvedDefs.value || {}, normalized, resolvedDefs.filePath)
          if (!defName) {
            // generate new definition name
            const name = jsonSchema.$id || jsonSchema.id || filename(pointer || resolvedPointer.filePath)
            defName = uniqueDefinitionName({ ...resolvedDefs.value, ...pathDefs }, name)
          }
        }

        // double check if ref already added to root definitions
        if (defLinks.has(normalized)) {
          return { value: { $ref: defLinks.get(normalized), ...rest }, state, exitHook }
        }

        defPath.push(defName)
        const defPointer = buildPointer(defPath)

        defLinks.set(normalized, "#" + defPointer)
        newDefs.set(defPointer, false)

        const _ref = { 
          ref: createRef(filePath, pointer),
          pointer: defPointer
        }

        const _data = await clone<BundleState>(jsonSchema, hook, {
          baseFile: resolvedPointer.filePath,
          path: defPath,
          refNodes: [ ...state.refNodes, _ref ],
          defPrefix: defName + "-"
        })

        if (isObject(_data)) {
          setValueByPath(rootDefs, defPath, _data)
        }
        if (getValueByPath(rootDefs, defPath)) {
          if (defPointer === currentPointer) {
            return null
          }
  
          return { value: { $ref: "#" + defPointer, ...rest }, state, exitHook }
        }
      }

      defLinks.set(normalized, "#" + currentPointer)
      
      const _ref = { 
        ref: createRef(filePath, pointer),
        pointer: buildPointer(fullPath)
      }
      
      const data = await clone(resolvedPointer.value, hook, {
        refNodes: [ ...state.refNodes, _ref ],
        baseFile: resolvedPointer.filePath,
        path: fullPath
      })

      const _exitHook = () => {
        ctx.state.node[key] = (!isObject(data) || ignoreSibling) ? data : mergeValues(data, ctx.state.node[key])
        exitHook()
      }
       
      return { value: ignoreSibling ? {} : rest, state, exitHook: _exitHook }
    }
  }

  const result = await clone(base, hook, {
    refNodes: [ { ref: basePath, pointer: "" }],
    baseFile: basePath, 
    path: [],
  })
  return mergeValues(result, rootDefs)
}

const getDefinitionPath = (apiType: JsonType, path: ObjPath): string[] | undefined => {
  const definitionPath = getRefMapRule(path, refMapRules[apiType])
  switch (apiType) {
    case "OpenApi3":
      return definitionPath ? definitionPath.split("/").slice(1, 3) : undefined
    case "OpenApi2":
      return definitionPath ? definitionPath.split("/").slice(1, 2) : undefined
    case "AsyncApi2":
      return definitionPath ? definitionPath.split("/").slice(1, 3) : undefined
    case "JsonSchema":
      return definitionPath ? ["definitions"] : undefined
    default:
      return
  }
}

const uniqueDefinitionName = (defs: any, name: string, i = 0): string => {
  const _name = i ? name + i : name
  if (!defs || !defs[_name]) { return _name }

  return uniqueDefinitionName(defs, name, i + 1)
}

const findDefinitionName = (defs: any, ref: string, basePath: string) => {
  for (const key of Object.keys(defs)) {
    const def = defs[key]
    if (!def.$ref || Object.keys(def).length > 1 ) { continue }
    if (ref === parseRef(def.$ref, basePath).normalized) { return key }
  }
  return 
}
