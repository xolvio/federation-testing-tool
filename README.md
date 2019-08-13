# federation-testing-tool
Test your Apollo GraphQL Gateway / Federation micro services. With this package you don't have to worry about the whole complexity that comes with joining the GraphQL federated micro services and preparing them for testing. 

Install it with 
```bash 
npm install --save-dev federation-testing-tool
```

Example Usage, for the [Federation Demo From Apollo](https://github.com/apollographql/federation-demo).

Demo with the whole repositorium, code examples, and walk-through tutorial coming soon! Stay tuned.

![data flow](https://cdn-images-1.medium.com/max/1200/1*z8EJo-cCafi7tdyxOvW2_w.png)

Test services in isolation:
```javascript
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
```


Test services together:
```javascript
const { executeGraphql } = require("federation-testing-tool");
const { gql } = require("apollo-server");

const { typeDefs } = require("./schema");
const { resolvers } = require("./resolvers");

const { typeDefs: typeDefsProducts } = require("../products/schema");

const services = [
  { inventory: { typeDefs, resolvers } },
  {
    products: {
      typeDefs: typeDefsProducts
    }
  }
];

describe("Based on the data from the external service", () => {
  const query = gql`
    {
      topProducts {
        name
        inStock
        shippingEstimate
      }
    }
  `;

  it("should calculate the shipping estimate", async () => {
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

    const result = await executeGraphql({ query, mocks, services });
    expect(result.data.topProducts[0]).toEqual({
      name: "Table",
      inStock: true,
      shippingEstimate: 5
    });
  });
  it("should set the shippingEstimate at 0 for an expensive item", async () => {
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

    const result = await executeGraphql({ query, mocks, services });
    expect(result.data.topProducts[0]).toEqual({
      name: "Table",
      inStock: true,
      shippingEstimate: 0
    });
  });
});

```
