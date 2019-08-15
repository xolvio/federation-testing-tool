const { buildContextsPerService } = require("./buildContextsPerService");

test("works when with contexts", () => {
  const servicesWithContext = [
    {
      inventory: {
        context: { inventoryContext: true }
      }
    },
    {
      products: {
        context: { productsContext: true }
      }
    },
    { otherServiceWithNoContext: {} }
  ];
  const expectedContextsPerService = {
    inventory: servicesWithContext[0].inventory.context,
    products: servicesWithContext[1].products.context
  };

  expect(buildContextsPerService(servicesWithContext)).toEqual(
    expectedContextsPerService
  );
});

test("works without contexts", () => {
  const servicesWithContext = [
    {
      inventory: {}
    },
    {
      products: {}
    },
    { otherServiceWithNoContext: {} }
  ];

  expect(buildContextsPerService(servicesWithContext)).toEqual({});
});
