import { createHash, randomBytes } from "node:crypto";

export function newEmitterToken() {
  return randomBytes(32).toString("base64url");
}

export function hashEmitterToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return token.length >= 20 ? token : null;
}
