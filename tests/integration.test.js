const gql = require("graphql-tag");
const { executeGraphql, setupSchema } = require("../");

const typeDefsProducts = gql`
  extend type Query {
    topProducts(first: Int = 5): [Product]
  }

  type Product @key(fields: "upc") {
    upc: String!
    name: String
    price: Int
    weight: Int
  }
`;

const typeDefsInventory = gql`
  extend type Mutation {
    addInventoryForProduct(upc: String!, inStock: Boolean): Product
    returnContext: String!
  }
  extend type Product @key(fields: "upc") {
    upc: String! @external
    weight: Int @external
    price: Int @external
    inStock: Boolean
    shippingEstimate: Int @requires(fields: "price weight")
  }
`;

const resolversInventory = {
  Mutation: {
    addInventoryForProduct: (_, args) => {
      inventory.push(args);
      return args;
    }
  },
  Product: {
    __resolveReference(object) {
      return {
        ...object,
        ...inventory.find(product => product.upc === object.upc)
      };
    },
    shippingEstimate: object => {
      if (object.price > 1000) return 0;
      return object.weight * 0.5;
    }
  }
};

const services = [
  {
    inventory: {
      typeDefs: typeDefsInventory,
      resolvers: resolversInventory,
      underTest: true
    }
  },
  {
    products: {
      typeDefs: typeDefsProducts
    }
  }
];

// if you run setupSchema in beforeEach, you can be sure every test starts from a clean schema-state
// the tests will be a bit slower (20ms vs 10ms) though. In typical situation I suspect the clean state won't be necessary.
let inventory;

beforeEach(() => {
  setupSchema(services);
  inventory = [
    { upc: "1", inStock: true },
    { upc: "2", inStock: false },
    { upc: "3", inStock: true }
  ];
});

describe("Based on the mocked data from the external service", () => {
  const query = gql`
    {
      topProducts {
        name
        inStock
        shippingEstimate
      }
    }
  `;

  it("should construct its own response", async () => {
    const mocks = {
      Product: () => ({
        upc: "1",
        name: "Table",
        weight: 10,
        price: 10,
        elo: "",
        __typename: "Product"
      })
    };

    const result = await executeGraphql({ query, mocks });
    expect(result.data.topProducts[0]).toEqual({
      name: "Table",
      inStock: true,
      shippingEstimate: 5
    });
  });
  it("should construct a different response for a different mock", async () => {
    const mocks = {
      Product: () => ({
        upc: "1",
        name: "Table",
        weight: 10,
        price: 14000,
        elo: "",
        __typename: "Product"
      })
    };

    const result = await executeGraphql({ query, mocks });
    expect(result.data.topProducts[0]).toEqual({
      name: "Table",
      inStock: true,
      shippingEstimate: 0
    });
  });

  it("should not fail when the mocks are not explicit", async () => {
    // To start from a clean state and make sure the mocks are reset
    setupSchema(services);
    const result = await executeGraphql({ query });
    const product = result.data.topProducts[0];
    expect(product).toMatchObject({
      name: "Hello World"
    });
    expect(product.inStock).toBeDefined();
    expect(product.shippingEstimate).toBeDefined();
  });
});

test("should allow for using mutations, going across the services", async () => {
  const mocks = {
    Product: () => ({
      upc: "3",
      name: "Hello",
      weight: 10,
      price: 14000,
      elo: "",
      __typename: "Product"
    })
  };

  const mutation = gql`
    mutation addInventoryForProduct($upc: String!, $inStock: Boolean!) {
      addInventoryForProduct(upc: $upc, inStock: $inStock) {
        name
        inStock
      }
    }
  `;
  const variables = {
    upc: "4",
    inStock: false
  };

  const newServices = [
    {
      inventory: {
        typeDefs: typeDefsInventory,
        resolvers: resolversInventory,
        underTest: true
      }
    },
    {
      products: {
        typeDefs: typeDefsProducts
      }
    }
  ];

  setupSchema(newServices);

  const result = await executeGraphql({ mutation, variables, mocks });
  const product = result.data.addInventoryForProduct;
  expect(product.inStock).toEqual(false);
  expect(product.name).toEqual("Hello");
});

// You should probably NOT do tests like this, this is a sanity check for me to make sure everything is connected properly.
test("should allow for using mutations, having all resolvers implemented", async () => {
  const mutation = gql`
    mutation addInventoryForProduct($upc: String!, $inStock: Boolean!) {
      addInventoryForProduct(upc: $upc, inStock: $inStock) {
        name
        inStock
      }
    }
  `;
  const variables = {
    upc: "4",
    inStock: false
  };

  const newServices = [
    {
      inventory: {
        typeDefs: typeDefsInventory,
        resolvers: resolversInventory,
        underTest: true
      }
    },
    {
      products: {
        resolvers: {
          Product: {
            __resolveReference(object) {
              if (object.upc === "4") {
                return { name: "the correct name" };
              }
              throw new Error("something not connectected properly");
            }
          }
        },
        typeDefs: typeDefsProducts
      },
      underTest: true
    }
  ];

  setupSchema(newServices);

  const result = await executeGraphql({ mutation, variables });
  const product = result.data.addInventoryForProduct;
  expect(product.inStock).toEqual(false);
  expect(product.name).toEqual("the correct name");
});

// If this test fails make sure you ran
// npx run patch-package
// first, as we still need to patch the @apollo/gateway till the apollo guys release the new version
test("should allow mocking the context and passing it to the resolvers", async () => {
  const newServices = [
    {
      inventory: {
        typeDefs: typeDefsInventory,
        resolvers: {
          Mutation: {
            returnContext: (_, args, context) => context.stringToBeReturned
          }
        },
        underTest: true
      }
    },
    {
      products: {
        typeDefs: typeDefsProducts
      }
    }
  ];

  setupSchema(newServices);

  const mutation = gql`
    mutation returnContext {
      returnContext
    }
  `;
  const context = {
    stringToBeReturned: "Hello Universe!"
  }
  const result = await executeGraphql({ mutation, context });


  expect(result.data.returnContext).toEqual("Hello Universe!")

});
