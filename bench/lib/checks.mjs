// What every cell must produce before it is timed. Libraries lay out a bundle differently, so a bundle is checked by
// what it must guarantee (no external reference left, every internal reference resolves) rather than compared with
// api-ref-bundler's output.
const isObj = (v) => typeof v === "object" && v !== null

const decode = (token) => decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~")
const resolvePointer = (doc, ref) => {
  let node = doc
  for (const token of ref.slice(1).split("/").filter((t, i) => i > 0 || t !== "")) {
    if (!isObj(node) || !Object.hasOwn(node, decode(token))) { return undefined }
    node = node[decode(token)]
  }
  return node
}

/** References left in an output, walked once per object (outputs of a dereference may share objects or be cyclic). */
export const scan = (root) => {
  const seen = new Set()
  const stack = [root]
  let refs = 0
  let external = 0
  let unresolved = 0
  while (stack.length) {
    const v = stack.pop()
    if (!isObj(v) || seen.has(v)) { continue }
    seen.add(v)
    if (typeof v.$ref === "string") {
      refs++
      if (!v.$ref.startsWith("#")) { external++ } else if (resolvePointer(root, v.$ref) === undefined) { unresolved++ }
    }
    for (const key of Object.keys(v)) { stack.push(v[key]) }
  }
  return { refs, external, unresolved }
}

/** true when the output contains an object that is its own ancestor (a dereference with circular references). */
export const hasCycle = (root) => {
  const onPath = new Set()
  const done = new Set()
  const stack = [[root, false]]
  while (stack.length) {
    const [v, exiting] = stack.pop()
    if (!isObj(v)) { continue }
    if (exiting) { onPath.delete(v); done.add(v); continue }
    if (onPath.has(v)) { return true }
    if (done.has(v)) { continue }
    onPath.add(v)
    stack.push([v, true])
    for (const key of Object.keys(v)) { stack.push([v[key], false]) }
  }
  return false
}

export const checks = {
  bundle: (out) => {
    const { external, unresolved } = scan(out)
    if (external || unresolved) { throw new Error(`bundle left ${external} external and ${unresolved} unresolved references`) }
  },
  dereference: (out) => {
    const { refs } = scan(out)
    if (refs) { throw new Error(`dereference left ${refs} references`) }
  },
  dereferenceCircular: (out) => {
    const { refs } = scan(out)
    if (refs) { throw new Error(`dereference left ${refs} references`) }
    if (!hasCycle(out)) { throw new Error("the output has no circular reference") }
  },
}
