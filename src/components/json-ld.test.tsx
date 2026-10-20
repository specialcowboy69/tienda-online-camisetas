import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, it, vi } from "vitest";
import { JsonLd } from "./json-ld";
beforeAll(() => vi.stubGlobal("React", React));
it("renders one inert JSON-LD script even with hostile text", () => {
  const data = { name: "</script><script>alert(1)</script>", description: "Cats & coffee" };
  const html = renderToStaticMarkup(<JsonLd data={data} />);
  expect(html.match(/<script\b/g)).toHaveLength(1);
  expect(html.match(/<\/script>/g)).toHaveLength(1);
  expect(html).toMatch(/^<script type="application\/ld\+json">/);
  const payload = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  expect(payload).not.toContain("<");
  expect(JSON.parse(payload)).toEqual(data);
});
