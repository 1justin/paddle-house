// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleInquiry, type Env } from "../src/lib/inquiry.ts";

const ENV: Env = {
  RESEND_API_KEY: "re_test",
  INQUIRY_TO: "hosts@example.com",
  INQUIRY_FROM: "The Paddle House <hello@playatgoosehill.com>",
  ALERT_TO: "justin@example.com, hosts@example.com",
};

const GUEST = { name: "Jane Guest", email: "jane@example.com", dates: "A weekend in May", notes: "Six players" };

/** Fake Resend: answers each call with the next scripted reply and records what was sent. */
function fakeResend(...replies: Array<number | "network">) {
  const calls: any[] = [];
  const doFetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    const reply = replies.shift() ?? 200;
    if (reply === "network") throw new TypeError("fetch failed");
    return new Response(reply === 200 ? '{"id":"1"}' : '{"message":"boom"}', { status: reply });
  }) as typeof fetch;
  return { doFetch, calls };
}

test("delivers the inquiry to the hosts, no alert", async () => {
  const { doFetch, calls } = fakeResend(200);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].to, ["hosts@example.com"]);
  assert.equal(calls[0].reply_to, "jane@example.com");
});

test("retries once on a Resend blip, no alert", async () => {
  const { doFetch, calls } = fakeResend(503, 200);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => !c.subject.startsWith("Action needed")));
});

test("Resend rejects the inquiry -> alert carries the problem and the full inquiry", async () => {
  const { doFetch, calls } = fakeResend(422, 200);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.deepEqual(res, { status: 200, body: { ok: true } }); // hosts got it via the alert
  const alert = calls[1];
  assert.match(alert.subject, /^Action needed: website form failed \(inquiry from Jane Guest\)/);
  assert.deepEqual(alert.to, ["justin@example.com", "hosts@example.com"]);
  assert.equal(alert.reply_to, "jane@example.com");
  assert.match(alert.text, /Resend returned 422/);
  assert.match(alert.text, /A weekend in May/);
  assert.match(alert.text, /Six players/);
});

test("missing INQUIRY_TO -> alert fires without trying the normal send", async () => {
  const { doFetch, calls } = fakeResend(200);
  const res = await handleInquiry(GUEST, { ...ENV, INQUIRY_TO: "" }, doFetch);
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /Form settings missing/);
});

test("network down twice -> alert", async () => {
  const { doFetch, calls } = fakeResend("network", "network", 200);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.equal(res.body.ok, true);
  assert.match(calls[2].text, /Could not reach Resend/);
});

test("our sender rejected -> alert retries from Resend's shared sender", async () => {
  const { doFetch, calls } = fakeResend(403, 403, 200);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.equal(res.body.ok, true);
  assert.match(calls[2].from, /onboarding@resend\.dev/);
});

test("everything fails -> guest sees the error and the backup email", async () => {
  const { doFetch } = fakeResend(403, 403, 403);
  const res = await handleInquiry(GUEST, ENV, doFetch);
  assert.equal(res.status, 502);
  assert.equal(res.body.ok, false);
});

test("no API key -> nothing can send, guest sees the error", async () => {
  const { doFetch, calls } = fakeResend();
  const res = await handleInquiry(GUEST, { ...ENV, RESEND_API_KEY: "" }, doFetch);
  assert.equal(res.status, 502);
  assert.equal(calls.length, 0);
});

test("honeypot and bad input never send", async () => {
  const { doFetch, calls } = fakeResend();
  assert.equal((await handleInquiry({ ...GUEST, website: "spam" }, ENV, doFetch)).status, 200);
  assert.equal((await handleInquiry({ ...GUEST, email: "nope" }, ENV, doFetch)).status, 400);
  assert.equal(calls.length, 0);
});
