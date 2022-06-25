import { filename, getValueByPath, isJsonSchema, mergeValues, relativePath, setValueByPath, validURL } from "./utils"
import { PathPointer } from "./pointer"

const external = Symbol("external")

export type Resolver = (sourcePath: string) => Promise<Object>

export interface ApiRefBundlerOptions {
  source?: object
  definitionsBasePath?: string
  ignoreBadSource?: boolean
}

export class ApiRefBundler {
  private defLinks = new Map<string, string>()
  private cache = new Map<string, any>()
  private basePath: string
  private source: any = {}
  public errors: any[] = []
  private defsPath: PathPointer
  private defs?: any

  constructor(sourcePath: string, public resolver: Resolver, public options?: ApiRefBundlerOptions) {
    this.source = options?.source
    this.basePath = validURL(sourcePath) ? new URL(sourcePath).href : relativePath(sourcePath)
    this.defsPath = PathPointer.fromPath(this.options?.definitionsBasePath || "/definitions")
  }

  public async run() {
    if (!this.source) {
      this.source = await this.resolve(this.basePath)
    }

    return this.crawl(this.source, this.basePath)
  }

  public async resolve(sourcePath: string): Promise<any> {
    if (this.cache.has(sourcePath)) {
      return this.cache.get(sourcePath)
    } 

    const value = await this.resolver(sourcePath)
    this.cache.set(sourcePath, value)
    return value
  }

  public async bundle($ref: string, path: string, defPrefix?: string) {
    if (!$ref) { return }

    const [source, pointer] = $ref.split("#")

    const link = !pointer || pointer === "/" ? "" : pointer

    if (!source && !path && !defPrefix) { return { $ref: $ref }  }

    // resolve source
    const sourcePath = validURL(source) ? new URL(source).href : relativePath(source, path)

    // check if source equal to base file
    if (sourcePath === this.basePath) {
      return { $ref: "#" + link } 
    } 

    // check if ref already added to root definitions
    if (this.defLinks.has(sourcePath + "#" + link)) {
      return { $ref: this.defLinks.get(sourcePath + "#" + link), [external]: this.basePath }
    }

    // resolve source
    const refSource = await this.resolve(sourcePath)

    if (!refSource) {
      this.errors.push({ message: "Cannot resolve $ref source", ref: $ref, path })
      if (!this.options?.ignoreBadSource) { return }
    }

    // resolve $ref
    const value = !link ? refSource : getValueByPath(refSource, link.split("/").slice(1))

    if (!value) {
      this.errors.push({ message: "Cannot resolve $ref path", ref: $ref, path })
      return
    }

    if (isJsonSchema(value)) {
      const { $defs, definitions, ...jsonSchema } = value

      // generate new definition name
      const name = value.$id || filename(link || sourcePath)
      const defName = this.uniqueDefinitionName(!source && defPrefix ? defPrefix + "-" + name : name)
      const defPath = this.defsPath.childPath(defName)

      this.defLinks.set(sourcePath + "#" + link, "#" + defPath.ref)

      // resolve jsonSchema refs
      await this.crawl(jsonSchema, sourcePath, defName)

      // inject jsonSchema to root definitions
      setValueByPath(this.source, defPath.items, jsonSchema)
      jsonSchema[external] = sourcePath + "#" + link

      return { $ref: "#" + defPath.ref, [external]: this.basePath }
    }

    await this.crawl(value, sourcePath)

    return value
  }

  private uniqueDefinitionName(name: string, i = 0): string {
    if (!this.defs) {
      this.defs = getValueByPath(this.source, this.defsPath.items)
    }

    const _name = i ? name + i : name
    if (!this.defs || !this.defs[_name]) { return _name }

    return this.uniqueDefinitionName(name, i+1)
  }

  private async crawl(data: any, path: string = "", defPrefix: string = ""): Promise<any> {
    if (data[external]) { return data }
    if (typeof data !== "object") { return data }
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] !== "object") { continue }
        await this.crawl(data[i], path, defPrefix)
      }
    } else {
      const { $ref, ...rest } = data

      if (data[external]) { return data }

      for (const key of Object.keys(rest)) {
        if (typeof rest[key] !== "object") { continue }
        await this.crawl(rest[key], path, defPrefix)
      }

      const refContent = await this.bundle($ref, path, defPrefix)
      if (refContent) {
        if ($ref && !refContent["$ref"]) {
          delete data["$ref"]
        }
        mergeValues(data, mergeValues(refContent, rest))
      }
    }
    return data
  }
}
