"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_env_1 = require("apollo-server-env");
const graphql_1 = require("graphql");
const apollo_engine_reporting_protobuf_1 = require("apollo-engine-reporting-protobuf");
const federation_1 = require("@apollo/federation");
const deepMerge_1 = require("@apollo/gateway/dist/utilities/deepMerge");
const graphql_2 = require("@apollo/gateway/dist/utilities/graphql");
async function executeQueryPlan(queryPlan, serviceMap, requestContext, operationContext) {
  const errors = [];
  const context = {
    queryPlan,
    operationContext,
    serviceMap,
    requestContext,
    errors,
  };
  let data = Object.create(null);
  const captureTraces = !!(requestContext.metrics && requestContext.metrics.captureTraces);
  if (queryPlan.node) {
    const traceNode = await executeNode(context, queryPlan.node, data, [], captureTraces);
    if (captureTraces) {
      requestContext.metrics.queryPlanTrace = traceNode;
    }
  }
  try {
    ({ data } = await graphql_1.execute({
      schema: operationContext.schema,
      document: {
        kind: graphql_1.Kind.DOCUMENT,
        definitions: [
          operationContext.operation,
          ...Object.values(operationContext.fragments),
        ],
      },
      rootValue: data,
      variableValues: requestContext.request.variables,
      fieldResolver: exports.defaultFieldResolverWithAliasSupport,
    }));
  }
  catch (error) {
    throw new Error("instead of catching...")
    return { errors: [error] };
  }
  return errors.length === 0 ? { data } : { errors, data };
}
exports.executeQueryPlan = executeQueryPlan;
async function executeNode(context, node, results, path, captureTraces) {
  if (!results) {
    return new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode();
  }
  switch (node.kind) {
    case 'Sequence': {
      const traceNode = new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode.SequenceNode();
      for (const childNode of node.nodes) {
        const childTraceNode = await executeNode(context, childNode, results, path, captureTraces);
        traceNode.nodes.push(childTraceNode);
      }
      return new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode({ sequence: traceNode });
    }
    case 'Parallel': {
      const childTraceNodes = await Promise.all(node.nodes.map(async (childNode) => executeNode(context, childNode, results, path, captureTraces)));
      return new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode({
        parallel: new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode.ParallelNode({
          nodes: childTraceNodes,
        }),
      });
    }
    case 'Flatten': {
      return new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode({
        flatten: new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode.FlattenNode({
          responsePath: node.path.map(id => new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode.ResponsePathElement(typeof id === 'string' ? { fieldName: id } : { index: id })),
          node: await executeNode(context, node.node, flattenResultsAtPath(results, node.path), [...path, ...node.path], captureTraces),
        }),
      });
    }
    case 'Fetch': {
      const traceNode = new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode.FetchNode({
        serviceName: node.serviceName,
      });
      try {
        await executeFetch(context, node, results, path, captureTraces ? traceNode : null);
      }
      catch (error) {
        context.errors.push(error);
      }
      return new apollo_engine_reporting_protobuf_1.Trace.QueryPlanNode({ fetch: traceNode });
    }
  }
}
async function executeFetch(context, fetch, results, _path, traceNode) {
  const logger = context.requestContext.logger || console;
  const service = context.serviceMap[fetch.serviceName];
  if (!service) {
    throw new Error(`Couldn't find service with name "${fetch.serviceName}"`);
  }
  const entities = Array.isArray(results) ? results : [results];
  if (entities.length < 1)
    return;
  let variables = Object.create(null);
  if (fetch.variableUsages) {
    for (const variableName of Object.keys(fetch.variableUsages)) {
      const providedVariables = context.requestContext.request.variables;
      if (providedVariables &&
        typeof providedVariables[variableName] !== 'undefined') {
        variables[variableName] = providedVariables[variableName];
      }
    }
  }
  if (!fetch.requires) {
    const dataReceivedFromService = await sendOperation(context, fetch.source, variables);
    for (const entity of entities) {
      deepMerge_1.deepMerge(entity, dataReceivedFromService);
    }
  }
  else {
    const requires = fetch.requires;
    const representations = [];
    const representationToEntity = [];
    entities.forEach((entity, index) => {
      const representation = executeSelectionSet(entity, requires);
      if (representation && representation[graphql_1.TypeNameMetaFieldDef.name]) {
        representations.push(representation);
        representationToEntity.push(index);
      }
    });
    if ('representations' in variables) {
      throw new Error(`Variables cannot contain key "representations"`);
    }
    const dataReceivedFromService = await sendOperation(context, fetch.source, { ...variables, representations });
    if (!dataReceivedFromService) {
      return;
    }
    if (!(dataReceivedFromService._entities &&
      Array.isArray(dataReceivedFromService._entities))) {
      throw new Error(`Expected "data._entities" in response to be an array`);
    }
    const receivedEntities = dataReceivedFromService._entities;
    if (receivedEntities.length !== representations.length) {
      throw new Error(`Expected "data._entities" to contain ${representations.length} elements`);
    }
    for (let i = 0; i < entities.length; i++) {
      deepMerge_1.deepMerge(entities[representationToEntity[i]], receivedEntities[i]);
    }
  }
  async function sendOperation(context, source, variables) {
    var _a, _b;
    let http;
    if (traceNode) {
      http = {
        headers: new apollo_server_env_1.Headers({ 'apollo-federation-include-trace': 'ftv1' }),
      };
      if (context.requestContext.metrics &&
        context.requestContext.metrics.startHrTime) {
        traceNode.sentTimeOffset = durationHrTimeToNanos(process.hrtime(context.requestContext.metrics.startHrTime));
      }
      traceNode.sentTime = dateToProtoTimestamp(new Date());
    }
    const response = await service.process({
      request: {
        query: source,
        variables,
        http,
      },
      context: context.requestContext.context,
    });
    if (response.errors) {
      // response.errors.forEach(e => {
      //     if (e.stack) {
      //         console.log("e.stack", e.stack)
      //     }
      // })
      const errors = response.errors.map(error => downstreamServiceError(error.message, fetch.serviceName, source, variables, error.extensions, error.path));
      context.errors.push(...response.errors);
    }
    if (traceNode) {
      traceNode.receivedTime = dateToProtoTimestamp(new Date());
      if (response.extensions && response.extensions.ftv1) {
        const traceBase64 = response.extensions.ftv1;
        let traceBuffer;
        let traceParsingFailed = false;
        try {
          traceBuffer = Buffer.from(traceBase64, 'base64');
        }
        catch (err) {
          logger.error(`error decoding base64 for federated trace from ${fetch.serviceName}: ${err}`);
          traceParsingFailed = true;
        }
        if (traceBuffer) {
          try {
            const trace = apollo_engine_reporting_protobuf_1.Trace.decode(traceBuffer);
            traceNode.trace = trace;
          }
          catch (err) {
            logger.error(`error decoding protobuf for federated trace from ${fetch.serviceName}: ${err}`);
            traceParsingFailed = true;
          }
        }
        if (traceNode.trace) {
          const rootTypeName = federation_1.defaultRootOperationNameLookup[context.operationContext.operation.operation];
          (_b = (_a = traceNode.trace.root) === null || _a === void 0 ? void 0 : _a.child) === null || _b === void 0 ? void 0 : _b.forEach((child) => {
            child.parentType = rootTypeName;
          });
        }
        traceNode.traceParsingFailed = traceParsingFailed;
      }
    }
    return response.data;
  }
}
function executeSelectionSet(source, selectionSet) {
  const result = Object.create(null);
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case graphql_1.Kind.FIELD:
        const responseName = graphql_2.getResponseName(selection);
        const selectionSet = selection.selectionSet;
        if (source === null) {
          result[responseName] = null;
          break;
        }
        if (typeof source[responseName] === 'undefined') {
          throw new Error(`Field "${responseName}" was not found in response.`);
        }
        if (Array.isArray(source[responseName])) {
          result[responseName] = source[responseName].map((value) => selectionSet ? executeSelectionSet(value, selectionSet) : value);
        }
        else if (selectionSet) {
          result[responseName] = executeSelectionSet(source[responseName], selectionSet);
        }
        else {
          result[responseName] = source[responseName];
        }
        break;
      case graphql_1.Kind.INLINE_FRAGMENT:
        if (!selection.typeCondition)
          continue;
        const typename = source && source['__typename'];
        if (!typename)
          continue;
        if (typename === selection.typeCondition.name.value) {
          deepMerge_1.deepMerge(result, executeSelectionSet(source, selection.selectionSet));
        }
        break;
    }
  }
  return result;
}
function flattenResultsAtPath(value, path) {
  if (path.length === 0)
    return value;
  if (value === undefined || value === null)
    return value;
  const [current, ...rest] = path;
  if (current === '@') {
    return value.flatMap((element) => flattenResultsAtPath(element, rest));
  }
  else {
    return flattenResultsAtPath(value[current], rest);
  }
}
function downstreamServiceError(message, serviceName, query, variables, extensions, path) {
  if (!message) {
    message = `Error while fetching subquery from service "${serviceName}"`;
  }
  extensions = {
    code: 'DOWNSTREAM_SERVICE_ERROR',
    serviceName,
    query,
    variables,
    ...extensions,
  };
  return new graphql_1.GraphQLError(message, undefined, undefined, undefined, path, undefined, extensions);
}
exports.defaultFieldResolverWithAliasSupport = function (source, args, contextValue, info) {
  if (typeof source === 'object' || typeof source === 'function') {
    const property = source[info.path.key];
    if (typeof property === 'function') {
      return source[info.fieldName](args, contextValue, info);
    }
    return property;
  }
};
function durationHrTimeToNanos(hrtime) {
  return hrtime[0] * 1e9 + hrtime[1];
}
function dateToProtoTimestamp(date) {
  const totalMillis = +date;
  const millis = totalMillis % 1000;
  return new apollo_engine_reporting_protobuf_1.google.protobuf.Timestamp({
    seconds: (totalMillis - millis) / 1000,
    nanos: millis * 1e6,
  });
}
//# sourceMappingURL=executeQueryPlan.js.map
