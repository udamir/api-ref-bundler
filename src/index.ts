import { ApiRefBundler, ApiRefBundlerOptions, Resolver } from "./bundler"

export * from "./bundler"
export * from "./utils"

export const create = (sourcePath: string, resolver: Resolver, options?: ApiRefBundlerOptions) => new ApiRefBundler(sourcePath, resolver, options)