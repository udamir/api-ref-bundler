import { isObject } from "json-crawl"
import { walkTree } from "./crawl"
import type { RefErrorDetail } from "./errors"
import { type ParsedRef, toKey } from "./ref"
import type { DocumentSource } from "./resolver"
import { walkTokens } from "./resolver"
import type { DefinitionPointer, RefMapRule, RefMapRules } from "./types"
import { mergeValues, parseRef, setOwn } from "./utils"

/** A location in a loaded document. */
export interface SourceRef {
  document: string
  tokens: string[]
}

/** A reference site: a `$ref` member or a string-valued reference location. */
export interface Site {
  index: number // discovery order
  kind: "ref" | "string"
  owner: Target | null // target whose node was being crawled (null → root)
  tokens: string[] // path of the site inside the owner node
  node: object | null // the `$ref` node (kind "ref")
  parent: object | null // parent object (kind "string")
  key: string // key in parent (kind "string")
  ref: string // `$ref` as written
  normalized: string // canonical reference string
  document: string // document the site belongs to
  siblings: Record<string, unknown> | null // own members next to `$ref`
  immediate?: SourceRef // location the written pointer addresses structurally (undefined when it walks through a `$ref`)
  rules: RefMapRules | undefined // rules at the site
  container: DefinitionPointer | undefined // `rules["#"]`
  wave: number
  target?: Target
  error?: RefErrorDetail
}

/** A resolved reference target (one per canonical location). */
export interface Target {
  key: string
  document: string
  tokens: string[]
  node: unknown
  canonical: boolean // false when synthesised by merging `$ref` siblings on the way
  sites: Site[]
  wave: number
  rules: RefMapRules | undefined
  container: DefinitionPointer | undefined
}

export type Resolution =
  | {
      kind: "found"
      document: string
      tokens: string[]
      value: unknown
      canonical: boolean
      crossed: boolean // a `$ref` node was followed before the last token (the written pointer is not structural)
    }
  | { kind: "pending"; document: string }
  | { kind: "error"; detail: RefErrorDetail }
  | { kind: "cycle"; head: SourceRef; members: string[] } // members: keys of the references on the loop

export interface ReferenceGraph {
  entry: string
  rootDocument: string // document holding the root node
  rootTokens: string[] // location of the root node in that document
  rootNode: unknown
  rootTarget: Target | undefined // canonical target of the root node (alias chains collapsed)
  rules: RefMapRules | undefined
  sites: Site[]
  targets: Map<string, Target>
  errors: RefErrorDetail[]
  siteOf(node: object): Site | undefined
  /** The node is the value of a literal location (data: its `$ref` members are not references). */
  isLiteral(node: object): boolean
  stringSiteOf(parent: object, key: string): Site | undefined
  /** Resolves a reference met outside the crawled graph (synthetic nodes); creates the target if needed. */
  lookupRef(document: string, ref: string): Site
  /** Resolves a location in a loaded document (alias chains collapsed). */
  resolve(document: string, tokens: string[], collapse?: boolean): Resolution
  documentOf(id: string): unknown
}

const isRefNode = (
  value: unknown,
): value is Record<string, unknown> & { $ref: string } =>
  isObject(value) &&
  !Array.isArray(value) &&
  typeof value.$ref === "string" &&
  Object.hasOwn(value, "$ref")

const siblingsOf = (
  node: Record<string, unknown>,
): Record<string, unknown> | null => {
  let siblings: Record<string, unknown> | null = null
  for (const key of Object.keys(node)) {
    if (key !== "$ref") {
      if (!siblings) {
        siblings = {}
      }
      setOwn(siblings, key, node[key])
    }
  }
  return siblings
}

const SKIP = { skip: true }

