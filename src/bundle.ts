import {
  type CloneHook,
  type CloneState,
  type CrawlContext,
  clone,
  isObject,
  type JsonPath,
} from "json-crawl"
import type { DereferenceState } from "./dereference"
import { normalize } from "./normalize"
import { RefResolver, type Resolver } from "./resolver"
import { refMapRules } from "./rules"
import type { JsonNode, JsonObject, RefMapRules } from "./types"
import {
  buildPointer,
  calcJsonType,
  createRef,
  filename,
  getValueByPath,
  mergeValues,
  parsePointer,
  parseRef,
  setValueByPath,
} from "./utils"

export interface BundleState extends DereferenceState {
  defPrefix?: string
  path: JsonPath // path in current file
}

export type BundleContext = CrawlContext<CloneState<BundleState>, RefMapRules>

export interface BundleOptions {
  ignoreSibling?: boolean // ignore $ref sibling content
  hooks?: {
    onError?: (message: string, ctx: BundleContext) => void // error hook
    onRef?: (ref: string, ctx: BundleContext) => void // ref hook
    onCrawl?: (value: unknown, ctx: BundleContext) => void // node crawl hook
    onExit?: (value: unknown, ctx: BundleContext) => void // node crawl exit hook
  }
  rules?: RefMapRules
}

