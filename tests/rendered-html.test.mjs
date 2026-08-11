import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the anonymous Lucky Poker route", async () => {
  const response = await render("/lucky");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Lucky Poker/i);
  assert.match(html, /lucky-loading/);
  assert.doesNotMatch(html, /充值|提现|真实货币/);
});

test("keeps the local controller split into typed modules", async () => {
  const [client, defaults, storage, types, wheel, readme] = await Promise.all([
    readFile(new URL("../app/lucky/lucky-poker-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/lucky-defaults.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/lucky-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/lucky-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/lucky-wheel.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(client, /PokerWheel/);
  assert.match(defaults, /defaultWheelEffects/);
  assert.match(storage, /lucky-poker-state-v1/);
  assert.match(types, /interface LuckyGameState/);
  assert.match(wheel, /weightedPick/);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /localStorage/);
});
