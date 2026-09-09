import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { getMatchingInbox } from "@/domain/services/matching/matchingApplication.service";
import { Like } from "@/models/Like";
import { MatchingConnection, type MatchingConnectionType } from "@/models/MatchingConnection";
import { User } from "@/models/User";

/** Execute the inbox reader against isolated model adapters; never open a DB. */
export async function checkMatchingInboxPausedConnections(): Promise<void> {
  const restores: Array<() => void> = [];
  const replace = (target: object, key: string, value: object) => {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    restores.push(() => {
      if (original) Object.defineProperty(target, key, original);
      else Reflect.deleteProperty(target, key);
    });
  };
  const actor = "inbox-owner";
  const peer = "inbox-peer";
  const makeConnection = (status: MatchingConnectionType["status"], participantIds: string[] = [actor, peer]) => ({
    _id: new Types.ObjectId(), participantIds, status, stage: "TALKING" as const,
    coupleConfirmation: { confirmedBy: [], revision: 0 },
  });
  const active = makeConnection("ACTIVE");
  const paused = makeConnection("PAUSED");
  const blocked = makeConnection("BLOCKED");
  const closed = makeConnection("CLOSED");
  const foreign = makeConnection("PAUSED", ["other-owner", peer]);
  const rows = [active, paused, blocked, closed, foreign];
  const oldUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://127.0.0.1:1/inbox_regression_no_network";
  try {
    replace(mongoose, "connect", async () => mongoose);
    replace(Like, "updateMany", async () => ({ modifiedCount: 0 }));
    replace(Like, "find", () => {
      const query = { sort: () => query, limit: () => query, lean: async () => [] };
      return query;
    });
    replace(User, "find", (filter: { id: { $in: string[] } }) => ({
      select: () => ({ lean: async () => filter.id.$in.map((id) => ({ id, username: "Участник", avatar: "" })) }),
    }));
    replace(MatchingConnection, "find", (filter: { participantIds: string; status: { $in: string[] } }) => {
      let limit = Number.MAX_SAFE_INTEGER;
      const query = {
        sort: () => query,
        limit: (value: number) => { limit = value; return query; },
        lean: async () => rows.filter((row) => row.participantIds.includes(filter.participantIds) && filter.status.$in.includes(row.status)).slice(0, limit),
      };
      return query;
    });
    for (let reload = 0; reload < 2; reload += 1) {
      const inbox = await getMatchingInbox({ currentUserId: actor, limit: 20 });
      const savedPause = inbox.connections.find((item) => item.id === String(paused._id));
      assert.ok(savedPause, "A paused connection must remain discoverable after loading/reloading the inbox");
      assert.deepEqual(savedPause.allowedActions, ["RESUME", "CLOSE"]);
      assert.deepEqual(inbox.connections.map((item) => item.id), [active, paused, blocked].map((row) => String(row._id)), "Keep the existing active/blocked records, exclude closed and foreign connections");
    }
  } finally {
    restores.reverse().forEach((restore) => restore());
    if (oldUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = oldUri;
  }
}
