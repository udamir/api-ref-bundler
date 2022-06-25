export type PathItem = string | number

export class PathPointer implements Iterable<PathItem> {
  public escapedKey: string
  public items: PathItem[] = []

  public get ref(): string {
    return this.parent ? this.parent.ref + "/" + this.escapedKey : this.escapedKey
  }

  [Symbol.iterator]() : Iterator<PathItem> {
    let i = 0
    return {
      next: () => ({ 
        done: !(i < this.items.length),
        value: this.items[i++]
      })
    }
  }

  static fromPath(path: string = "/"): PathPointer {
    let pointer = new PathPointer()
    for (const key of path.split("/")) {
      if (!key) { continue }
      pointer = pointer.childPath(key)
    }
    return pointer
  }

  constructor(public key?: string | number, public parent?: PathPointer, public source = "") {
    if (key === undefined) {
      this.escapedKey = ""
    } else {
      this.escapedKey = typeof key === "string" ? key.replace(new RegExp("~1", "g"), "/") : String(key)
      this.items = parent ? [...parent.items, key] : [key]
    }
  }

  public childPath(key: string | number): PathPointer {
    return new PathPointer(key, this)
  }
}
