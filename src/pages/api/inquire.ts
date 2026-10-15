import type { APIRoute } from "astro";
import { env as workerEnv } from "cloudflare:workers";
import { handleInquiry, type Env } from "../../lib/inquiry";

export const prerender = false;

/** Inquiry endpoint. Delivery and failure alerts live in src/lib/inquiry.ts. */
export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const { status, body } = await handleInquiry(data, workerEnv as Env);
  return json(body, status);
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
