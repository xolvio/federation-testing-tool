const gql = require("graphql-tag");
const { executeGraphql } = require("../");

const firstTypeDefs = gql`
  extend type Query {
    getFirstString: String
  }
`;

const secondTypeDefs = gql`
  extend type Query {
    getSecondString: String
  }
`;

const firstResolvers = {
  Query: {
    getFirstString: async (_, args, context) => {
      const value = await context.getSomeString();
      return value;
    }
  }
};

const secondResolvers = {
  Query: {
    getSecondString: async (_, args, context, info) => {
      return context.getSomeString();
    }
  }
};

const wait = () => new Promise(resolve => setTimeout(() => resolve(), 0));

const firstContext = {
  getSomeString: async () => {
    await wait();
    return "first string";
  }
};

const secondContext = {
  getSomeString: function() {
    return "second string";
  }
};

const services = [
  {
    inventory: {
      typeDefs: firstTypeDefs,
      resolvers: firstResolvers
    }
  },
  {
    products: {
      typeDefs: secondTypeDefs,
      resolvers: secondResolvers
    }
  }
];

test("first string", async () => {
  const query = gql`
    query {
      getFirstString
    }
  `;
  const result = await executeGraphql({
    services,
    query,
    context: firstContext
  });

  expect(result.data.getFirstString).toEqual("first string");
});

test("second string", async () => {
  const query = gql`
    query {
      getSecondString
    }
  `;
  const result = await executeGraphql({
    services,
    query,
    context: secondContext
  });

  expect(result.data.getSecondString).toEqual("second string");
});

const servicesWithContext = [
  {
    inventory: {
      typeDefs: firstTypeDefs,
      resolvers: firstResolvers,
      context: firstContext
    }
  },
  {
    products: {
      typeDefs: secondTypeDefs,
      resolvers: secondResolvers,
      context: secondContext
    }
  }
];

test("first string with merged context", async () => {
  const query = gql`
    query {
      getFirstString
    }
  `;
  const result = await executeGraphql({ services: servicesWithContext, query });

  expect(result.data.getFirstString).toEqual("first string");
});

test("second string with merged context", async () => {
  const query = gql`
    query {
      getSecondString
    }
  `;
  const result = await executeGraphql({ services: servicesWithContext, query });

  expect(result.data.getSecondString).toEqual("second string");
});