export const bundle = async (
  baseFile: string,
  resolver: Resolver,
  options: BundleOptions = {},
) => {
  const refResolver = new RefResolver(baseFile, resolver)

  const base = await refResolver.base()

  const basePath = createRef(normalize(baseFile))

  const rootDefs: Record<string, JsonNode> = {}
  const defLinks = new Map<string, string>()
  const newDefs = new Map<string, boolean>()
  const { hooks, ignoreSibling } = options

  const hook: CloneHook<BundleState, RefMapRules> = async (ctx) => {
    const { value, path, state } = ctx
    hooks?.onCrawl?.(value, ctx)

    const key = path.length ? ctx.key : "#"
    const fullPath = [...state.path, ...path]
    const currentPointer = buildPointer(fullPath)

    // console.debug(state.baseFile, currentPointer)

    // if current definition is alrady added to definitions then skip
    if (newDefs.has(currentPointer)) {
      if (newDefs.get(currentPointer)) {
        return { done: true }
      }
      newDefs.set(currentPointer, true)
    }

    if (
      !isObject(value) ||
      !("$ref" in value) ||
      typeof value.$ref !== "string"
    ) {
      return
    }

    const exitHook = () => {
      hooks?.onExit?.(ctx.state.node[key], ctx)
    }

    const { $ref, ...rest } = value
    const { filePath, pointer, normalized } = parseRef($ref, state.baseFile)

    hooks?.onRef?.(normalized, ctx)

    if (filePath === basePath) {
      // resolve internal reference
      return { value: { $ref: createRef("", pointer), ...rest }, exitHook }
    } else if (defLinks.has(normalized)) {
      // check if ref already added to root definitions
      return { value: { $ref: defLinks.get(normalized), ...rest }, exitHook }
    } else if (
      defLinks.has(filePath) &&
      !/\/(definitions|defs)/g.test(pointer)
    ) {
      // check if filepath already added to root definitions
      return {
        value: { $ref: defLinks.get(filePath) + pointer, ...rest },
        exitHook,
      }
    } else {
      // Check for prefix matches to support nested references
      for (const [cachedRef, cachedLocation] of defLinks.entries()) {
        if (normalized.startsWith(`${cachedRef}/`)) {
          const suffix = normalized.substring(cachedRef.length)
          return {
            value: { $ref: cachedLocation + suffix, ...rest },
            exitHook,
          }
        }
      }

      // resolve source
      const resolvedPointer = await refResolver.resolvePointer(
        pointer,
        filePath,
      )

      if (!resolvedPointer.value) {
        hooks?.onError?.(`Cannot resolve: ${normalized}`, ctx)

        return { value: { $ref: normalized }, exitHook }
      }

      // reference to text file
      if (typeof resolvedPointer.value === "string") {
        return { value: resolvedPointer.value, exitHook }
      }

      const defPointer =
        ctx.rules && "#" in ctx.rules ? ctx.rules["#"] : undefined
      if (defPointer) {
        const defPath = parsePointer(defPointer)

        const resolved = resolvedPointer.value as JsonObject
        const { $defs, definitions, ...jsonSchema } = resolved

        const pathDefs =
          (getValueByPath(rootDefs, defPath) as JsonObject | undefined) || {}

        // try to find definition in new definitions
        let defName =
          pathDefs && findDefinitionName(pathDefs, normalized, basePath)
        if (!defName) {
          const resolvedDefs = await refResolver.resolvePointerRef(
            defPointer,
            basePath,
          )
          const resolvedDefsValue =
            (resolvedDefs.value as JsonObject | undefined) || {}
          // try to find definition in root definitions
          defName = findDefinitionName(
            resolvedDefsValue,
            normalized,
            resolvedDefs.filePath,
          )
          if (!defName) {
            // generate new definition name
            const name =
              jsonSchema.$id ||
              jsonSchema.id ||
              filename(pointer || resolvedPointer.filePath)
            defName = uniqueDefinitionName(
              { ...resolvedDefsValue, ...pathDefs },
              name as string,
            )
          }
        }

        // double check if ref already added to root definitions
        if (defLinks.has(normalized)) {
          return {
            value: { $ref: defLinks.get(normalized), ...rest },
            exitHook,
          }
        }

        defPath.push(defName)
        const _defPointer = buildPointer(defPath)

        defLinks.set(normalized, `#${_defPointer}`)
        newDefs.set(_defPointer, false)

        const _ref = {
          ref: createRef(filePath, pointer),
          pointer: _defPointer,
        }

        const _data = await clone<BundleState, RefMapRules>(jsonSchema, hook, {
          state: {
            baseFile: resolvedPointer.filePath,
            path: defPath,
            refNodes: [...state.refNodes, _ref],
            defPrefix: `${defName}-`,
          },
          rules: ctx.rules as RefMapRules,
        })

        if (isObject(_data)) {
          setValueByPath(rootDefs, defPath, _data)
        }
        if (getValueByPath(rootDefs, defPath)) {
          if (_defPointer === currentPointer) {
            return { done: true }
          }

          return { value: { $ref: `#${_defPointer}`, ...rest }, exitHook }
        }
      }

      defLinks.set(normalized, `#${currentPointer}`)

      const _ref = {
        ref: createRef(filePath, pointer),
        pointer: buildPointer(fullPath),
      }

      const data = await clone(resolvedPointer.value, hook, {
        state: {
          refNodes: [...state.refNodes, _ref],
          baseFile: resolvedPointer.filePath,
          path: fullPath,
        },
        rules: ctx.rules,
      })

      const _exitHook = () => {
        ctx.state.node[key] =
          !isObject(data) || ignoreSibling
            ? data
            : mergeValues(data, ctx.state.node[key])
        exitHook()
      }

      return { value: ignoreSibling ? {} : rest, exitHook: _exitHook }
    }
  }

  const result = await clone(base, hook, {
    state: {
      refNodes: [{ ref: basePath, pointer: "" }],
      baseFile: basePath,
      path: [],
    },
    rules: options.rules ?? refMapRules[calcJsonType(base as JsonObject)],
  })
  return mergeValues(result, rootDefs)
}

const uniqueDefinitionName = (
  defs: Record<string, JsonNode | undefined>,
  name: string,
  i = 0,
): string => {
  const _name = i ? name + i : name
  if (!defs?.[_name]) {
    return _name
  }

  return uniqueDefinitionName(defs, name, i + 1)
}

const findDefinitionName = (
  defs: Record<string, JsonNode | undefined>,
  ref: string,
  basePath: string,
) => {
  for (const key of Object.keys(defs)) {
    const def = defs[key]
    if (
      !isObject(def) ||
      !("$ref" in def) ||
      !def.$ref ||
      Object.keys(def).length > 1
    ) {
      continue
    }
    if (ref === parseRef(def.$ref as string, basePath).normalized) {
      return key
    }
  }
  return
}
