const {
  LocalGraphQLDataSource,
  buildOperationContext,
  buildQueryPlan,
  executeQueryPlan
} = require("@apollo/gateway");
const { addMockFunctionsToSchema } = require("graphql-tools");
const { addResolversToSchema } = require("apollo-graphql");

const { buildFederatedSchema, composeServices } = require("@apollo/federation");

function buildLocalService(modules) {
  const schema = buildFederatedSchema(modules);
  return new LocalGraphQLDataSource(schema);
}

function buildRequestContext(variables, context) {
  return {
    cache: undefined,
    context,
    request: {
      variables
    }
  };
}

let schema;
let serviceMap = {};

module.exports = {
  setupSchema: (services) => {
    services.forEach(service => {
      let serviceName = Object.keys(service)[0];
      serviceMap[serviceName] = buildLocalService([service[serviceName]]);
      serviceMap[serviceName].__underTest__ = service[serviceName].underTest
    });

    let mapForComposeServices = Object.entries(serviceMap).map(
      ([serviceName, service]) => ({
        name: serviceName,
        typeDefs: service.sdl()
      })
    );

    let composed = composeServices(mapForComposeServices);

    if (composed.errors && composed.errors.length > 0) {
      throw new Error(JSON.stringify(composed.errors));
    }
    schema = composed.schema;
  },
  executeGraphql: ({ query, mutation, variables, context, mocks }) => {
    Object.values(serviceMap).forEach((service) => {
      let resolvers = {}
      if (!service.__underTest__) {
        Object.entries(mocks).forEach(([type, value]) => {
          resolvers[type] = {
            __resolveReference() {
              return value();
            }
          };
        });
        addResolversToSchema(service.schema, resolvers);
      }
      addMockFunctionsToSchema({
        schema: service.schema,
        preserveResolvers: true,
        mocks
      });
    });

    const operationContext = buildOperationContext(schema, query || mutation);
    const queryPlan = buildQueryPlan(operationContext);

    return executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(variables, context),
      operationContext
    );
  }
};
