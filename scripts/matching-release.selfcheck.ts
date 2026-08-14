import assert from "node:assert/strict";
import { matchingReleaseTestSupport } from "./verify-matching-release";

const atlasUri =
  "mongodb+srv://user:password@cluster0.example.mongodb.net/foreverapp_matching_test";
const localUri =
  "mongodb://127.0.0.1:27018/foreverapp_matching_test?replicaSet=rs0";

assert.deepEqual(matchingReleaseTestSupport.configuredMongoHosts(atlasUri), [
  "cluster0.example.mongodb.net",
]);
assert.equal(
  matchingReleaseTestSupport.hasAtlasTopologyEvidence(localUri, {
    setName: "rs0",
    hosts: ["127.0.0.1:27018"],
  }),
  false,
);
assert.equal(
  matchingReleaseTestSupport.hasAtlasTopologyEvidence(atlasUri, {
    setName: "atlas-example-shard-0",
    hosts: [
      "cluster0-shard-00-00.example.mongodb.net:27017",
      "cluster0-shard-00-01.example.mongodb.net:27017",
    ],
  }),
  true,
);
assert.equal(
  matchingReleaseTestSupport.hasAtlasTopologyEvidence(atlasUri, {
    setName: "spoofed-local",
    hosts: ["127.0.0.1:27017"],
  }),
  false,
);
assert.equal(
  matchingReleaseTestSupport.hasAtlasTopologyEvidence(atlasUri, {
    msg: "isdbgrid",
  }),
  true,
);
assert.equal(
  matchingReleaseTestSupport.hasAtlasTopologyEvidence(atlasUri, {}),
  false,
);

process.stdout.write("matching release selfcheck passed\n");
