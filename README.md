# testable-federation
Test your Apollo GraphQL Gateway / Federation micro services. 

Example Usage, for the [Federation Demo From Apollo](https://github.com/apollographql/federation-demo).

Demo with the whole repositorium, code examples, and walk-through tutorial coming this weekend! Stay tuned.

```javascript
const { executeGraphql, setupSchema } = require("testable-federation");
const { gql } = require("apollo-server");

// This setup should happen in an external, common test helper, so the actual test is clean and simple

const { typeDefs } = require("./schema");
const { resolvers } = require("./resolvers");

const { typeDefs: typeDefsProducts } = require("../products/schema");
const { resolvers: resolversProducts } = require("../products/resolvers");

const services = [
  { inventory: { typeDefs, resolvers } },
  {
    products: {
      typeDefs: typeDefsProducts,
      resolvers: resolversProducts
    }
  }
];

beforeAll(() => {
  setupSchema(services)
})

test("simple case with resolveReference", async () => {
  const query = gql`
    { 
      topProducts {
        name
        inStock
        shippingEstimate
      }
    }
  `;

  const { data } = await executeGraphql(query);
  
  expect(data.topProducts[0]).toEqual({
    name: "Table",
    inStock: true,
    shippingEstimate: 50
  });
});

test("simple mutation", async () => {
  const mutation = gql`
    mutation addProduct($name: String!) {
      addProduct(name: $name)
    }
  `;

  const variables = { name: "New ProductName" }
  const { data } = await executeGraphql(mutation, variables);
  
  expect(data).toEqual({ addProduct: "Added product: New ProductName" });

});
```
