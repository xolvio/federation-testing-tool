const gql = require("graphql-tag");
const { executeGraphql } = require("../");

const typeDefs = gql`
  extend type Product @key(fields: "upc") {
    upc: String! @external
    weight: Int @external
    price: Int @external
    inStock: Boolean
    shippingEstimate: Int @requires(fields: "price weight")
  }
`;

let inventory = [
  { upc: "1", inStock: true },
  { upc: "2", inStock: false },
  { upc: "3", inStock: true }
];

const resolvers = {
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

const service = {
  typeDefs,
  resolvers
};

describe("Based on the data from the external service", () => {
  const query = gql`
    {
      _getProduct {
        inStock
        shippingEstimate
      }
    }
  `;

  it("should set the shippingEstimate at 0 for an expensive item and retrieve inStock", async () => {
    const mocks = {
      Product: () => ({
        upc: "1",
        weight: 10,
        price: 14000,
      })
    };

    const result = await executeGraphql({ query, mocks, service });
    console.log(result)
    expect(result.data._getProduct.shippingEstimate).toEqual(0);
    expect(result.data._getProduct).toEqual({
      inStock: true,
      shippingEstimate: 0
    });
  });

  it("should calculate the shipping estimate for cheap item", async () => {
    const mocks = {
      Product: () => ({
        upc: "1",
        weight: 10,
        price: 10,
      })
    };

    const result = await executeGraphql({ query, mocks, service });
    expect(result.data._getProduct.shippingEstimate).toEqual(5);
  });
});
