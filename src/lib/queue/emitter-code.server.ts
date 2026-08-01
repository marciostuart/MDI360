/**
 * Código curto de vinculação do terminal emissor (app Windows), no mesmo
 * formato dos códigos de ativação das TVs: sem caracteres ambíguos.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newEmitterCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}