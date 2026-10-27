import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANDING_CONTENT,
  normalizeLandingContent,
} from "../src/lib/landing/landing-content.ts";
import {
  LANDING_LINKS,
  landingAnchorProps,
  landingHrefSchema,
  landingLinksSchema,
} from "../src/lib/landing/landing-links.ts";

test("all fourteen landing destinations have safe default href/target", () => {
  assert.equal(Object.keys(LANDING_LINKS).length, 14);
  assert.ok(landingLinksSchema.safeParse(DEFAULT_LANDING_CONTENT.links).success);
  for (const [id, link] of Object.entries(DEFAULT_LANDING_CONTENT.links)) {
    const props = landingAnchorProps(link);
    assert.equal(props.href, LANDING_LINKS[id as keyof typeof LANDING_LINKS].href);
    assert.equal(props.target, link.newTab ? "_blank" : "_self");
    if (link.newTab) assert.equal(props.rel, "noopener noreferrer");
  }
});
test("legacy WhatsApp customization survives without changing the other buttons", () => {
  const config = normalizeLandingContent({ whatsappUrl: "https://wa.me/5531999999999" });
  assert.equal(config.links.partner.href, "https://wa.me/5531999999999");
  assert.equal(config.links.finalContact.href, "https://wa.me/5531999999999");
  assert.equal(config.links.headerLogin.href, "/entrar?mode=login");
  assert.equal(config.links.partner.newTab, true);
});
test("destinations and opening mode are independent per button and reload correctly", () => {
  const config = normalizeLandingContent({
    whatsappUrl: "https://wa.me/5531999999999",
    links: {
      heroPrimary: { href: "/diagnostico", newTab: true },
      partner: { href: "https://example.com/parceria", newTab: false },
    },
  });
  const saved = normalizeLandingContent(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(landingAnchorProps(saved.links.heroPrimary), {
    href: "/diagnostico",
    target: "_blank",
    rel: "noopener noreferrer",
  });
  assert.equal(saved.links.partner.href, "https://example.com/parceria");
  assert.equal(saved.links.partner.newTab, false);
  assert.equal(saved.links.finalContact.href, "https://wa.me/5531999999999");
  assert.equal(DEFAULT_LANDING_CONTENT.links.heroPrimary.href, "/entrar?mode=signup");
});
test("unsafe/empty links cannot be published and corrupt persisted links fall back safely", () => {
  for (const href of [
    "",
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.example",
    "/\\evil.example",
    "https://user:pass@example.com",
    "https://example.com/%0aattack",
    "mailto:test@example.com%0d%0abcc:evil@example.com",
  ])
    assert.equal(landingHrefSchema.safeParse(href).success, false, href);
  for (const href of [
    "/diagnostico",
    "/entrar?mode=signup",
    "#plataforma",
    "https://example.com/page?q=1",
    "http://example.com",
    "mailto:comercial@example.com",
    "tel:+5531920051113",
  ])
    assert.ok(landingHrefSchema.safeParse(href).success, href);
  assert.equal(
    normalizeLandingContent({
      links: { heroPrimary: { href: "javascript:alert(1)", newTab: true } },
    }).links.heroPrimary.href,
    "/entrar?mode=signup",
  );
});
test("every landing anchor uses an editor-controlled destination, including mobile duplicates", async () => {
  const source = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const references = [...source.matchAll(/link\("(\w+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(references)].sort(), Object.keys(LANDING_LINKS).sort());
  assert.equal(references.length, (source.match(/<a(?:\s|>)/g) ?? []).length);
  assert.equal(references.length, 19);
});
