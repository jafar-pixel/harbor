import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import relayTicket from "../api/relay-ticket.ts";

// A stand-in for the JL account service: each token is one person.
const PEOPLE: Record<string, { id: string; email: string; family: string | null }> = {
  owner: { id: "u-owner", email: "owner@example.com", family: "fam-1" },
  clone: { id: "u-clone", email: "clone@example.com", family: "fam-1" },
  other: { id: "u-other", email: "other@example.com", family: "fam-2" },
  shell: { id: "u-shell", email: "shell@example.com", family: null },
};

test("the relay: the owner and their family, nobody else", async () => {
  const accounts = createServer((req, res) => {
    const who = PEOPLE[(req.headers.authorization ?? "").replace("Bearer ", "")];
    if (!who) return void res.writeHead(401).end();
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url === "/auth/v1/user")
      return void res.end(JSON.stringify({ id: who.id, email: who.email }));
    if (req.url === "/rest/v1/rpc/my_family") {
      assert.equal(req.headers["accept-profile"], "media");
      return void res.end(JSON.stringify(who.family ? { id: who.family } : null));
    }
    res.end("null");
  });
  await new Promise<void>((r) => accounts.listen(0, "127.0.0.1", r));
  const port = (accounts.address() as { port: number }).port;
  Object.assign(process.env, {
    PLAYBACK_RELAY_KEY: "c".repeat(64),
    PLAYBACK_RELAY_BASE: "/secure",
    PLAYBACK_RELAY_USERS: "owner@example.com, family:FAM-1",
    VITE_JL_SUPABASE_URL: `http://127.0.0.1:${port}`,
    VITE_JL_SUPABASE_ANON_KEY: "anon",
  });
  const ask = (token: string) =>
    relayTicket(
      new Request("http://me/api/relay-ticket", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["http://provider.example/list.m3u"] }),
      }),
    ).then((r) => r.status);
  try {
    assert.equal(await ask("owner"), 200, "the owner, by email");
    assert.equal(await ask("clone"), 200, "a member of the owner's family");
    assert.equal(await ask("other"), 403, "someone in another family");
    assert.equal(await ask("shell"), 403, "an account with no family (a shell)");
    assert.equal(await ask("nobody"), 401, "not signed in");
  } finally {
    accounts.close();
  }
});
