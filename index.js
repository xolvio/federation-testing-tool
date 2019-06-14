const {
  LocalGraphQLDataSource,
  buildOperationContext,
  buildQueryPlan,
  executeQueryPlan
} = require("@apollo/gateway");

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
      serviceMap[serviceName] = buildLocalService([
        service[serviceName]
      ]);
    });

    let composed = composeServices(
      Object.entries(serviceMap).map(([serviceName, service]) => ({
        name: serviceName,
        typeDefs: service.sdl()
      }))
    );

    if (composed.errors && composed.errors.length > 0) {
      throw new Error(JSON.stringify(composed.errors));
    }
    schema = composed.schema;
  },
  executeGraphql: (query, variables, context) => {
    const operationContext = buildOperationContext(schema, query);
    const queryPlan = buildQueryPlan(operationContext);

    return executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(variables, context),
      operationContext
    );
  }
};
