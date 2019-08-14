const gql = require("graphql-tag");
const { executeGraphql } = require("../");

const schemaWithSchemaQuery = gql`
  type Query {
    GetUser: User
  }

  type User {
    id: ID!
    name: String
  }

  schema {
    query: Query
  }
`;

test("It skips the problematic top level schema field", async () => {
  const query = gql`
    query {
      GetUser {
        name
      }
    }
  `;
  const result = await executeGraphql({
    query,
    service: { typeDefs: schemaWithSchemaQuery }
  });

  expect(result).toEqual({ data: { GetUser: { name: "Hello World" } } });
});
