import { z } from "zod";

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return (remainder === 10 ? 0 : remainder) === Number(cpf[length]);
  };
  return check(9) && check(10);
}

export function isValidCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculate(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

export function isValidDocument(type: "CPF" | "CNPJ", value: string) {
  return type === "CPF" ? isValidCpf(value) : isValidCnpj(value);
}

export const customerProfileSchema = z
  .object({
    legalName: z.string().trim().min(3, "Informe o nome completo ou razão social.").max(160),
    documentType: z.enum(["CPF", "CNPJ"]),
    documentNumber: z.string().transform(digits),
    phone: z.string().transform(digits).pipe(z.string().min(10).max(11)),
    zipCode: z.string().transform(digits).pipe(z.string().length(8)),
    street: z.string().trim().min(2).max(160),
    number: z.string().trim().min(1).max(30),
    complement: z.string().trim().max(100).default(""),
    neighborhood: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().toUpperCase().length(2),
  })
  .superRefine((data, context) => {
    if (!isValidDocument(data.documentType, data.documentNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentNumber"],
        message: `${data.documentType} inválido.`,
      });
    }
  });

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

export function profileIsComplete(profile: unknown) {
  return customerProfileSchema.safeParse(profile).success;
}