export class GraphBuilder {
  public sites: Site[] = []
  public targets = new Map<string, Target>()
  public errors: RefErrorDetail[] = []
  private siteByNode = new WeakMap<object, Site>()
  private stringSites = new WeakMap<object, Map<string, Site>>()
  private visited = new WeakSet<object>()
  private literal = new WeakSet<object>()
  private unresolved: Site[] = []
  private parsed = new Map<string, Map<string, ParsedRef>>()
  public rootDocument = ""
  public rootTokens: string[] = []

  constructor(private source: DocumentSource) {}

  // ---------------------------------------------------------------------------
  // resolution

  /** `parseRef` memoised per (document, ref) — the same reference string is usually written many times. */
  public parse(ref: string, fromDocument: string): ParsedRef {
    let byRef = this.parsed.get(fromDocument)
    if (!byRef) {
      byRef = new Map()
      this.parsed.set(fromDocument, byRef)
    }
    let parsed = byRef.get(ref)
    if (!parsed) {
      parsed = parseRef(ref, fromDocument)
      if (parsed.tokens) {
        parsed.key = toKey(parsed.filePath, parsed.tokens)
      }
      byRef.set(ref, parsed)
    }
    return parsed
  }

  public resolveRef(
    fromDocument: string,
    ref: string,
    guard: Set<string>,
    collapse: boolean,
  ): Resolution {
    const parsed = this.parse(ref, fromDocument)
    if (!parsed.tokens) {
      return {
        kind: "error",
        detail: {
          type: "invalid-pointer",
          ref: parsed.normalized,
          document: parsed.filePath,
          tokens: [],
        },
      }
    }
    const key = parsed.key as string
    if (guard.has(key)) {
      return {
        kind: "cycle",
        head: { document: parsed.filePath, tokens: parsed.tokens },
        members: [...guard],
      }
    }
    guard.add(key)
    const result = this.walk(
      parsed.filePath,
      parsed.tokens,
      parsed.normalized,
      guard,
      collapse,
    )
    guard.delete(key)
    return result
  }

  public walk(
    document: string,
    tokens: string[],
    ref: string,
    guard: Set<string>,
    collapse: boolean,
  ): Resolution {
    const loaded = this.source.get(document)
    if (!loaded) {
      return { kind: "pending", document }
    }
    if (loaded.kind === "missing") {
      return {
        kind: "error",
        detail: { type: "missing", ref, document, tokens },
      }
    }
    if (loaded.kind === "error") {
      return {
        kind: "error",
        detail: { type: "error", ref, document, tokens, cause: loaded.cause },
      }
    }

    let value: unknown = loaded.value
    if (typeof value === "string") {
      // text documents (.md) are returned whole, whatever the fragment says
      return {
        kind: "found",
        document,
        tokens: [],
        value,
        canonical: true,
        crossed: false,
      }
    }

    let curDocument = document
    let location: string[] = []
    let canonical = true
    let crossed = false
    let i = 0

    while (true) {
      if (isRefNode(value) && (i < tokens.length || collapse)) {
        const siblings = siblingsOf(value)
        if (i === tokens.length && siblings) {
          break // a `$ref` with content is a target of its own
        }
        const inner = this.resolveRef(curDocument, value.$ref, guard, true)
        if (
          inner.kind === "cycle" &&
          siblings &&
          i < tokens.length &&
          Object.hasOwn(siblings, tokens[i])
        ) {
          // the `$ref` leads back through this node (e.g. a root `$ref` into its own
          // `definitions`): the sibling member is the only content the token can address
          value = siblings[tokens[i]]
          location = [...location, tokens[i]]
          i++
          continue
        }
        if (inner.kind !== "found") {
          return inner
        }
        if (i < tokens.length) {
          crossed = true
        }
        if (!siblings) {
          value = inner.value
          curDocument = inner.document
          location = inner.tokens
          canonical = canonical && inner.canonical
          continue
        }
        // `$ref` with siblings crossed on the way: mergeValues semantics
        const token = tokens[i]
        if (Object.hasOwn(siblings, token)) {
          const own = siblings[token]
          const theirs = isObject(inner.value) ? inner.value[token] : undefined
          if (isObject(own) && isObject(theirs)) {
            value = mergeValues(theirs, own)
            canonical = false
          } else {
            value = own
          }
          location = [...location, token]
          i++
          continue
        }
        value = inner.value
        curDocument = inner.document
        location = inner.tokens
        canonical = canonical && inner.canonical
      }
      if (i >= tokens.length) {
        break
      }
      // walk one token at a time so intermediate `$ref` nodes are followed
      const single = walkTokens(value, [tokens[i]])
      if (single.kind === "missing") {
        return {
          kind: "error",
          detail: { type: "missing", ref, document, tokens },
        }
      }
      value = single.value
      location = [...location, tokens[i]]
      i++
    }

    return {
      kind: "found",
      document: curDocument,
      tokens: location,
      value,
      canonical,
      crossed,
    }
  }

