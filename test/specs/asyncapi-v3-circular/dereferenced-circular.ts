// Expected output after dereference() with enableCircular: true
/** biome-ignore-all lint/suspicious/noExplicitAny: test file */
// Circular refs become actual JavaScript object references

// Build the schema objects with circular references
const Review: any = {
  type: "object",
  properties: {
    rating: {
      type: "integer",
    },
    comment: {
      type: "string",
    },
  },
}

const Product = {
  type: "object",
  properties: {
    id: {
      type: "string",
    },
    name: {
      type: "string",
    },
    reviews: {
      type: "array",
      items: Review,
    },
  },
}

const OrderItem = {
  type: "object",
  properties: {
    productId: {
      type: "string",
    },
    quantity: {
      type: "integer",
    },
    product: Product,
  },
}

const Order: any = {
  type: "object",
  properties: {
    orderId: {
      type: "string",
    },
    amount: {
      type: "number",
    },
    items: {
      type: "array",
      items: OrderItem,
    },
  },
}

const User: any = {
  type: "object",
  properties: {
    id: {
      type: "string",
    },
    name: {
      type: "string",
    },
    orders: {
      type: "array",
      items: Order,
    },
  },
}

// Create circular references
User.properties.friend = User // Direct self-reference
Order.properties.customer = User // Indirect circular
Review.properties.reviewer = User // Deep circular

const UserMessage = {
  payload: User,
}

const UserChannel = {
  address: "/users/{userId}",
  messages: {
    UserMessage,
  },
}

export default {
  asyncapi: "3.0.0",
  info: {
    title: "AsyncAPI v3 Circular Schema Test",
    version: "1.0.0",
    description: "Tests circular $ref handling in AsyncAPI v3",
  },
  channels: {
    UserChannel,
  },
  operations: {
    GetUser: {
      action: "receive",
      channel: UserChannel,
      messages: [UserMessage],
    },
  },
  components: {
    schemas: {
      User,
      Order,
      OrderItem,
      Product,
      Review,
    },
  },
}
