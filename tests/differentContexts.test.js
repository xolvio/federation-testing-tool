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

const firstResolvesr = {
  Query: {
    getFirstString: (_, args, context) => {
      try {
        console.log("GOZDECKI context.getSome()", context.getSome())
      } catch(e) {
        console.log("GOZDECKI e", e)
      }
      return context.getSome();
    }
  }
};
var stackTrace = require('stack-trace');
const secondResolvers = {
  Query: {
    getSecondString: (_, args, context, info) => {
      return context.getSomethingElse();
    }
  }
};

secondResolvers.Query.getSecondString.__service = "products"
firstResolvesr.Query.getFirstString.__service = "inventory"

// var stackTrace = require('stack-trace');


const firstContext = {
  getSome: () => {
    var trace = stackTrace.get();
    // console.log("GOZDECKI trace.length", trace.length)
    trace.forEach((t, index) => {
      if (t.getThis()) {
        // console.log("GOZDECKI ", index)
        // console.log("GOZDECKI t.getThis()", t.getThis())
      }
      if (t.getFileName()) {
        // console.log("GOZDECKI ", index)
        // console.log("GOZDECKI t.fileName()", t.getFileName())
      }
    })
    return "first string";
  }
};

const secondContext = {
  getSomethingElse: function () {
    var trace = stackTrace.get();

    console.log(trace[1].getFunction().__service)
    // console.log("GOZDECKI arguments.callee.caller.name", arguments.callee.caller.__name)
    // console.log("GOZDECKI this", this)
    return "second string";
  }
};

const services = [
  {
    inventory: {
      typeDefs: firstTypeDefs,
      resolvers: firstResolvesr
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
      resolvers: firstResolvesr,
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


// try async/await
