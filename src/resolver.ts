import { isObject } from "./crawler"
import { buildRef, getValueByPath, mergeValues, parsePath } from "./utils"

export type Resolver = (sourcePath: string) => Promise<Object>

export class RefResolver {
  private cache = new Map<string, any>()

  constructor(private basePath: string, private resolver: Resolver) {
  }

  public async base(pointer: string = "") {
    const value = await this.resolve(this.basePath)
    if (pointer) {
      const path = parsePath(pointer)
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

  public async resolveRef(pointer: string, filePath = "", sibling?: any) {
    // resolve source
    const data = await this.resolve(filePath ?? this.basePath)

    if (typeof data === "string") {
      return data
    }
    
    if (isObject(data)) {
      const value = !pointer ? data : getValueByPath(data, parsePath(pointer))
      return sibling ? mergeValues(value, sibling) : value
    }

    const $ref = buildRef(filePath, pointer)
    return sibling ? { $ref, ...sibling } : { $ref }
  }
}
