import { getValueByPath, mergeValues, parsePointer, parseRef, isObject } from "./utils"

export type Resolver = (sourcePath: string) => Promise<Object>

export interface ResolverPointer {
  filePath: string
  value?: any
}

export class RefResolver {
  private cache = new Map<string, any>()

  constructor(private basePath: string, private resolver: Resolver) {
  }

  public async base(pointer: string = "") {
    const value = await this.resolve(this.basePath)
    if (pointer) {
      const path = parsePointer(pointer)
      return getValueByPath(value, path)
    } else {
      return value
    }
  }

  private async resolve(sourcePath: string): Promise<any> {
    if (this.cache.has(sourcePath)) {
      return this.cache.get(sourcePath)
    }

    try {
      const value = await this.resolver(sourcePath)
      this.cache.set(sourcePath, value)
      return value
    } catch (error) {
      return
    }
  }

  public async resolvePointer(pointer: string, filePath = "", sibling?: any): Promise<ResolverPointer> {
    // resolve source
    const data = await this.resolve(filePath ?? this.basePath)

    if (typeof data === "string") {
      return { filePath, value: data }
    }
    
    let value = data
    if (isObject(value)) {
      const path = parsePointer(pointer)
      for (const key of path) {
        if (Array.isArray(value) && value.length > +key) {
          value = value[+key]
        } else if (isObject(value) && key in value) {
          value = value[key]
        } else if (isObject(value) && value.$ref) {
          const { $ref, ...rest } = value
          const _ref = parseRef($ref, filePath)
          const resolverPointer = await this.resolvePointerRef(_ref.pointer, _ref.filePath, rest)
          filePath = resolverPointer.filePath
          if (!(key in resolverPointer.value)) { return { filePath } }
          value = resolverPointer.value[key]
        } else {
          return { filePath }
        }       
      }

      value = sibling ? mergeValues(value, sibling) : value
      return { filePath, value }
    }

    return pointer ? { filePath } : { filePath, value }
  }

  public async resolverRef($ref: string, filePath: string, sibling?: any) {
    const _ref = parseRef($ref, filePath)
    return this.resolvePointer(_ref.pointer, _ref.filePath, sibling)
  }

  public async resolvePointerRef(pointer: string, filePath = "", sibling?: any) {
    const resolverPointer = await this.resolvePointer(pointer, filePath, sibling)
    if (isObject(resolverPointer.value) && "$ref" in resolverPointer.value) {
      const { $ref, ...rest } = resolverPointer.value
      return this.resolverRef($ref, resolverPointer.filePath, rest)
    }
    return resolverPointer
  }
}
