import { isArray, isObject, type JsonPath } from "json-crawl"

import {
  encodeTokens,
  type ParsedRef,
  parseTokens,
  relativePath,
  resolveDocumentId,
  splitRef,
} from "./ref"
import type { JsonType } from "./types"

export { relativePath }

export const UNSAFE_PATH_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
])

export const isUnsafeKey = (key: unknown): boolean =>
  typeof key === "string" && UNSAFE_PATH_KEYS.has(key)

/**
 * The property key a path segment addresses, coerced once: a non-string segment (e.g. `["__proto__"]`)
 * is converted the way a property access would convert it, so the safety check sees the real key.
 */
const toPropertyKey = (segment: unknown): string | number =>
  typeof segment === "number" ? segment : String(segment)

/** Writes an own data property: a `__proto__` key stays data instead of replacing the prototype. */
export const setOwn = (
  obj: Record<string | number, unknown>,
  key: string | number,
  value: unknown,
): void => {
  if (key === "__proto__") {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  } else {
    obj[key] = value
  }
}

const pathMask = {
  escapedSlash: /~1/g,
  escapedTilde: /~0/g,
}

export class MapArray<K, V> extends Map<K, Array<V>> {
  public add(key: K, value: V): this {
    const arr = this.get(key)
    if (arr) {
      arr.push(value)
    } else {
      this.set(key, [value])
    }
    return this
  }
}

export const validURL = (str: string) => {
  var pattern = new RegExp(
    "^(https?:\\/\\/)" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i",
  ) // fragment locator
  return !!pattern.test(str)
}

export const calcJsonType = (data: Record<string, unknown>): JsonType => {
  if (typeof data !== "object" || !data) {
    return "unknown"
  }

  if (/3.+/.test((data?.openapi as string) || "")) return "OpenApi3"
  if (/2.+/.test((data?.swagger as string) || "")) return "OpenApi2"
  if (/3.+/.test((data?.asyncapi as string) || "")) return "AsyncApi3"
  if (/2.+/.test((data?.asyncapi as string) || "")) return "AsyncApi2"
  if (isJsonSchema(data)) return "JsonSchema"
  return "unknown"
}

/**
 * Parses a `$ref` string against the id of the document it appears in.
 * `filePath` is the canonical document id, `pointer` the fragment as written,
 * `normalized` the canonical reference string and `tokens` the decoded RFC 6901
 * tokens (`undefined` when the fragment is not a valid JSON pointer).
 */
export const parseRef = ($ref: string, basePath = ""): ParsedRef => {
  const [sourcePath, pointer] = splitRef($ref)

  const filePath = resolveDocumentId(sourcePath, basePath)
  const normalized = createRef(filePath, pointer)
  const tokens = parseTokens(pointer)

  return tokens
    ? { filePath, pointer, normalized, tokens }
    : { filePath, pointer, normalized }
}

export const createRef = (basePath?: string, pointer?: string): string => {
  if (!basePath) {
    return !pointer ? "#" : `#${pointer}`
  } else {
    return `${basePath}${!pointer ? "" : `#${pointer}`}`
  }
}

export const filename = (str: string) => {
  const name = str.split("/").pop() || ""
  return name?.replace(/.(json|yaml|yml)$/gi, "")
}

export const isJsonSchema = (value: Record<string, unknown>): boolean => {
  return (
    isBasicJsonSchema(value) ||
    Array.isArray(value.anyOf) ||
    Array.isArray(value.oneOf) ||
    Array.isArray(value.allOf)
  )
}

export const isBasicJsonSchema = (value: Record<string, unknown>): boolean => {
  return (
    typeof value === "object" &&
    value !== null &&
    ("type" in value ||
      "definitions" in value ||
      "properties" in value ||
      "$schema" in value ||
      "$defs" in value)
  )
}

/** Draft 2019-09 / 2020-12 documents (by `$schema` or an existing `$defs`) use `/$defs`. */
export const isModernJsonSchema = (value: unknown): boolean => {
  if (!isObject(value) || Array.isArray(value)) {
    return false
  }
  if (Object.hasOwn(value, "$defs")) {
    return true
  }
  const schema = value.$schema
  return (
    typeof schema === "string" &&
    /json-schema\.org\/draft\/(2019-09|2020-12)\//.test(schema)
  )
}

/**
 * RFC 6901 pointer → tokens (percent-decoding first, then `~1`/`~0`).
 * A fragment without a leading `/` is parsed leniently (first segment dropped) to keep
 * the historical behaviour of this utility; use `parseRef(...).tokens` for strict parsing.
 */
export const parsePointer = (pointer: string): string[] => {
  const strict = parseTokens(pointer)
  if (strict) {
    return strict
  }
  return pointer
    .split("/")
    .slice(1)
    .map((i) => {
      let token = i
      try {
        token = decodeURIComponent(token)
      } catch {
        // keep the raw token
      }
      return token
        .replace(pathMask.escapedSlash, "/")
        .replace(pathMask.escapedTilde, "~")
    })
}

export const buildRef = (path: JsonPath, fileName = ""): string => {
  if (!path.length) {
    return fileName || "#"
  }
  return `${fileName}#${buildPointer(path)}`
}

export const buildPointer = (path: JsonPath): string => encodeTokens(path)

export const mergeValues = (value: unknown, patch: unknown) => {
  if (isArray(value) && Array.isArray(patch)) {
    return isArray(patch) ? [...value, ...patch] : [...value]
  } else if (isObject(value) && isObject(patch)) {
    const result = { ...value }
    for (const key of Object.keys(patch)) {
      setOwn(
        result,
        key,
        mergeValues(
          Object.hasOwn(result, key) ? result[key] : undefined,
          patch[key],
        ),
      )
    }
    return result
  } else {
    return patch
  }
}

export const getValueByPath = (obj: object, path: JsonPath) => {
  let value = obj
  for (const segment of path) {
    const key = toPropertyKey(segment)
    if (isUnsafeKey(key)) {
      return undefined
    }
    if (Array.isArray(value)) {
      const index = Number(key)
      if (Number.isNaN(index)) {
        return undefined
      }
      value = value[index]
    } else if (isObject(value) && Object.hasOwn(value, key)) {
      value = value[key]
    } else {
      return undefined
    }
    if (value === undefined) {
      break
    }
  }
  return value
}

export const setValueByPath = (
  obj: Record<string | number, unknown>,
  path: JsonPath,
  value: unknown,
  i = 0,
) => {
  if (i >= path.length) {
    return
  }

  const key = toPropertyKey(path[i])
  if (isUnsafeKey(key)) {
    return
  }
  if (i === path.length - 1) {
    setOwn(obj, key, value)
  } else {
    const child = Object.hasOwn(obj, key) ? obj[key] : undefined
    if (typeof child !== "object" || child === null) {
      setOwn(obj, key, {})
    }
    setValueByPath(
      obj[key] as Record<string | number, unknown>,
      path,
      value,
      i + 1,
    )
  }
}
