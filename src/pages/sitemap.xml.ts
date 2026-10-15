import type { APIRoute } from "astro";

export const prerender = true;

// Public pages for search engines. Add new pages here.
const PAGES = ["/", "/experience/", "/accommodations/", "/our-story/", "/book/"];

export const GET: APIRoute = ({ site }) => {
  const urls = PAGES.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
