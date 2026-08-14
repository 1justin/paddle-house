import type { APIRoute } from "astro";
import { env as workerEnv } from "cloudflare:workers";

export const prerender = false;

/**
 * Inquiry endpoint. Sends the note to John & Erin (and Justin) via Resend.
 * Required Worker secrets (set with `npx wrangler secret put <NAME>`):
 *   RESEND_API_KEY  - API key from resend.com
 *   INQUIRY_TO      - comma-separated recipient email(s)
 * Optional:
 *   INQUIRY_FROM    - verified sender, defaults to Resend's onboarding sender
 */
export const POST: APIRoute = async ({ request }) => {
  const env = workerEnv as Record<string, string | undefined>;

  let data: Record<string, string>;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  // Honeypot: real guests never fill this field.
  if (data.website) return json({ ok: true });

  const name = (data.name ?? "").trim().slice(0, 200);
  const email = (data.email ?? "").trim().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "Name and a valid email are required." }, 400);
  }

  const field = (v: unknown, max = 500) =>
    String(v ?? "").trim().slice(0, max) || "(not given)";

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Dates: ${field(data.dates)}`,
    `Group: ${field(data.groupType)}`,
    `Guests: ${field(data.guests, 10)}`,
    `Paddle players: ${field(data.players, 10)}`,
    "",
    "Notes:",
    field(data.notes, 4000),
  ];

  if (!env.RESEND_API_KEY || !env.INQUIRY_TO) {
    console.error("inquire: missing RESEND_API_KEY or INQUIRY_TO secret");
    return json({ ok: false, error: "The form isn't set up yet. Please email us directly." }, 500);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.INQUIRY_FROM || "Paddle House <onboarding@resend.dev>",
      to: String(env.INQUIRY_TO).split(",").map((s: string) => s.trim()),
      reply_to: email,
      subject: `Paddle House inquiry: ${name}${data.dates ? ` (${field(data.dates, 100)})` : ""}`,
      text: lines.join("\n"),
    }),
  });

  if (!res.ok) {
    console.error("inquire: resend failed", res.status, await res.text());
    return json({ ok: false, error: "We couldn't send your note. Please email us directly." }, 502);
  }

  return json({ ok: true });
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
