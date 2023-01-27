const self = {
  definitions: {
    thing: {
      title: "thing",
      $ref: "#/definitions/thing",
      description: "This JSON Reference has additional properties (other than $ref). Normally, this creates a new type that extends the referenced type, but since this reference points to ITSELF, it doesn't do that.\n",
    }
  }
}

const pet = {
  title: "pet",
  type: "object",
  properties: {
    age: {
      $ref: "#/definitions/age"
    },
    name: {
      $ref: "#/definitions/name"
    },
    species: {
      type: "string",
      enum: [
        "cat",
        "dog",
        "bird",
        "fish"
      ],
    },
  },
}

const ancestor = {
  definitions: {
    name: {
      type: "string"
    },
    age: {
      type: "number"
    },
    person: {
      title: "person",
      properties: {
        spouse: {
          $ref: "#/definitions/person",
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "person".\n',
        },
        pet: {
          $ref: "#/definitions/pet",
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n'
        },
        name: {
          type: "string"
        }
      }
    },
    pet
  }
}

const indirect = {
  definitions: {
    name: {
      type: "string"
    },
    age: {
      type: "number"
    },
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string"
        },
        children: {
          items: {
            $ref: "#/definitions/child",
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
          },
          type: "array"
        }
      }
    },
    child: {
      title: "child",
      properties: {
        parents: {
          items: {
            $ref: "#/definitions/parent",
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
          },
          type: "array"
        },
        pet: {
          $ref: "#/definitions/pet",
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
        },
        name: {
          type: "string"
        }
      }
    },
    pet
  }
}

const indirectAncestor = {
  definitions: {
    name: {
      type: "string"
    },
    age: {
      type: "number"
    },
    pet,
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string"
        },
        child: {
          $ref: "#/definitions/child",
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
        }
      },
    },
    child: {
      title: "child",
      properties: {
        pet: {
          $ref: "#/definitions/pet",
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
        },
        name: {
          type: "string"
        },
        children: {
          items: {
            $ref: "#/definitions/child",
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
          },
          type: "array",
          description: "children"
        }
      },
    }
  }
}

export const bundled: any = { self, ancestor, indirect, indirectAncestor }

