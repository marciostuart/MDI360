import test from "node:test";
import assert from "node:assert/strict";
import { canAccessTowerPath, isTowerPath } from "../src/lib/admin/tower-path.ts";

test("Tower guard covers routes, case variants, encoded separators and nested paths", () => {
  for (const path of [
    "/torre",
    "/torre/site",
    "/TORRE/clientes",
    "/%74orre%2Fsite",
    "//torre///site",
    "/x/../torre/site",
  ])
    assert.equal(isTowerPath(path), true, path);
  for (const path of ["/", "/cadastro", "/torres", "/studio/torre"])
    assert.equal(isTowerPath(path), false, path);
});

test("Tower fails closed without an authorized platform session", async () => {
  let checks = 0;
  const deny = async () => {
    checks++;
    throw new Error("FORBIDDEN");
  };
  assert.equal(await canAccessTowerPath("/torre/site", deny), false);
  assert.equal(
    await canAccessTowerPath("/torre/site", async () => {
      throw new Error("DB_UNAVAILABLE");
    }),
    false,
  );
  assert.equal(await canAccessTowerPath("/torre/site", async () => null), false);
  assert.equal(
    await canAccessTowerPath("/torre/site", async () => ({ id: "platform-admin" })),
    true,
  );
  assert.equal(await canAccessTowerPath("/cadastro", deny), true);
  assert.equal(checks, 1);
});
