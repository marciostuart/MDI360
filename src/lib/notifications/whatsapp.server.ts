export async function sendWhatsappText(phone: string, text: string) {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_API_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !key) throw new Error("Evolution API não configurada");
  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Evolution API respondeu ${response.status}`);
}
