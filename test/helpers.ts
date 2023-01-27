import { promises as fs } from "fs"
import path from "path"
import * as YAML from "js-yaml"

export const resolver = async (sourcePath: string) => {
  const file = await fs.readFile(path.join(__dirname, sourcePath))
  const filename = sourcePath.toLocaleLowerCase()
  if (filename.slice(-3) === ".md") {
    return file.toString() 
  } else if (filename.slice(-5) === ".json") {
    return JSON.parse(file.toString())     
  } else if (filename.slice(-5) === ".yaml" || filename.slice(-4) === ".yml") {
    return YAML.load(file.toString())     
  }
}
