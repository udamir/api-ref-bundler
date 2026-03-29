import { isObject } from "json-crawl"
import type { JsonNode } from "./types"

import { mergeValues, parsePointer, parseRef } from "./utils"

export type Resolver = (sourcePath: string) => Promise<object>

export interface ResolverPointer {
  filePath: string
  value?: JsonNode
}

export class RefResolver {
  private cache = new Map<string, JsonNode>()

  constructor(
    private basePath: string,
    private resolver: Resolver,
  ) {}

  public async base(pointer: string = "") {
    const { value } = await this.resolvePointer(pointer, this.basePath)
    return value
  }

  private async resolve(sourcePath: string): Promise<JsonNode | undefined> {
    if (this.cache.has(sourcePath)) {
      return this.cache.get(sourcePath)
    }

    try {
      const value = (await this.resolver(sourcePath)) as JsonNode
      this.cache.set(sourcePath, value)
      return value
    } catch (_error) {
      return
    }
  }

  public async resolvePointer(
    pointer: string,
    filePath = "",
    sibling?: object,
  ): Promise<ResolverPointer> {
    // resolve source
    const data = await this.resolve(filePath ?? this.basePath)

    if (typeof data === "string") {
      return { filePath, value: data }
    }

    let value: JsonNode | undefined = data
    if (isObject(value)) {
      const path = parsePointer(pointer)
      for (const key of path) {
        if (Array.isArray(value) && value.length > +key) {
          value = value[+key]
        } else if (isObject(value) && !Array.isArray(value) && key in value) {
          value = value[key]
        } else if (isObject(value) && !Array.isArray(value) && value.$ref) {
          const { $ref, ...rest } = value
          const _ref = parseRef($ref as string, filePath)
          const resolverPointer = await this.resolvePointerRef(
            _ref.pointer,
            _ref.filePath,
            rest,
          )
          filePath = resolverPointer.filePath
          const rpv = resolverPointer.value
          if (isObject(rpv) && !Array.isArray(rpv)) {
            if (!(key in rpv)) {
              return { filePath }
            }
            value = rpv[key]
          } else {
            return { filePath }
          }
        } else {
          return { filePath }
        }
      }

      value = sibling ? (mergeValues(value, sibling) as JsonNode) : value
      return { filePath, value: value as JsonNode }
    }

    return pointer ? { filePath } : { filePath, value: value as JsonNode }
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
    if (isObject(resolverPointer.value) && "$ref" in resolverPointer.value) {
      const { $ref, ...rest } = resolverPointer.value
      return this.resolverRef($ref as string, resolverPointer.filePath, rest)
    }
    return resolverPointer
  }
}