  // ---------------------------------------------------------------------------
  // discovery

  public crawl(
    owner: Target | null,
    node: unknown,
    document: string,
    rules: RefMapRules | undefined,
  ): void {
    if (!isObject(node)) {
      return
    }
    const wave = owner ? owner.wave + 1 : 0
    walkTree<RefMapRule>(
      node,
      (ctx) => {
        const { value, key, parent } = ctx
        if ((ctx.rules as RefMapRule | undefined)?.literal) {
          if (isObject(value)) {
            this.literal.add(value)
          }
          return SKIP
        }
        if (isObject(value)) {
          if (this.visited.has(value)) {
            return SKIP
          }
          this.visited.add(value)
          if (isRefNode(value)) {
            const site = this.createSite({
              kind: "ref",
              owner,
              tokens: ctx.path.map(String),
              node: value,
              parent: null,
              key: "",
              ref: value.$ref,
              document,
              siblings: siblingsOf(value),
              rules: ctx.rules as RefMapRules | undefined,
              wave,
            })
            this.siteByNode.set(value, site)
          }
          return undefined
        }
        if (
          typeof value === "string" &&
          isObject(parent) &&
          ctx.rules &&
          (ctx.rules as RefMapRule).refs === "string"
        ) {
          const site = this.createSite({
            kind: "string",
            owner,
            tokens: ctx.path.map(String),
            node: null,
            parent,
            key: String(key),
            ref: value,
            document,
            siblings: null,
            rules: ctx.rules as RefMapRules | undefined,
            wave,
          })
          let byKey = this.stringSites.get(parent)
          if (!byKey) {
            byKey = new Map()
            this.stringSites.set(parent, byKey)
          }
          byKey.set(String(key), site)
        }
        return undefined
      },
      rules,
    )
  }

  private createSite(
    init: Omit<Site, "index" | "normalized" | "container">,
  ): Site {
    const site: Site = {
      ...init,
      index: this.sites.length,
      normalized: this.parse(init.ref, init.document).normalized,
      container:
        init.rules && "#" in init.rules
          ? (init.rules["#"] as DefinitionPointer)
          : undefined,
    }
    this.sites.push(site)
    this.unresolved.push(site)
    return site
  }

  private resolveSite(site: Site): Resolution {
    return this.resolveRef(site.document, site.ref, new Set(), true)
  }

  private finalizeSite(site: Site, result: Resolution): void {
    if (result.kind === "pending") {
      return
    }
    if (result.kind === "error") {
      site.error = result.detail
      this.errors.push(result.detail)
      return
    }
    if (result.kind === "cycle") {
      site.error = {
        type: "cycle-without-content",
        ref: site.normalized,
        document: result.head.document,
        tokens: result.head.tokens,
        members: result.members,
      }
      this.errors.push(site.error)
      return
    }
    if (!result.crossed) {
      const parsed = this.parse(site.ref, site.document)
      if (parsed.tokens) {
        site.immediate = { document: parsed.filePath, tokens: parsed.tokens }
      }
    }
    const key = result.canonical
      ? toKey(result.document, result.tokens)
      : `${site.normalized}#synthetic`
    let target = this.targets.get(key)
    const isNew = !target
    if (!target) {
      target = {
        key,
        document: result.document,
        tokens: result.tokens,
        node: result.value,
        canonical: result.canonical,
        sites: [],
        wave: site.wave,
        rules: site.rules,
        container: site.container,
      }
      this.targets.set(key, target)
    } else if (!target.container && site.container) {
      target.container = site.container
    }
    target.sites.push(site)
    site.target = target
    if (isNew) {
      this.crawl(target, target.node, target.document, site.rules)
    }
  }

