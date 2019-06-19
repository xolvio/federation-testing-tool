# federation-testing-tool
Test your Apollo GraphQL Gateway / Federation micro services. With this package you don't have to worry about the whole complexity that comes with joining the GraphQL federated micro services and preparing them for testing. 

### NOTE: THIS IS NOT READY YET. I'M OPEN FOR FEEDBACK, BUT PLEASE BE AWARE THAT THE API KEEPS CHANGING EVERYDAY. I DIDN'T EXPECT PEOPLE TO START USING IT! I PLAN TO RELEASE A TUTORIAL THIS COMING WEEKEND AND BY THAT TIME THE PACKAGE WILL BE READY. STAY TUNED.

Install it with 
```bash 
npm install --save-dev federation-testing-tool
```

Example Usage, for the [Federation Demo From Apollo](https://github.com/apollographql/federation-demo).

Demo with the whole repositorium, code examples, and walk-through tutorial coming this weekend! Stay tuned.

```javascript
const { executeGraphql } = require("federation-testing-tool");
const { gql } = require("apollo-server");

const { typeDefs } = require("./schema");
const { resolvers } = require("./resolvers");

const { typeDefs: typeDefsProducts } = require("../products/schema");

const services = [
  { inventory: { typeDefs, resolvers, underTest: true } },
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
