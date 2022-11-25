export const validURL = (str: any) => {
  var pattern = new RegExp('^(https?:\\/\\/)'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
  return !!pattern.test(str)
}

export type JsonType = "OpenApi3" | "OpenApi2" | "AsyncApi2" | "JsonSchema"

export const calcJsonType = (data: any): JsonType => {
  if (typeof data !== "object" || !data) { return "JsonSchema"}

  if (/3.+/.test(data?.openapi || "")) return "OpenApi3"
  if (/2.+/.test(data?.swagger || "")) return "OpenApi2"
  if (/2.+/.test(data?.asyncapi || "")) return "AsyncApi2"
  return "JsonSchema"
}

export const relativePath = (path: string, basePath?: string) => {
  if (!basePath) {
    return normalize(path)
  } else if (!path) {
    return normalize(basePath)
  } else {
    const base = basePath.split("/")
    base[base.length - 1] = path
    return normalize(base.join("/"))
  }
}

export const filename = (str: string) => {
  const name = str.split("/").pop() || ""
  return name?.replace(new RegExp(".(json|yaml|yml)$", "gi"), "")
}

export const isJsonSchema = (value: any): boolean => {
  return isBasicJsonSchema(value) || Array.isArray(value.anyOf) || Array.isArray(value.oneOf) || Array.isArray(value.allOf)
}

export const isBasicJsonSchema = (value: any): boolean => {
  return typeof value === "object" && (["object", "array", "string", "number", "boolean", "integer", "null"].includes(value.type))
}

export const parsePath = (path: string): string[] => {
  const [_, ...pathArr] = path.split("/").map((i) => i.replace(new RegExp("~1", "g"), "/"))
  return pathArr
}

export const buildPath = (path: string[]): string => {
  return "/" + path.map((i) => String(i).replace(new RegExp("/", "g"), "~1")).join("/")
}

export const mergeValues = (value: any, patch: any) => {
  if (Array.isArray(value)) {
    return Array.isArray(patch) ? value.push(...patch) : value
  } else if (typeof value === "object" && typeof patch === "object" && patch && value) {
    const result = { ...value }
    for(const key of Reflect.ownKeys(patch)) {
      result[key] = mergeValues(result[key], patch[key])
    }
    return result
  } else {
    return patch
  }
}

export const getValueByPath = (obj: any, path: string[]) => {
  let value = obj
  for (const key of path) {
    value = Array.isArray(value) ? value[+key] : value[key]
    if (value === undefined) {
      break
    }
  }
  return value
}

export const setValueByPath = (obj: any, path: string[], value: any, i = 0) => {
  if (i >= path.length) { return }
  
  const key = path[i]
  if (typeof obj[key] !== "object") {
    obj[key] = {}
  }

  if (i === path.length - 1) {
    obj[key] = value
  } else {
    setValueByPath(obj[key], path, value, i + 1)
  }
}

/* eslint-disable max-depth, max-statements, complexity, max-lines-per-function */
const SLASH = 47
const DOT = 46

// this function is directly from node source
const posixNormalize = (path: string, allowAboveRoot: boolean) => {
  let res = ''
  let lastSegmentLength = 0
  let lastSlash = -1
  let dots = 0
  let code

  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i)
    } else if (code === SLASH) {
      break
    } else {
      code = SLASH
    }
    if (code === SLASH) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(res.length - 1) !== DOT ||
          res.charCodeAt(res.length - 2) !== DOT
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf('/')
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = ''
                lastSegmentLength = 0
              } else {
                res = res.slice(0, lastSlashIndex)
                lastSegmentLength = res.length - 1 - res.lastIndexOf('/')
              }
              lastSlash = i
              dots = 0
              continue
            }
          } else if (res.length === 2 || res.length === 1) {
            res = ''
            lastSegmentLength = 0
            lastSlash = i
            dots = 0
            continue
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) {
            res += '/..'
          } else {
            res = '..'
          }
          lastSegmentLength = 2
        }
      } else {
        if (res.length > 0) {
          res += '/' + path.slice(lastSlash + 1, i)
        } else {
          res = path.slice(lastSlash + 1, i)
        }
        lastSegmentLength = i - lastSlash - 1
      }
      lastSlash = i
      dots = 0
    } else if (code === DOT && dots !== -1) {
      ++dots
    } else {
      dots = -1
    }
  }

  return res
}

export const normalize = (p: string) => {
  let path = p
  if (path.length === 0) {
    return '.'
  }

  const isAbsolute = path.charCodeAt(0) === SLASH
  const trailingSeparator = path.charCodeAt(path.length - 1) === SLASH

  try {
    path = decodeURIComponent(path)
  } finally {
    path = posixNormalize(path, !isAbsolute)
  }

  if (path.length === 0 && !isAbsolute) {
    path = '.'
  }
  if (path.length > 0 && trailingSeparator) {
    path += '/'
  }
  if (isAbsolute) {
    return '/' + path
  }

  return path
}