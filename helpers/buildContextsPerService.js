exports.buildContextsPerService = (servicesWithContext = []) => {
  return servicesWithContext.reduce((total, current) => {
    const serviceName = Object.keys(current)[0];
    if (current[serviceName].context) {
      return { ...total, [serviceName]: current[serviceName].context };
    }
    return total;
  }, {});
};
