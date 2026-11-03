import type { Pay360BhCredentials } from "@/lib/billing/pay360bh-config.server";

export const PAY360BH_MINIMUM_CENTS = 500;

export type Pay360BhCharge = {
  paymentId: string;
  reference: string;
  status: "PENDING";
  pixCopyPaste: string;
  qrCodeBase64: string;
  expiresAt: Date | null;
};

export function buildPay360BhChargePayload(input: {
  legalName: string;
  documentNumber: string;
  email: string;
  phone: string;
  amountCents: number;
  reference: string;
  dueDate: string;
}) {
  return {
    nome: input.legalName.trim(),
    cpf_cnpj: input.documentNumber.replace(/\D/g, ""),
    email: input.email.trim(),
    telefone: input.phone.replace(/\D/g, ""),
    valor_centavos: input.amountCents,
    referencia: input.reference,
    vencimento: input.dueDate,
    descricao: `Fatura MDI 360 ${input.reference}`.slice(0, 160),
  };
}

export function parsePay360BhCharge(
  value: unknown,
  expected: {
    projectCode: string;
    reference: string;
  },
): Pay360BhCharge {
  if (!value || typeof value !== "object") throw new Error("PAY360BH_INVALID_RESPONSE");
  const envelope = value as Record<string, unknown>;
  const result = envelope.resultado as Record<string, unknown> | undefined;
  if (
    envelope.ok !== true ||
    envelope.projeto !== expected.projectCode ||
    !result ||
    result.referencia !== expected.reference ||
    result.status !== "PENDING" ||
    typeof result.payment_id !== "string" ||
    !result.payment_id ||
    typeof result.pix_copia_cola !== "string" ||
    !result.pix_copia_cola ||
    typeof result.qr_code_base64 !== "string" ||
    !result.qr_code_base64
  ) {
    throw new Error("PAY360BH_INVALID_RESPONSE");
  }
  if (
    result.payment_id.length > 120 ||
    result.pix_copia_cola.length > 20_000 ||
    result.qr_code_base64.length > 1_500_000
  ) {
    throw new Error("PAY360BH_INVALID_RESPONSE");
  }
  const expiresAt = typeof result.expira_em === "string" ? new Date(result.expira_em) : null;
  return {
    paymentId: result.payment_id,
    reference: expected.reference,
    status: "PENDING",
    pixCopyPaste: result.pix_copia_cola,
    qrCodeBase64: result.qr_code_base64,
    expiresAt: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
  };
}

export async function createPay360BhPixCharge(
  credentials: Pay360BhCredentials,
  payload: ReturnType<typeof buildPay360BhChargePayload>,
): Promise<Pay360BhCharge> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${credentials.apiUrl}/api/v1/cobrancas`, {
      method: "POST",
      headers: {
        "X-Service-Key": credentials.serviceKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("PAY360BH_RESPONSE_TOO_LARGE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(
        response.status >= 500 ? "PAY360BH_UPSTREAM_UNCERTAIN" : "PAY360BH_INVALID_RESPONSE",
      );
    }
    if (response.status !== 201) {
      const error = new Error(`PAY360BH_HTTP_${response.status}`);
      Object.assign(error, { status: response.status });
      throw error;
    }
    return parsePay360BhCharge(parsed, {
      projectCode: credentials.projectCode,
      reference: payload.referencia,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function isDefinitivePay360BhFailure(error: unknown) {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : null;
  return (
    typeof status === "number" && status >= 400 && status < 500 && status !== 409 && status !== 429
  );
}
