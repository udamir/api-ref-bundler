import { isObject } from "json-crawl"
import type { SourceMap } from "./errors"
import type { ReferenceGraph, Site, Target } from "./graph"
import { toKey } from "./ref"
import type { DefinitionPointer } from "./types"
import { buildPointer, filename, isUnsafeKey, parsePointer } from "./utils"

export interface DefinitionNamingTarget {
  document: string
  tokens: string[]
  node: unknown
}

export interface PlanOptions {
  container?: DefinitionPointer // forces the container for every hoisted target
  naming?: (target: DefinitionNamingTarget) => string
}

export interface Slot {
  target: Target
  path: string[] // output path of the definition (container + name)
}

export interface BundlePlan {
  /** Output location of a target (root-relative tokens), when it has one. */
  location(target: Target): string[] | undefined
  /** Output location of any source location that is structurally present in the output. */
  locateRef(document: string, tokens: string[]): string[] | undefined
  /** Site at which the target's content is emitted (alias slots and inlined targets). */
  contentSite: Map<Site, Target>
  /** Definitions appended to the root after it is emitted, in deterministic order. */
  slots: Slot[]
  sourceMap: SourceMap
}

const startsWith = (tokens: string[], prefix: string[]): boolean => {
  if (tokens.length < prefix.length) {
    return false
  }
  for (let i = 0; i < prefix.length; i++) {
    if (tokens[i] !== prefix[i]) {
      return false
    }
  }
  return true
}

const defaultName = (target: Target): string => {
  const node = target.node
  if (isObject(node) && !Array.isArray(node)) {
    if (typeof node.$id === "string" && node.$id) {
      return node.$id
    }
    if (typeof node.id === "string" && node.id) {
      return node.id
    }
  }
  return target.tokens.length
    ? target.tokens[target.tokens.length - 1]
    : filename(target.document)
}

const compareSlots = (a: Target, b: Target): number => {
  if (a.wave !== b.wave) {
    return a.wave - b.wave
  }
  if (a.document !== b.document) {
    return a.document < b.document ? -1 : 1
  }
  const pa = buildPointer(a.tokens)
  const pb = buildPointer(b.tokens)
  return pa < pb ? -1 : pa > pb ? 1 : 0
}

/**
 * Phase 2a: deterministic slot assignment.
 *
 * 1. targets living in the root document keep their location;
 * 2. a pure-alias site located directly in a container (`definitions.X: { $ref }`) becomes the slot of its target;
 *    targets referenced only from locations without a container are inlined at their first site;
 * 3. remaining targets with a container get a slot named `$id` → `id` → filename / last token,
 *    de-duplicated with a counter map, in (wave, document, pointer) order; a target whose ancestor
 *    gets a slot is addressed through that slot instead;
 * 4. sub-pointer targets are addressed through the located ancestor (alias chains were collapsed by the graph).
 */
