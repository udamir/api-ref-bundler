const self = {
  definitions: {
    thing: {
      title: "thing",
      $ref: "#/definitions/thing",
      description:
        "This JSON Reference has additional properties (other than $ref). Normally, this creates a new type that extends the referenced type, but since this reference points to ITSELF, it doesn't do that.\n",
    },
  },
}

const selfCycled = {
  definitions: {
    thing: {
      title: "thing",
      description:
        "This JSON Reference has additional properties (other than $ref). Normally, this creates a new type that extends the referenced type, but since this reference points to ITSELF, it doesn't do that.\n",
    },
  },
}

const pet = {
  title: "pet",
  type: "object",
  properties: {
    age: {
      type: "number",
    },
    name: {
      type: "string",
    },
    species: {
      type: "string",
      enum: ["cat", "dog", "bird", "fish"],
    },
  },
}

const ancestor = {
  definitions: {
    person: {
      title: "person",
      properties: {
        spouse: {
          description:
            'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "person".\n',
          $ref: "#/definitions/person",
        },
        pet: {
          description:
            'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string",
        },
      },
    },
    pet,
  },
}

const indirect = {
  definitions: {
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string",
        },
        children: {
          items: {
            title: "child",
            description:
              'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
            properties: {
              parents: {
                items: {
                  $ref: "#/definitions/parent",
                  description:
                    'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
                },
                type: "array",
              },
              pet: {
                description:
                  'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
                title: "pet",
                type: "object",
                properties: pet.properties,
              },
              name: {
                type: "string",
              },
            },
          },
          type: "array",
        },
      },
    },
    child: {
      title: "child",
      properties: {
        parents: {
          items: {
            description:
              'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
            title: "parent",
            properties: {
              name: {
                type: "string",
              },
              children: {
                items: {
                  title: "child",
                  description:
                    'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
                  properties: {
                    parents: {
                      items: {
                        $ref: "#/definitions/parent",
                        description:
                          'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
                      },
                      type: "array",
                    },
                    pet: {
                      description:
                        'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
                      title: "pet",
                      type: "object",
                      properties: pet.properties,
                    },
                    name: {
                      type: "string",
                    },
                  },
                },
                type: "array",
              },
            },
          },
          type: "array",
        },
        pet: {
          description:
            'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string",
        },
      },
    },
    pet,
  },
}

// 1.0.0 (RB-24): a target that is already being
// materialised on the current path is a cycle, so the nested `child` (with its sibling description) is
// cut at `#/definitions/parent/properties/child` instead of being expanded one more level as in 0.5.x.
const indirectAncestor = {
  definitions: {
    pet,
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string",
        },
        child: {
          title: "child",
          description:
            'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
          properties: {
            pet: {
              title: "pet",
              type: "object",
              properties: pet.properties,
            },
            name: {
              type: "string",
            },
            children: {
              items: {
                $ref: "#/definitions/parent/properties/child",
                description:
                  'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
              },
              type: "array",
            },
          },
        },
      },
    },
    child: {
      title: "child",
      properties: {
        pet: {
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string",
        },
        children: {
          items: {
            $ref: "#/definitions/child",
          },
          type: "array",
        },
      },
    },
  },
}

export const dereferenced = {
  self,
  ancestor,
  indirect,
  indirectAncestor,
  selfCycled,
}
