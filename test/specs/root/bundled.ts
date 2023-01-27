export default {
  title: "Extending a root $ref",
  required: [
    "first",
    "last"
  ],
  type: "object",
  properties: {
    last: {
      $ref: "#/properties/first",
    },
    first: {
      type: "string"
    }
  },
};
