import assert from "node:assert/strict";
import test from "node:test";
import { getRequestUser } from "../lib/request-auth";

test("localhost requests use the local demo identity", async () => {
  assert.deepEqual(await getRequestUser(new Request("http://localhost:3000/api/game")), {
    id: "local-demo-user",
    email: "local@pokernight.test",
    displayName: "本地房主",
  });
});

test("remote requests without platform identity remain unauthenticated", async () => {
  assert.equal(
    await getRequestUser(new Request("https://example.com/api/game")),
    null,
  );
});

test("platform identity takes precedence on localhost", async () => {
  const request = new Request("http://localhost:3000/api/game", {
    headers: {
      "oai-authenticated-user-id": "real-user",
      "oai-authenticated-user-email": "real@example.com",
      "oai-authenticated-user-full-name": encodeURIComponent("真实玩家"),
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });

  assert.deepEqual(await getRequestUser(request), {
    id: "real-user",
    email: "real@example.com",
    displayName: "真实玩家",
  });
});
