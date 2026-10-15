/**
 * Inquiry delivery with a failure alarm.
 *
 * Normal path: email the guest's note to INQUIRY_TO via Resend.
 * If that fails (missing settings, Resend error, network error), email an
 * alert to ALERT_TO with what broke AND the full inquiry, so no lead is lost.
 * When the alert gets through, the hosts have the note, so the guest sees
 * success instead of a dead end.
 *
 * Settings (Cloudflare > paddle-house > Settings > Variables and Secrets,
 * or `vars` in wrangler.jsonc):
 *   RESEND_API_KEY  - secret, Resend API key
 *   INQUIRY_TO      - comma-separated inbox(es) for inquiries
 *   INQUIRY_FROM    - verified sender, e.g. "The Paddle House <hello@playatgoosehill.com>"
 *   ALERT_TO        - comma-separated inbox(es) told when delivery fails
 */

export type Env = Record<string, string | undefined>;
export type Result = { status: number; body: { ok: boolean; error?: string } };

const RESEND_URL = "https://api.resend.com/emails";
const FALLBACK_FROM = "The Paddle House <onboarding@resend.dev>";

type Email = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
};

type SendOutcome = { ok: true } | { ok: false; problem: string };

const list = (v: string | undefined) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

async function send(email: Email, apiKey: string, doFetch: typeof fetch): Promise<SendOutcome> {
  let res: Response;
  try {
    res = await doFetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(email),
    });
  } catch (err) {
    return { ok: false, problem: `Could not reach Resend: ${String(err).slice(0, 300)}` };
  }
  if (res.ok) return { ok: true };
  const detail = (await res.text().catch(() => "")).slice(0, 500);
  return { ok: false, problem: `Resend returned ${res.status}: ${detail}` };
}

/** One retry for blips (network errors, 429, 5xx); config errors (4xx) fail fast. */
async function sendWithRetry(email: Email, apiKey: string, doFetch: typeof fetch) {
  const first = await send(email, apiKey, doFetch);
  if (first.ok) return first;
  const retryable = /^Could not reach|Resend returned (429|5\d\d)/.test(first.problem);
  return retryable ? send(email, apiKey, doFetch) : first;
}

async function sendAlert(
  problem: string,
  guest: { name: string; email: string },
  inquiryText: string,
  env: Env,
  doFetch: typeof fetch,
): Promise<boolean> {
  const to = list(env.ALERT_TO);
  if (!env.RESEND_API_KEY || to.length === 0) return false;

  const alert = (from: string): Email => ({
    from,
    to,
    reply_to: guest.email,
    subject: `Action needed: website form failed (inquiry from ${guest.name})`,
    text: [
      "The inquiry form on playatgoosehill.com could not deliver a guest's note the normal way.",
      "",
      `What went wrong: ${problem}`,
      "",
      "The guest's inquiry is below. Reply to this email to answer them directly.",
      "",
      "----------------------------------------",
      inquiryText,
      "----------------------------------------",
      "",
      "Sent automatically by the website. If this keeps happening, check the Resend",
      "dashboard and the paddle-house settings in Cloudflare.",
    ].join("\n"),
  });

  const from = env.INQUIRY_FROM || FALLBACK_FROM;
  const first = await sendWithRetry(alert(from), env.RESEND_API_KEY, doFetch);
  if (first.ok) return true;
  console.error("inquire: alert failed", first.problem);
  // If our own sender is the problem, Resend's shared sender may still get through.
  if (from === FALLBACK_FROM) return false;
  const second = await send(alert(FALLBACK_FROM), env.RESEND_API_KEY, doFetch);
  if (!second.ok) console.error("inquire: fallback alert failed", second.problem);
  return second.ok;
}

export async function handleInquiry(
  data: Record<string, unknown>,
  env: Env,
  doFetch: typeof fetch = fetch,
): Promise<Result> {
  // Honeypot: real guests never fill this field.
  if (data.website) return { status: 200, body: { ok: true } };

  const name = String(data.name ?? "").trim().slice(0, 200);
  const email = String(data.email ?? "").trim().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: 400, body: { ok: false, error: "Name and a valid email are required." } };
  }

  const field = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max) || "(not given)";
  const inquiryText = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Dates: ${field(data.dates)}`,
    `Group: ${field(data.groupType)}`,
    `Guests: ${field(data.guests, 10)}`,
    `Paddle players: ${field(data.players, 10)}`,
    "",
    "Notes:",
    field(data.notes, 4000),
  ].join("\n");

  let outcome: SendOutcome;
  const to = list(env.INQUIRY_TO);
  if (!env.RESEND_API_KEY || to.length === 0) {
    outcome = { ok: false, problem: "Form settings missing in Cloudflare (RESEND_API_KEY or INQUIRY_TO)." };
  } else {
    outcome = await sendWithRetry(
      {
        from: env.INQUIRY_FROM || FALLBACK_FROM,
        to,
        reply_to: email,
        subject: `Paddle House inquiry: ${name}${data.dates ? ` (${field(data.dates, 100)})` : ""}`,
        text: inquiryText,
      },
      env.RESEND_API_KEY,
      doFetch,
    );
  }
  if (outcome.ok) return { status: 200, body: { ok: true } };

  console.error("inquire: delivery failed", outcome.problem);
  const alerted = await sendAlert(outcome.problem, { name, email }, inquiryText, env, doFetch);
  if (alerted) return { status: 200, body: { ok: true } };

  return { status: 502, body: { ok: false, error: "We couldn't send your note. Please email us directly." } };
}
