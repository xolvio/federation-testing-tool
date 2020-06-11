const stackTrace = require("stack-trace");
const {
  LocalGraphQLDataSource,
  buildOperationContext,
  buildQueryPlan,
} = require("@apollo/gateway");
const { addMocksToSchema, addResolversToSchema } = require("graphql-tools");
const { print } = require("graphql");
const {
  buildFederatedSchema,
  composeAndValidate
} = require("@apollo/federation");
const clone = require("clone");
const gql = require("graphql-tag");
const cloneDeepWith = require("lodash.clonedeepwith");
const isFunction = require("lodash.isfunction");
const { executeQueryPlan } = require("./helpers/executeQueryPlan")

const {
  buildContextsPerService
} = require("./helpers/buildContextsPerService");

function buildLocalService(modules) {
  const schema = buildFederatedSchema(modules);
  return new LocalGraphQLDataSource(schema);
}

const isEmpty = obj =>
  !obj || (Object.entries(obj).length === 0 && obj.constructor === Object);

function buildRequestContext(variables, singleContext, contextsPerService) {
  let context;

  if (isEmpty(contextsPerService)) {
    context = singleContext;
  } else {
    context = new Proxy(
      {},
      {
        get: (obj, prop) => {
          const trace = stackTrace.get();
          if (trace[1].getFunction() && trace[1].getFunction().__service__) {
            return contextsPerService[trace[1].getFunction().__service__][prop];
          }
          return prop in obj ? obj[prop] : null;
        }
      }
    );
  }

  return {
    cache: undefined,
    context,
    request: {
      variables
    }
  };
}

function prepareProviderService(service) {
  let allTypeNames = [];
  const typeDefsForMockedService = clone(service.typeDefs);

  typeDefsForMockedService.definitions = typeDefsForMockedService.definitions
    .filter(
      d => d.name && d.name.value !== "Query" && d.name.value !== "Mutation"
    )
    .filter(d => d.kind === "ObjectTypeExtension");

  typeDefsForMockedService.definitions.forEach(def => {
    def.kind = "ObjectTypeDefinition";
    allTypeNames.push(def.name.value);

    def.fields = def.fields.filter(f =>
      f.directives.find(d => d.name.value === "external")
    );
    def.fields.forEach(f => {
      f.directives = f.directives.filter(d => d.name.value !== "external");
    });
  });

  if (allTypeNames.length) {
    const typesQueries = allTypeNames.map(n => `_get${n}: ${n}`).join("\n");
    const newTypeDefString = `
        extend type Query {
          ${typesQueries}
        }
        ${print(typeDefsForMockedService)}
      `;

    // I'm doing it like this because otherwise IDE screams at me for an incorrect GraphQL string
    let newTypeDefs = gql`
      ${newTypeDefString}
    `;

    return {
      __provider: {
        typeDefs: newTypeDefs
      }
    };
  }
  return undefined;
}

const setupSchema = serviceOrServices => {
  let services;
  if (!serviceOrServices.length) {
    services = [
      {
        serviceUnderTest: {
          resolvers: serviceOrServices.resolvers,
          typeDefs: serviceOrServices.typeDefs,
          addMocks: serviceOrServices.addMocks
        }
      }
    ];
    const providerService = prepareProviderService(serviceOrServices);
    if (providerService) {
      services.push(providerService);
    }
  } else {
    services = serviceOrServices;
  }

  let serviceMap = {};
  services.forEach(service => {
    let serviceName = Object.keys(service)[0];
    if (!service[serviceName].resolvers) {
      service[serviceName].addMocks = true;
    }
    serviceMap[serviceName] = buildLocalService([service[serviceName]]);
    serviceMap[serviceName].__addMocks__ = service[serviceName].addMocks;
  });

  let mapForComposeServices = Object.entries(serviceMap).map(
    ([serviceName, service]) => ({
      name: serviceName,
      typeDefs: service.sdl()
    })
  );

  let composed = composeAndValidate(mapForComposeServices);

  if (composed.errors && composed.errors.length > 0) {
    throw new Error(JSON.stringify(composed.errors));
  }
  return { schema: composed.schema, serviceMap };
};

function setupMocks(serviceMap, mocks) {
  Object.values(serviceMap).forEach(service => {

    let resolvers = {};
    if (service.__addMocks__) {

      Object.entries(mocks).forEach(([type, value]) => {
        resolvers[type] = {
          __resolveReference() {
            return value();
          }
        };
      });
      service.schema = addResolversToSchema(service.schema, resolvers);
      service.schema = addMocksToSchema({
        schema: service.schema,
        preserveResolvers: true,
        mocks
      });

    }
  });
}

function execute(
  schema,
  query,
  mutation,
  serviceMap,
  variables,
  context,
  contextsPerService
) {
  const operationContext = buildOperationContext(schema, query || mutation);
  const queryPlan = buildQueryPlan(operationContext);

  return executeQueryPlan(
    queryPlan,
    serviceMap,
    buildRequestContext(variables, context, contextsPerService),
    operationContext
  );
}

function validateArguments(
  services,
  service,
  schema,
  serviceMap,
  query,
  mutation
) {
  if (!(services || service)) {
    if (!schema) {
      throw new Error(
        "You need to pass either services array to prepare your schema, or the schema itself, generated by the setupSchema function"
      );
    }
    if (!serviceMap) {
      throw new Error(
        "You need to pass the serviceMap generated by the setupSchema function along with your schema"
      );
    }
  }
  if (!(query || mutation)) {
    throw new Error("Make sure you pass a query or a mutation");
  }
}

const executeGraphql = async ({
  query,
  mutation,
  variables,
  context,
  services,
  mocks = {},
  schema,
  serviceMap,
  service
}) => {
  validateArguments(services, service, schema, serviceMap, query, mutation);

  if (services || service) {
    ({ serviceMap, schema } = setupSchema(services || service));
  }

  setupMocks(serviceMap, mocks);

  const contextsPerService = services
    ? buildContextsPerService(services)
    : null;

  if (services) {
    addServiceInformationToResolvers(services);
  }


  const prepareError = new Error("");
  const splitLines = prepareError.stack.split("\n").slice(2);
  let result;
  try {
    result = await execute(
      schema,
      query,
      mutation,
      serviceMap,
      variables,
      context,
      contextsPerService
    );
    if (result.errors) {
      if (result.errors.length === 1) {
        result.errors[0].message = result.errors[0].message + `, path: ${result.errors[0].path}`
        throw result.errors[0];
      } else {
        throw new Error(result.errors.map((e) => `${e.message}, path: ${e.path}`).join(","));
      }
    }
  } catch (e) {
    const smallStack = e.stack.split("\n");
    e.stack = [...smallStack, ...splitLines]
      .filter((l) => l.indexOf("node_modules") === -1)
      .join("\n");
    e.message = e.message.split("\n")[0];
    throw e;
  }
  return result;
};

function addServiceInformationToResolvers(services) {
  services.forEach(s => {
    const serviceName = Object.keys(s)[0];
    if (s[serviceName].resolvers) {
      s[serviceName].resolvers = cloneDeepWith(s[serviceName].resolvers, el => {
        if (isFunction(el)) {
          el.__service__ = serviceName;
          return el;
        }
      });
    }
  });
}

module.exports = {
  setupSchema,
  executeGraphql
};
