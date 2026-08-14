import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, MapPin, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchCustomerProfile,
  lookupAddressByCep,
  saveCustomerProfile,
} from "@/lib/billing/customer-profile.functions";
import { customerProfileSchema, isValidDocument } from "@/lib/billing/customer-profile";

export const Route = createFileRoute("/studio/cadastro")({
  head: () => ({ meta: [{ title: "Meu cadastro | MDI 360" }] }),
  component: CustomerProfilePage,
});

const EMPTY = {
  legalName: "",
  documentType: "CPF" as "CPF" | "CNPJ",
  documentNumber: "",
  phone: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

function maskDocument(value: string, type: "CPF" | "CNPJ") {
  const digits = value.replace(/\D/g, "").slice(0, type === "CPF" ? 11 : 14);
  if (type === "CPF")
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4,5})(\d{4})$/, "$1-$2");
}

function CustomerProfilePage() {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveCustomerProfile);
  const cepFn = useServerFn(lookupAddressByCep);
  const { data, isPending } = useQuery({
    queryKey: ["customer-profile"],
    queryFn: () => fetchCustomerProfile(),
  });
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!data?.profile) return;
    setForm({
      legalName: data.profile.legalName,
      documentType: data.profile.documentType as "CPF" | "CNPJ",
      documentNumber: data.profile.documentNumber,
      phone: data.profile.phone,
      zipCode: data.profile.zipCode,
      street: data.profile.street,
      number: data.profile.number,
      complement: data.profile.complement,
      neighborhood: data.profile.neighborhood,
      city: data.profile.city,
      state: data.profile.state,
    });
  }, [data?.profile]);

  const lookup = useMutation({
    mutationFn: () => cepFn({ data: { cep: form.zipCode } }),
    onSuccess: (address) => {
      setForm((current) => ({ ...current, ...address, number: current.number }));
      toast.success("Endereço encontrado. Informe o número.");
    },
    onError: () => toast.error("CEP não encontrado. Confira e tente novamente."),
  });
  const save = useMutation({
    mutationFn: () => {
      const parsed = customerProfileSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Revise os dados informados.");
      }
      return saveFn({ data: parsed.data });
    },
    onSuccess: async () => {
      toast.success("Cadastro atualizado com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Revise os dados informados."),
  });

  if (isPending)
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  const validDocument =
    !form.documentNumber || isValidDocument(form.documentType, form.documentNumber);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Meu cadastro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mantenha os dados do responsável financeiro atualizados para pagamentos mais seguros.
        </p>
      </div>
      {data?.complete ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <CheckCircle2 className="size-5 text-primary" /> Cadastro completo
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-5" />
            Identificação e contato
          </CardTitle>
          <CardDescription>Use os dados do titular responsável pelos pagamentos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={form.documentType === "CPF" ? "Nome completo" : "Razão social"}
            className="sm:col-span-2"
          >
            <Input
              value={form.legalName}
              onChange={(event) => setForm({ ...form, legalName: event.target.value })}
              autoComplete="name"
            />
          </Field>
          <Field label="Tipo de documento">
            <Select
              value={form.documentType}
              onValueChange={(value: "CPF" | "CNPJ") =>
                setForm({ ...form, documentType: value, documentNumber: "" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CPF">CPF</SelectItem>
                <SelectItem value="CNPJ">CNPJ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={form.documentType}
            error={!validDocument ? `${form.documentType} inválido.` : undefined}
          >
            <Input
              value={maskDocument(form.documentNumber, form.documentType)}
              onChange={(event) => setForm({ ...form, documentNumber: event.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="E-mail de acesso">
            <Input value={data?.email ?? ""} disabled />
          </Field>
          <Field label="Telefone com DDD">
            <Input
              value={maskPhone(form.phone)}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5" />
            Endereço
          </CardTitle>
          <CardDescription>Digite o CEP para preencher automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="CEP">
            <div className="flex gap-2">
              <Input
                value={form.zipCode}
                onChange={(event) =>
                  setForm({ ...form, zipCode: event.target.value.replace(/\D/g, "").slice(0, 8) })
                }
                inputMode="numeric"
                autoComplete="postal-code"
              />
              <Button
                type="button"
                variant="outline"
                disabled={lookup.isPending || form.zipCode.replace(/\D/g, "").length !== 8}
                onClick={() => lookup.mutate()}
              >
                {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : "Buscar"}
              </Button>
            </div>
          </Field>
          <Field label="Logradouro">
            <Input
              value={form.street}
              onChange={(event) => setForm({ ...form, street: event.target.value })}
              autoComplete="address-line1"
            />
          </Field>
          <Field label="Número">
            <Input
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
            />
          </Field>
          <Field label="Complemento (opcional)">
            <Input
              value={form.complement}
              onChange={(event) => setForm({ ...form, complement: event.target.value })}
              autoComplete="address-line2"
            />
          </Field>
          <Field label="Bairro">
            <Input
              value={form.neighborhood}
              onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
            />
          </Field>
          <Field label="Cidade">
            <Input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              autoComplete="address-level2"
            />
          </Field>
          <Field label="Estado">
            <Input
              value={form.state}
              maxLength={2}
              onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })}
              autoComplete="address-level1"
            />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button size="lg" disabled={save.isPending || !validDocument} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Salvar cadastro
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Seus dados são usados para faturamento e validação antifraude. Dados de cartão não são
        armazenados pelo MDI 360.
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
