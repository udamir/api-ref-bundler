export default {
  title: "Person",
  type: "object",
  required: ["name"],
  properties: {
    name: {
      $ref: "#/definitions/name",
    },
    age: {
      type: "integer",
      minimum: 0,
    },
    gender: {
      type: "string",
      enum: ["male", "female"],
    },
  },
  definitions: {
    "required string": {
      title: "required string",
      type: "string",
      minLength: 1,
    },
    string: {
      $ref: "#/definitions/required%20string/type",
    },
    name: {
      title: "name",
      type: "object",
      required: ["first", "last"],
      properties: {
        // 1.0.0 (RB-22/23): emitted pointers are uniformly encoded and never walk through a `$ref`
        first: {
          $ref: "#/definitions/required%20string",
        },
        last: {
          $ref: "#/definitions/required%20string",
        },
        middle: {
          type: {
            $ref: "#/definitions/required%20string/type",
          },
          minLength: {
            $ref: "#/definitions/required%20string/minLength",
          },
        },
        prefix: {
          $ref: "#/definitions/name/properties/last",
          minLength: 3,
        },
        suffix: {
          $ref: "#/definitions/name/properties/prefix",
          type: "string",
          maxLength: 3,
        },
      },
    },
  },
}