export const planBundle = (
  graph: ReferenceGraph,
  options: PlanOptions = {},
): BundlePlan => {
  const { rootDocument, rootTokens, targets, sites } = graph
  const locations = new Map<Target, string[]>()
  const contentSite = new Map<Site, Target>()
  const slots: Slot[] = []
  const sourceMap: SourceMap = new Map()

  const containerTokensOf = (site: Site): string[] | undefined => {
    const container = options.container ?? site.container
    if (!container) {
      return undefined
    }
    const tokens = parsePointer(container)
    return tokens.some(isUnsafeKey) ? undefined : tokens
  }

  const isRootInternal = (target: Target): boolean =>
    target.canonical &&
    target.document === rootDocument &&
    startsWith(target.tokens, rootTokens)

  /** Nearest proper ancestor target (same document) satisfying `accept`. */
  const ancestorOf = (
    target: Target,
    accept: (ancestor: Target) => boolean,
  ): Target | undefined => {
    if (!target.canonical) {
      return undefined
    }
    for (let k = target.tokens.length - 1; k >= 0; k--) {
      const ancestor = targets.get(
        toKey(target.document, target.tokens.slice(0, k)),
      )
      if (ancestor && accept(ancestor)) {
        return ancestor
      }
    }
    return undefined
  }

  const ownerLocation = (site: Site): string[] | undefined =>
    site.owner ? locations.get(site.owner) : []

  const siteLocation = (site: Site): string[] | undefined => {
    const owner = ownerLocation(site)
    return owner ? [...owner, ...site.tokens] : undefined
  }

  const record = (target: Target, location: string[], site?: Site) => {
    locations.set(target, location)
    if (site) {
      contentSite.set(site, target)
    }
    sourceMap.set(`#${buildPointer(location)}`, {
      document: target.document,
      tokens: target.tokens,
    })
  }

  // 1. root-internal targets
  for (const target of targets.values()) {
    if (isRootInternal(target)) {
      locations.set(target, target.tokens.slice(rootTokens.length))
    }
  }

  const aliasNames = new Map<string, Set<string>>() // container pointer → names taken by alias slots
  const takeAliasName = (container: string[], name: string) => {
    const key = buildPointer(container)
    let names = aliasNames.get(key)
    if (!names) {
      names = new Set()
      aliasNames.set(key, names)
    }
    names.add(name)
  }

  /** The written pointer addresses a node of the root output structurally: emitted as written, never hosts content. */
  const isWrittenInternal = (site: Site): boolean =>
    site.immediate !== undefined &&
    site.immediate.document === rootDocument &&
    startsWith(site.immediate.tokens, rootTokens)

  const isAliasSlotSite = (site: Site, container: string[]): boolean => {
    if (site.kind !== "ref" || site.siblings) {
      return false
    }
    const location = siteLocation(site)
    return (
      location !== undefined &&
      location.length === container.length + 1 &&
      startsWith(location, container) &&
      !isUnsafeKey(location[container.length])
    )
  }

  // 2. alias slots and inlined targets, in discovery order: the first site decides whether a
  //    target is inlined (no container) or needs a slot; alias slots beat generated names
  const slotNeeded = new Set<Target>()
  const locateAtSites = (): boolean => {
    let progress = false
    for (const site of sites) {
      const target = site.target
      if (
        !target ||
        site.error ||
        site.kind !== "ref" ||
        typeof target.node === "string" || // text targets are always inlined as strings
        isWrittenInternal(site) // the content is placed by the site at the addressed location
      ) {
        continue
      }
      const container = containerTokensOf(site)
      if (container) {
        if (!locations.has(target) && isAliasSlotSite(site, container)) {
          const location = siteLocation(site) as string[]
          record(target, location, site)
          takeAliasName(container, location[location.length - 1])
          progress = true
        } else {
          slotNeeded.add(target)
        }
        continue
      }
      if (locations.has(target) || slotNeeded.has(target)) {
        continue // already placed, or an earlier site hoists it
      }
      if (
        ancestorOf(
          target,
          (ancestor) => locations.has(ancestor) || slotNeeded.has(ancestor),
        )
      ) {
        continue // addressed through the ancestor
      }
      const location = siteLocation(site)
      if (location) {
        record(target, location, site)
        progress = true
      }
    }
    return progress
  }
  locateAtSites()

  // 3. slots for the remaining targets with a container
  const candidates = new Map<Target, string[]>()
  for (const target of targets.values()) {
    if (locations.has(target) || typeof target.node === "string") {
      continue
    }
    for (const site of target.sites) {
      const container = containerTokensOf(site)
      if (container) {
        candidates.set(target, container)
        break
      }
    }
  }
  const sorted = [...candidates.keys()].sort(compareSlots)
  const occupied = new Map<string, Set<string>>()
  const counters = new Map<string, number>()
  const occupiedIn = (container: string[]): Set<string> => {
    const key = buildPointer(container)
    let names = occupied.get(key)
    if (!names) {
      names = new Set(aliasNames.get(key))
      const node = graph.resolve(rootDocument, [...rootTokens, ...container])
      if (
        node.kind === "found" &&
        isObject(node.value) &&
        !Array.isArray(node.value)
      ) {
        for (const name of Object.keys(node.value)) {
          names.add(name)
        }
      }
      occupied.set(key, names)
    }
    return names
  }
  const uniqueName = (container: string[], base: string): string => {
    const names = occupiedIn(container)
    const counterKey = `${buildPointer(container)}#${base}`
    let n = counters.get(counterKey) ?? 0
    let name = base
    while (isUnsafeKey(name) || names.has(name)) {
      n++
      name = `${base}${n}`
    }
    counters.set(counterKey, n)
    names.add(name)
    return name
  }
  for (const target of sorted) {
    if (
      ancestorOf(
        target,
        (ancestor) => locations.has(ancestor) || candidates.has(ancestor),
      )
    ) {
      continue // addressed through the ancestor's slot
    }
    const container = candidates.get(target) as string[]
    const base = options.naming
      ? options.naming({
          document: target.document,
          tokens: target.tokens,
          node: target.node,
        })
      : defaultName(target)
    const path = [...container, uniqueName(container, String(base))]
    record(target, path)
    slots.push({ target, path })
  }

  // 4. inlined targets inside slots (owners located only now)
  while (locateAtSites()) {
    // repeat until owner chains are exhausted
  }

  const location = (target: Target): string[] | undefined => {
    const known = locations.get(target)
    if (known) {
      return known
    }
    const ancestor = ancestorOf(target, (candidate) => locations.has(candidate))
    if (!ancestor) {
      return undefined
    }
    const base = locations.get(ancestor) as string[]
    const derived = [...base, ...target.tokens.slice(ancestor.tokens.length)]
    locations.set(target, derived)
    return derived
  }

  const locateRef = (
    document: string,
    tokens: string[],
  ): string[] | undefined => {
    if (document === rootDocument && startsWith(tokens, rootTokens)) {
      return tokens.slice(rootTokens.length)
    }
    for (let k = tokens.length; k >= 0; k--) {
      const target = targets.get(toKey(document, tokens.slice(0, k)))
      if (target) {
        const base = location(target)
        if (base) {
          return [...base, ...tokens.slice(k)]
        }
        if (target.canonical) {
          break
        }
      }
    }
    return undefined
  }

  return { location, locateRef, contentSite, slots, sourceMap }
}
