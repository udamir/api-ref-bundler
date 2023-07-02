import { JsonPath, CrawlContext, CloneHook, CloneState, clone, isObject } from "json-crawl"
 
import { 
  buildPointer, createRef, calcJsonType, filename, getValueByPath,
  mergeValues, parseRef, setValueByPath, parsePointer
} from "./utils"
import { RefResolver, Resolver } from "./resolver"
import { DereferenceState } from "./dereference"
import { normalize } from "./normalize"
import { RefMapRules } from "./types"
import { refMapRules } from "./rules"

export interface BundleState extends DereferenceState {
  defPrefix?: string
  path: JsonPath                     // path in current file
}

export type BundleContext = CrawlContext<CloneState<BundleState>, RefMapRules>

export interface BundleOptions {
  ignoreSibling?: boolean           // ignore $ref sibling content
  hooks?: {
    onError?: (message: string, ctx: BundleContext) => void // error hook
    onRef?: (ref: string, ctx: BundleContext) => void       // ref hook
    onCrawl?: (value: any, ctx: BundleContext) => void      // node crawl hook
    onExit?: (value: any, ctx: BundleContext) => void       // node crawl exit hook
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

  const hook: CloneHook<BundleState, RefMapRules> = async (value, ctx) => {
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

      const defPointer = ctx.rules && "#" in ctx.rules ? ctx.rules["#"] : undefined
      if (defPointer) {
        const defPath = parsePointer(defPointer)
    
        const { $defs, definitions, ...jsonSchema } = resolvedPointer.value

        const pathDefs = getValueByPath(rootDefs, defPath) || {}

        // try to find definition in new definitions
        let defName = pathDefs && findDefinitionName(pathDefs, normalized, basePath)
        if (!defName) {
          const resolvedDefs = await refResolver.resolvePointerRef(defPointer, basePath)
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
        const _defPointer = buildPointer(defPath)

        defLinks.set(normalized, "#" + _defPointer)
        newDefs.set(_defPointer, false)

        const _ref = { 
          ref: createRef(filePath, pointer),
          pointer: _defPointer
        }

        const _data = await clone<BundleState, RefMapRules>(jsonSchema, hook, {
          state: {
            baseFile: resolvedPointer.filePath,
            path: defPath,
            refNodes: [ ...state.refNodes, _ref ],
            defPrefix: defName + "-"
          },
          rules: ctx.rules as RefMapRules
        })

        if (isObject(_data)) {
          setValueByPath(rootDefs, defPath, _data)
        }
        if (getValueByPath(rootDefs, defPath)) {
          if (_defPointer === currentPointer) {
            return null
          }
  
          return { value: { $ref: "#" + _defPointer, ...rest }, state, exitHook }
        }
      }

      defLinks.set(normalized, "#" + currentPointer)
      
      const _ref = { 
        ref: createRef(filePath, pointer),
        pointer: buildPointer(fullPath)
      }
      
      const data = await clone(resolvedPointer.value, hook, {
        state: {
          refNodes: [ ...state.refNodes, _ref ],
          baseFile: resolvedPointer.filePath,
          path: fullPath
        },
        rules: ctx.rules as RefMapRules
      })

      const _exitHook = () => {
        ctx.state.node[key] = (!isObject(data) || ignoreSibling) ? data : mergeValues(data, ctx.state.node[key])
        exitHook()
      }
       
      return { value: ignoreSibling ? {} : rest, state, exitHook: _exitHook }
    }
  }

  const result = await clone(base, hook, { 
    state: {
      refNodes: [ { ref: basePath, pointer: "" }],
      baseFile: basePath, 
      path: [],
    },
    rules: refMapRules[calcJsonType(base)]
  })
  return mergeValues(result, rootDefs)
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
