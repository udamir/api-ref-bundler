
const self: any = {
  definitions: {
    thing: {
      title: "thing",
      $ref: "#/definitions/thing",
      description: "This JSON Reference has additional properties (other than $ref). Normally, this creates a new type that extends the referenced type, but since this reference points to ITSELF, it doesn't do that.\n",
    }
  }
}

const selfCycled: any = {
  definitions: {
    thing: {
      title: "thing",
      description: "This JSON Reference has additional properties (other than $ref). Normally, this creates a new type that extends the referenced type, but since this reference points to ITSELF, it doesn't do that.\n",
    }
  }
}

const pet = {
  title: "pet",
  type: "object",
  properties: {
    age: {
      type: "number"
    },
    name: {
      type: "string"
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

const ancestor: any = {
  definitions: {
    person: {
      title: "person",
      properties: {
        spouse: {
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "person".\n',
          $ref: "#/definitions/person",
        },
        pet: {
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string"
        }
      }
    },
    pet,
  }
}

const indirect: any = {
  definitions: {
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string"
        },
        children: {
          items: {
            title: "child",
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
            properties: {
              parents: {
                items: {
                  $ref: '#/definitions/parent',
                  description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
                },
                type: "array"
              },
              pet: {
                description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
                title: "pet",
                type: "object",
                properties: pet.properties,
              },
              name: {
                type: "string"
              }
            }
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
            $ref: '#/definitions/parent',
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "parent".\n',
          },
          type: "array"
        },
        pet: {
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string"
        }
      }
    },
    pet,
  }
}

const indirectAncestor: any = {
  definitions: {
    pet,
    parent: {
      title: "parent",
      properties: {
        name: {
          type: "string"
        },
        child: {
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
          title: "child",
          properties: {
            pet: {
              description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
              title: "pet",
              type: "object",
              properties: pet.properties,
            },
            name: {
              type: "string"
            },
            children: {
              items: {
                description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
                title: "child",
                properties: {
                  pet: {
                    description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
                    title: "pet",
                    type: "object",
                    properties: pet.properties,
                  },
                  name: {
                    type: "string"
                  },
                  children: {
                    items: {
                      $ref: '#/definitions/parent/properties/child/properties/children/items'
                    },
                    type: "array",
                    description: "children"
                  }
                },
              },
              type: "array",
              description: "children"
            }
          },
        }
      },
    },
    child: {
      title: "child",
      properties: {
        pet: {
          description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
          title: "pet",
          type: "object",
          properties: pet.properties,
        },
        name: {
          type: "string"
        },
        children: {
          items: {
            description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "child".\n',
            title: "child",
            properties: {
              pet: {
                description: 'This JSON Reference has additional properties (other than $ref). This creates a new type that extends "pet".\n',
                title: "pet",
                type: "object",
                properties: pet.properties,
              },
              name: {
                type: "string"
              },
              children: {
                items: {
                  $ref: '#/definitions/parent/properties/child/properties/children/items'
                },
                type: "array",
                description: "children"
              }
            },
          },
          type: "array",
          description: "children"
        }
      },
    }
  }
}

export const dereferenced: any = { self, ancestor, indirect, indirectAncestor, selfCycled }