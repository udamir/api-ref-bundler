import { isObject } from "json-crawl"
import type { RefErrorDetail } from "./errors"
import { isArrayIndex, normalizeDocumentId } from "./ref"
import type { JsonNode } from "./types"
import { isUnsafeKey, mergeValues, parseRef } from "./utils"

export type Resolver = (sourcePath: string) => Promise<object> | object

export interface ResolverPointer {
  filePath: string
  value?: JsonNode
  found: boolean // disambiguates falsy values from "not found"
}

/** Result of loading a document through the user resolver. */
export type LoadResult =
  | { kind: "found"; value: unknown }
  | { kind: "missing" }
  | { kind: "error"; cause: unknown }

/** Result of walking pointer tokens inside a loaded value. */
export type WalkResult =
  | { kind: "found"; value: unknown }
  | { kind: "missing"; depth: number }

/**
 * Walks `tokens` inside `value` without following `$ref` nodes.
 * Only own properties are visited (RFC 6901 §4) and array indexes are validated
 * against `0 | [1-9][0-9]*`.
 */
export const walkTokens = (
  value: unknown,
  tokens: ReadonlyArray<string>,
  start = 0,
): WalkResult => {
  let node = value
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i]
    if (Array.isArray(node)) {
      if (!isArrayIndex(token) || Number(token) >= node.length) {
        return { kind: "missing", depth: i }
      }
      node = node[Number(token)]
    } else if (
      isObject(node) &&
      !isUnsafeKey(token) &&
      Object.hasOwn(node, token)
    ) {
      node = node[token]
    } else {
      return { kind: "missing", depth: i }
    }
  }
  return { kind: "found", value: node }
}

export interface DocumentSource {
  /** Synchronous lookup of an already loaded document. */
  get(id: string): LoadResult | undefined
}

/**
 * Document loader: one resolver call per document id, concurrent requests share a promise,
 * resolver failures are cached as typed results.
 */
export class DocumentLoader implements DocumentSource {
  private results = new Map<string, LoadResult>()
  private pending = new Map<string, Promise<LoadResult>>()
  private active = 0
  private queue: Array<() => void> = []

  constructor(
    private resolver: Resolver,
    private concurrency = 16,
  ) {}

  public get(id: string): LoadResult | undefined {
    return this.results.get(id)
  }

  public has(id: string): boolean {
    return this.results.has(id)
  }

  public set(id: string, result: LoadResult): void {
    this.results.set(id, result)
  }

  public load(id: string): Promise<LoadResult> {
    const cached = this.results.get(id)
    if (cached) {
      return Promise.resolve(cached)
    }
    const inflight = this.pending.get(id)
    if (inflight) {
      return inflight
    }
    const promise = this.acquire()
      .then(() => this.fetch(id))
      .then((result) => {
        this.results.set(id, result)
        this.pending.delete(id)
        this.release()
        return result
      })
    this.pending.set(id, promise)
    return promise
  }

  public async loadAll(
    ids: Iterable<string>,
    parallel: boolean,
  ): Promise<void> {
    if (parallel) {
      await Promise.all([...ids].map((id) => this.load(id)))
    } else {
      for (const id of ids) {
        await this.load(id)
      }
    }
  }

  private async fetch(id: string): Promise<LoadResult> {
    try {
      const value = await this.resolver(id)
      return value === undefined
        ? { kind: "missing" }
        : { kind: "found", value }
    } catch (cause) {
      return { kind: "error", cause }
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++
        resolve()
      })
    })
  }

  private release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }
}

/** Synchronous document source over a pre-loaded map (used by `bundleSync`/`dereferenceSync`). */
export class MapDocumentSource implements DocumentSource {
  constructor(private documents: Map<string, unknown>) {}

  public get(id: string): LoadResult {
    if (!this.documents.has(id)) {
      return { kind: "missing" }
    }
    const value = this.documents.get(id)
    return value === undefined ? { kind: "missing" } : { kind: "found", value }
  }
}

export const loadResultError = (
  result: LoadResult,
  ref: string,
  document: string,
  tokens: string[],
): RefErrorDetail | undefined => {
  if (result.kind === "missing") {
    return { type: "missing", ref, document, tokens }
  }
  if (result.kind === "error") {
    return { type: "error", ref, document, tokens, cause: result.cause }
  }
  return undefined
}

/**
 * Ref-aware pointer resolver (public utility). Documents are loaded once; pointers may
 * traverse intermediate `$ref` nodes (siblings of those nodes are merged on the way).
 */
export class RefResolver {
  private loader: DocumentLoader
  private basePath: string

  constructor(basePath: string, resolver: Resolver) {
    this.basePath = normalizeDocumentId(basePath)
    this.loader = new DocumentLoader(resolver)
  }

  public get baseId(): string {
    return this.basePath
  }

  public get documents(): DocumentLoader {
    return this.loader
  }

  public async base(pointer: string = "") {
    const { value } = await this.resolvePointer(pointer, this.basePath)
    return value
  }

  public async resolvePointer(
    pointer: string,
    filePath = "",
    sibling?: object,
  ): Promise<ResolverPointer> {
    const documentId = filePath || this.basePath
    const tokens = parseRef(`#${pointer}`, documentId).tokens
    if (!tokens) {
      return { filePath: documentId, found: false }
    }
    return this.resolveTokens(documentId, tokens, sibling, new Set())
  }

  private async resolveTokens(
    documentId: string,
    tokens: string[],
    sibling: object | undefined,
    guard: Set<string>,
  ): Promise<ResolverPointer> {
    const loaded = await this.loader.load(documentId)
    if (loaded.kind !== "found") {
      return { filePath: documentId, found: false }
    }
    const data = loaded.value

    if (typeof data === "string") {
      return { filePath: documentId, value: data, found: true }
    }

    let value: unknown = data
    for (let i = 0; i < tokens.length; i++) {
      // follow an intermediate $ref node before consuming the next token
      if (
        isObject(value) &&
        !Array.isArray(value) &&
        typeof value.$ref === "string"
      ) {
        const { $ref, ...rest } = value
        const ref = parseRef($ref, documentId)
        if (!ref.tokens || guard.has(ref.normalized)) {
          return { filePath: documentId, found: false }
        }
        guard.add(ref.normalized)
        const inner = await this.resolveTokens(
          ref.filePath,
          ref.tokens,
          Object.keys(rest).length ? rest : undefined,
          guard,
        )
        if (!inner.found) {
          return { filePath: inner.filePath, found: false }
        }
        value = inner.value
      }
      const step = walkTokens(value, [tokens[i]])
      if (step.kind === "missing") {
        return { filePath: documentId, found: false }
      }
      value = step.value
    }

    const merged = sibling ? mergeValues(value, sibling) : value
    return { filePath: documentId, value: merged as JsonNode, found: true }
  }

  public async resolverRef($ref: string, filePath: string, sibling?: object) {
    const _ref = parseRef($ref, filePath)
    return this.resolvePointer(_ref.pointer, _ref.filePath, sibling)
  }

  public async resolvePointerRef(
    pointer: string,
    filePath = "",
    sibling?: object,
  ) {
    const resolverPointer = await this.resolvePointer(
      pointer,
      filePath,
      sibling,
    )
    const value = resolverPointer.value as Record<string, unknown> | undefined
    if (
      resolverPointer.found &&
      isObject(value) &&
      !Array.isArray(value) &&
      typeof value.$ref === "string"
    ) {
      const { $ref, ...rest } = value
      return this.resolverRef($ref, resolverPointer.filePath, rest)
    }
    return resolverPointer
  }
}
