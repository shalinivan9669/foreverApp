import assert from "node:assert/strict";
import {
  MatchingTestDatabaseGuardError,
  parseMatchingTestDatabaseUri,
} from "./lib/matching-test-database";

const accepted = [
  "mongodb://127.0.0.1:27018/foreverapp_matching_test?replicaSet=rs0",
  "mongodb+srv://example.invalid/foreverapp_matching_test?retryWrites=true",
];
for (const uri of accepted) {
  assert.equal(
    parseMatchingTestDatabaseUri(uri).databaseName,
    "foreverapp_matching_test",
  );
}

const rejected = [
  undefined,
  "",
  "https://example.invalid/foreverapp_matching_test",
  "mongodb://127.0.0.1:27017/",
  "mongodb://127.0.0.1:27017/admin",
  "mongodb://127.0.0.1:27017/foreverapp",
  "mongodb://127.0.0.1:27017/foreverapp_prod_test",
  "mongodb+srv://example.invalid/foreverapp_matching_test?directConnection=true",
];
for (const uri of rejected) {
  assert.throws(
    () => parseMatchingTestDatabaseUri(uri),
    MatchingTestDatabaseGuardError,
  );
}

console.log("matching test database guard selfcheck passed");
