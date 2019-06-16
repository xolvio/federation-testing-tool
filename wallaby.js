module.exports = function(wallaby) {
  return {
    files: [
      "index.js"
    ],
    tests: [
      "tests/*.js",
    ],

    env: {
      type: "node",
      runner: "node"
    },

    testFramework: "jest"
  };
};
