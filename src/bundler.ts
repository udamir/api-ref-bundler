import {
  buildPath,
  calcJsonType,
  filename,
  getValueByPath,
  isJsonSchema,
  JsonType,
  mergeValues,
  parsePath,
  relativePath,
  setValueByPath,
  validURL
} from "./utils"

const external = Symbol("external")

export type Resolver = (sourcePath: string) => Promise<Object>

export interface ApiRefBundlerOptions {
  source?: object
  ignoreBadSource?: boolean
}

export class ApiRefBundler {
  private defLinks = new Map<string, string>()
  private cache = new Map<string, any>()
  private basePath: string
  private source: any = {}
  public errors: any[] = []
  private defs?: any
  private apiType?: JsonType

  constructor(sourcePath: string, public resolver: Resolver, public options?: ApiRefBundlerOptions) {
    this.source = options?.source
    this.basePath = validURL(sourcePath) ? new URL(sourcePath).href : relativePath(sourcePath)
  }

  public async run() {
    if (!this.source) {
      this.source = await this.resolve(this.basePath)
    }

    if (this.source) {
      this.apiType = calcJsonType(this.source)
      return this.crawl(this.source, this.basePath)
    }
  }

  public async resolve(sourcePath: string): Promise<any> {
    if (this.cache.has(sourcePath)) {
      return this.cache.get(sourcePath)
    }

    try {
      const value = await this.resolver(sourcePath)
      this.cache.set(sourcePath, value)
      return value
    } catch (error) {
      this.errors.push(`Cannot resolve ${sourcePath}!`)
      return
    }
  }

  private getDefinitionPath(ref: string, value: any): string[] | undefined {
    switch (this.apiType) {
      case "OpenApi3":
        if (/^\/components\/(schemas|responses|parameters|examples|requestBodies|headers|securitySchemes|links|callbacks)\/+/.test(ref)) {
          return ref.split("/").slice(1, 3)
        } else {
          return isJsonSchema(value) ? ["components", "schemas"] : undefined
        }
      case "OpenApi2":
        if (/^\/(definitions|parameters|responses|securityDefinitions)/.test(ref)) {
          return ref.split("/").slice(1, 2)
        } else {
          return isJsonSchema(value) ? ["definitions"] : undefined
        }
      case "AsyncApi2":
        if (/^\/components\/(schemas|servers|serverVariables|channels|messages|securitySchemes|parameters|correlationIds|operationTraits|messageTraits|serverBindings|channelBindings|operationBindings|messageBindings)\/+/.test(ref)) {
          return ref.split("/").slice(1, 3)
        } else {
          return isJsonSchema(value) ? ["components", "schemas"] : undefined
        }
      case "JsonSchema":
        return isJsonSchema(value) ? ["definitions"] : undefined
      default:
        return
    }
  }

  public async bundle($ref: string, path: string, defPrefix?: string) {
    if (!$ref) { return }

    const [source, pointer] = $ref.split("#")

    const link = !pointer || pointer === "/" ? "" : pointer

    if (!source && !path && !defPrefix) { return { $ref } }

    // resolve source
    const sourcePath = validURL(source) ? new URL(source).href : relativePath(source, path)

    // check if source equal to base file
    if (sourcePath === this.basePath) {
      return { $ref: "#" + link, [external]: this.basePath }
    }

    const _ref = sourcePath + "#" + link

    // check if ref already added to root definitions
    if (this.defLinks.has(_ref)) {
      return { $ref: this.defLinks.get(_ref), [external]: this.basePath }
    }

    // resolve source
    const refSource = await this.resolve(sourcePath)

    if (!refSource) {
      this.errors.push({ message: "Cannot resolve $ref source", ref: $ref, path })
      if (!this.options?.ignoreBadSource) { return }
    }

    // resolve $ref
    const value = !link ? refSource : getValueByPath(refSource, parsePath(link))

    if (!value) {
      this.errors.push({ message: "Cannot resolve $ref path", ref: $ref, path })
      return
    }

    const defPath = this.getDefinitionPath(link, value)
    if (defPath) {
      const { $defs, definitions, ...jsonSchema } = value

      // generate new definition name
      const name = value.$id || filename(link || sourcePath)
      const defName = this.uniqueDefinitionName(defPath, !sourcePath ? defPrefix + name : name, _ref)
      defPath.push(defName)

      this.defLinks.set(_ref, "#" + buildPath(defPath))

      // resolve jsonSchema refs
      await this.crawl(jsonSchema, sourcePath, defName + "-")

      if (!jsonSchema[external]) {
        // inject jsonSchema to root definitions
        setValueByPath(this.source, defPath, jsonSchema)
        jsonSchema[external] = _ref
      }

      return { $ref: "#" + buildPath(defPath), [external]: this.basePath }
    }

    await this.crawl(value, sourcePath)

    return value
  }

  private uniqueDefinitionName(defPath: string[], name: string, ref: string, i = 0): string {
    if (!this.defs) {
      this.defs = getValueByPath(this.source, defPath)
    }

    const _name = i ? name + i : name
    if (!this.defs || !this.defs[_name]) { return _name }

    // replace existing definition with ref to same name
    if (this.defs[_name]) {
      const { $ref, ...rest } = this.defs[_name]
      if ($ref) {
        const [s = "", l = ""] = $ref.split("#")
        const sourcePath = validURL(s) ? new URL(s).href : relativePath(s)
        const _ref = `${sourcePath || ""}#${l}`
        if ($ref && !Object.keys(rest).length && _ref === ref) {
          delete this.defs[_name]
          return _name
        }
      }
    }

    return this.uniqueDefinitionName(defPath, name, ref, i + 1)
  }

  private async crawl(data: any, path: string = "", defPrefix: string = ""): Promise<any> {
    if (typeof data !== "object" || data === null) { return data }
    if (data[external]) { return data }
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] !== "object") { continue }
        await this.crawl(data[i], path, defPrefix)
      }
    } else {
      const { $ref, ...rest } = data

      if (data[external]) { return data }

      for (const key of Object.keys(rest)) {
        if (typeof rest[key] !== "object" || rest[key] === null) { continue }
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
