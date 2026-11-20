import { isObject } from "json-crawl"
import { mergeValues, setOwn } from "./utils"

/**
 * How content next to a `$ref` is combined with the referenced value:
 * - `merge`    today's `mergeValues` (siblings override scalars, arrays are concatenated)
 * - `allOf`    `{ allOf: [target, siblings] }` (JSON Schema 2019-09+ / OAS 3.1 conjunction)
 * - `override` only `description` and `summary` are taken from the siblings (OAS 3.0 Reference Object)
 * - `ignore`   siblings are dropped (`ignoreSibling: true`)
 */
export type SiblingStrategy = "merge" | "allOf" | "override" | "ignore"

export const siblingStrategyOf = (options: {
  ignoreSibling?: boolean
  siblingStrategy?: SiblingStrategy
}): SiblingStrategy =>
  options.siblingStrategy ?? (options.ignoreSibling ? "ignore" : "merge")

const OVERRIDE_KEYS = ["description", "summary"]

/** Siblings that take part in the result under the strategy (`null` when none). */
export const selectSiblings = (
  strategy: SiblingStrategy,
  siblings: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!siblings || strategy === "ignore") {
    return null
  }
  if (strategy === "override") {
    let picked: Record<string, unknown> | null = null
    for (const key of OVERRIDE_KEYS) {
      if (Object.hasOwn(siblings, key)) {
        picked = picked ?? {}
        picked[key] = siblings[key]
      }
    }
    return picked
  }
  return siblings
}

/**
 * Applies emitted siblings to an emitted target value. Objects are patched in place so the
 * identity of `target` (used for cycles) is preserved; arrays and primitives ignore siblings.
 */
export const applySiblings = (
  strategy: SiblingStrategy,
  target: unknown,
  siblings: unknown,
): unknown => {
  if (siblings === null || siblings === undefined) {
    return target
  }
  if (strategy === "allOf") {
    return { allOf: [target, siblings] }
  }
  if (!isObject(target) || Array.isArray(target) || !isObject(siblings)) {
    return target
  }
  for (const key of Object.keys(siblings)) {
    setOwn(
      target,
      key,
      mergeValues(
        Object.hasOwn(target, key) ? target[key] : undefined,
        siblings[key],
      ),
    )
  }
  return target
}

/** Reference node shape for emitted `$ref` sites. */
export const refWithSiblings = (
  strategy: SiblingStrategy,
  ref: string,
  siblings: Record<string, unknown> | null,
): Record<string, unknown> => {
  if (!siblings) {
    return { $ref: ref }
  }
  if (strategy === "allOf") {
    return { allOf: [{ $ref: ref }, siblings] }
  }
  return { $ref: ref, ...siblings }
}
