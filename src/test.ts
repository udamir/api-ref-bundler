import { promises as fs } from "fs"
import path from "path"
import { dereference } from "../src/dereference"
import { bundle } from "../src/bundle"
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

const test = async () => {
  const hooks = {
    onCrawl: (value: any, { path }: any) => { console.log(`Crawl: ${JSON.stringify(path)}`) },
    onRef: (value: any) => { console.log(`Ref: ${value}`) },
    onCycle: (value: any) => { console.log(`Cycle: ${value}`) },
    onError: (value: any) => { console.log(`Error: ${value}`) },
  }

  const derefResult = await dereference("../test/specs/circular-extended/circular-extended-indirect-ancestor.yaml", resolver, { hooks })
  // const cloneResult = await bundle("../test/resources/foo.json", resolver)

  // console.log("equal:", JSON.stringify(cloneResult, null, 2) === JSON.stringify(mutateResult, null, 2))
  console.log(JSON.stringify(derefResult, null, 2))
}

test()