  /**
   * Resolves every discovered site that can be resolved with the documents loaded so far
   * and crawls newly found targets. Returns the ids of documents that still have to be loaded.
   */
  public step(): Set<string> {
    const needed = new Set<string>()
    const pending: Site[] = []
    let list = this.unresolved
    this.unresolved = []
    while (list.length) {
      for (const site of list) {
        const result = this.resolveSite(site)
        if (result.kind === "pending") {
          needed.add(result.document)
          pending.push(site)
        } else {
          this.finalizeSite(site, result)
        }
      }
      list = this.unresolved
      this.unresolved = []
    }
    this.unresolved = pending
    return needed
  }

  /** Marks sites that still wait for documents (sync mode / emit time) as missing. */
  public failPending(): void {
    for (const site of this.unresolved) {
      const parsed = this.parse(site.ref, site.document)
      site.error = {
        type: "missing",
        ref: site.normalized,
        document: parsed.filePath,
        tokens: parsed.tokens ?? [],
      }
      this.errors.push(site.error)
    }
    this.unresolved = []
  }

  public finish(
    entry: string,
    rootDocument: string,
    rootTokens: string[],
    rootNode: unknown,
    rootTarget: Target | undefined,
    rules: RefMapRules | undefined,
  ): ReferenceGraph {
    this.failPending()
    return {
      entry,
      rootDocument,
      rootTokens,
      rootNode,
      rootTarget,
      rules,
      sites: this.sites,
      targets: this.targets,
      errors: this.errors,
      siteOf: (node) => this.siteByNode.get(node),
      isLiteral: (node) => this.literal.has(node),
      stringSiteOf: (parent, key) => this.stringSites.get(parent)?.get(key),
      lookupRef: (document, ref) => this.lookupRef(document, ref),
      resolve: (document, tokens, collapse = true) =>
        this.walk(
          document,
          tokens,
          toKey(document, tokens),
          new Set(),
          collapse,
        ),
      documentOf: (id) => {
        const loaded = this.source.get(id)
        return loaded?.kind === "found" ? loaded.value : undefined
      },
    }
  }

  private lookupRef(document: string, ref: string): Site {
    const site = this.createSite({
      kind: "ref",
      owner: null,
      tokens: [],
      node: null,
      parent: null,
      key: "",
      ref,
      document,
      siblings: null,
      rules: undefined,
      wave: 0,
    })
    this.step()
    this.failPending()
    return site
  }

  /** Canonical target for a location (creating it when needed). */
  public targetFor(document: string, tokens: string[]): Target | undefined {
    const result = this.walk(
      document,
      tokens,
      toKey(document, tokens),
      new Set(),
      true,
    )
    if (result.kind !== "found") {
      return undefined
    }
    const key = result.canonical
      ? toKey(result.document, result.tokens)
      : `${toKey(document, tokens)}#synthetic`
    let target = this.targets.get(key)
    if (!target) {
      target = {
        key,
        document: result.document,
        tokens: result.tokens,
        node: result.value,
        canonical: result.canonical,
        sites: [],
        wave: 0,
        rules: undefined,
        container: undefined,
      }
      this.targets.set(key, target)
    }
    return target
  }

  public setRoot(document: string, tokens: string[]): void {
    this.rootDocument = document
    this.rootTokens = tokens
  }
}
