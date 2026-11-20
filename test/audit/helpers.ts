import { expect } from "vite-plus/test"
import type { Resolver } from "../../src"
import { getValueByPath, parsePointer } from "../../src/utils"

export type Files = Record<string, unknown>

/**
 * In-memory resolver. Records every path it is asked for and throws
 * (like fs.readFile would) for unknown paths.
 */
export const memResolver = (files: Files) => {
  const calls: string[] = []
  const resolver: Resolver = async (sourcePath: string) => {
    calls.push(sourcePath)
    if (!Object.hasOwn(files, sourcePath)) {
      throw new Error(`File not found: ${sourcePath}`)
    }
    return files[sourcePath] as object
  }
  return { resolver, calls }
}

export interface FoundRef {
  path: string
  ref: unknown
}

/** Collects every `$ref` member in a document; safe for cyclic structures. */
export const collectRefs = (doc: unknown): FoundRef[] => {
  const out: FoundRef[] = []
  const seen = new Set<unknown>()
  const walk = (node: unknown, path: string) => {
    if (typeof node !== "object" || node === null || seen.has(node)) {
      return
    }
    seen.add(node)
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${path}/${i}`)
      }
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref") {
        out.push({ path, ref: value })
      } else {
        walk(value, `${path}/${key}`)
      }
    }
  }
  walk(doc, "")
  return out
}

/** Resolves an internal `#/...` reference against a document. */
export const resolveInternal = (doc: unknown, ref: string) => {
  if (ref === "#") {
    return doc
  }
  return getValueByPath(doc as object, parsePointer(ref.slice(1)))
}

/** Every `$ref` must be internal and point to an existing location. */
export const expectAllRefsInternalAndResolvable = (doc: unknown) => {
  for (const { path, ref } of collectRefs(doc)) {
    expect(typeof ref, `$ref at ${path} must be a string`).toBe("string")
    expect(ref as string, `$ref at ${path} must be internal`).toMatch(/^#/)
    expect(
      resolveInternal(doc, ref as string),
      `$ref at ${path} -> ${String(ref)} must point to an existing node`,
    ).not.toBeUndefined()
  }
}

/** Serialises and parses again; throws on JS cycles. */
export const roundTrip = <T>(doc: T): T => JSON.parse(JSON.stringify(doc))

export const deepFreeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) {
      deepFreeze(v)
    }
    Object.freeze(value)
  }
  return value
}

export const isPolluted = (key: string) =>
  Object.hasOwn(Object.prototype, key) || key in ({} as any)

export const measure = async (fn: () => Promise<unknown>) => {
  const start = performance.now()
  const result = await fn()
  return { ms: performance.now() - start, result }
}
