import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/cadastro")({
  validateSearch: (s: Record<string, unknown>) => ({
    confirm: typeof s.confirm === "string" ? s.confirm : "",
  }),
  head: () => ({
    meta: [{ title: "Pré-cadastro | MDI 360" }, { name: "robots", content: "noindex" }],
  }),
  component: SignupPage,
});

type Form = {
  type: "PF" | "PJ";
  name: string;
  cpf: string;
  cnpj: string;
  fantasyName: string;
  responsible: string;
  phone: string;
  email: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  turnstileToken: string;
  website: string;
};
const empty: Form = {
  type: "PF",
  name: "",
  cpf: "",
  cnpj: "",
  fantasyName: "",
  responsible: "",
  phone: "",
  email: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  turnstileToken: "",
  website: "",
};
const digits = (v: string) => v.replace(/\D/g, "");
function mask(value: string, kind: "cpf" | "cnpj" | "phone" | "cep") {
  const d = digits(value);
  if (kind === "cpf")
    return d
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  if (kind === "cnpj")
    return d
      .slice(0, 14)
      .replace(/^([\d]{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  if (kind === "cep") return d.slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
  const national = d.slice(2, 11);
  return `(${d.slice(0, 2)}) ${national}`.replace(
    d.length > 10 ? /(\d{5})(\d{4})$/ : /(\d{4})(\d{4})$/,
    "$1-$2",
  );
}
function SignupPage() {
  const { confirm } = Route.useSearch();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [siteKey, setSiteKey] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  useEffect(() => {
    void fetch("/api/public/signup")
      .then((r) => r.json())
      .then((v) => setSiteKey(v.siteKey ?? ""));
  }, []);
  useEffect(() => {
    if (!form.cep || digits(form.cep).length !== 8) return;
    const ctrl = new AbortController();
    void fetch(`https://viacep.com.br/ws/${digits(form.cep)}/json/`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((a) => {
        if (!a.erro)
          setForm((f) => ({
            ...f,
            street: a.logradouro || f.street,
            neighborhood: a.bairro || f.neighborhood,
            city: a.localidade || f.city,
            state: a.uf || f.state,
          }));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [form.cep]);
  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const traffic = Object.fromEntries(new URLSearchParams(location.search).entries());
      traffic.referrer = document.referrer.slice(0, 500);
      traffic.landing_page = location.pathname;
      const source = traffic.utm_source?.toLowerCase() || "";
      const medium = traffic.utm_medium?.toLowerCase() || "";
      const referrerHost = document.referrer ? new URL(document.referrer).hostname : "";
      traffic.traffic_origin = source ? `utm:${source}` : referrerHost || "direct";
      traffic.channel = /organic|organic_search/.test(medium)
        ? "busca_organica"
        : /cpc|ppc|paid|ads/.test(medium) || Boolean(traffic.gclid)
          ? "busca_paga"
          : /facebook|instagram|linkedin|tiktok|youtube|twitter|x\.com/.test(
                `${source} ${referrerHost}`,
              )
            ? "rede_social"
            : referrerHost
              ? "referencia"
              : "direto";
      const response = await fetch("/api/public/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request",
          ...form,
          responsible: form.type === "PF" ? form.name : form.responsible,
          traffic,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
      setNotice(
        "Solicitação enviada. Confira seu e-mail e abra o link neste mesmo navegador e conexão em até 10 minutos.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao enviar.");
      setChallenge((x) => x + 1);
      setForm((f) => ({ ...f, turnstileToken: "" }));
    } finally {
      setBusy(false);
    }
  }
  async function confirmEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/public/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", token: confirm, password }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await navigate({ to: "/studio" });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    label: string,
    key: keyof Form,
    type = "text",
    kind?: "cpf" | "cnpj" | "phone" | "cep",
    required = true,
  ) => (
    <label className="grid gap-2 text-sm">
      <Label>{label}</Label>
      <Input
        required={required}
        type={type}
        value={form[key]}
        onChange={(e) => set(key, kind ? mask(e.target.value, kind) : e.target.value)}
        autoComplete="on"
      />
    </label>
  );
  return (
    <div className="flex min-h-screen flex-col bg-[#070a08] text-[#f4f7f2]">
      <header className="border-b border-white/10 bg-[#070a08]/90">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-10">
          <a href="/" aria-label="MDI 360 - início" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#a3ff3f] text-[#07100b]">
              <span className="text-sm font-black">▶</span>
            </span>
            <span className="font-display text-lg font-bold tracking-tight">MDI 360</span>
          </a>
          <nav className="flex items-center gap-5 text-sm text-white/70">
            <a href="/#plataforma" className="hidden hover:text-white sm:inline">
              Plataforma
            </a>
            <a href="/#faq" className="hidden hover:text-white sm:inline">
              Dúvidas
            </a>
            <a
              href="/entrar?mode=login"
              className="rounded-full border border-white/15 px-4 py-2 hover:text-white"
            >
              Entrar
            </a>
          </nav>
        </div>
      </header>
      <main className="grid flex-1 place-items-center px-4 py-10">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{confirm ? "Confirme seu cadastro" : "Pré-cadastro MDI 360"}</CardTitle>
            <CardDescription>
              {confirm
                ? "Crie sua senha para ativar a conta gratuita."
                : "Preencha seus dados. Enviaremos um link para confirmar seu e-mail."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {notice && (
              <p role="status" className="mb-5 rounded-md border p-3 text-sm">
                {notice}
              </p>
            )}
            {confirm ? (
              <form className="grid gap-4" onSubmit={confirmEmail}>
                <label className="grid gap-2 text-sm">
                  <Label>Senha (mínimo 8 caracteres)</Label>
                  <Input
                    required
                    minLength={8}
                    maxLength={200}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>{busy ? "Confirmando…" : "Confirmar e criar conta"}</Button>
              </form>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
                <label className="grid gap-2 text-sm sm:col-span-2">
                  <Label>Tipo de cadastro</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...empty,
                        type: e.target.value as "PF" | "PJ",
                        turnstileToken: form.turnstileToken,
                      })
                    }
                  >
                    <option value="PF">Pessoa física</option>
                    <option value="PJ">Pessoa jurídica</option>
                  </select>
                </label>
                {field(form.type === "PF" ? "Nome completo" : "Razão social", "name")}
                {form.type === "PF" ? (
                  field("CPF", "cpf", "text", "cpf")
                ) : (
                  <>
                    {field("CNPJ", "cnpj", "text", "cnpj")}
                    {field("Nome fantasia", "fantasyName")}
                    {field("Nome completo do responsável", "responsible")}
                  </>
                )}
                {field("Telefone com DDD", "phone", "tel", "phone")}
                {field("E-mail", "email", "email")}
                {field("CEP", "cep", "text", "cep")}
                {field("Rua", "street")}
                {field("Número", "number")}
                {field("Complemento (opcional)", "complement", "text", undefined, false)}
                {field("Bairro", "neighborhood")}
                {field("Cidade", "city")}
                {field("Estado (UF)", "state")}
                <input
                  tabIndex={-1}
                  aria-hidden="true"
                  className="hidden"
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                />
                <div className="sm:col-span-2">
                  {siteKey ? (
                    <TurnstileWidget
                      key={challenge}
                      siteKey={siteKey}
                      action="signup_preregister"
                      onToken={(v) => set("turnstileToken", v)}
                    />
                  ) : (
                    <p className="text-sm text-destructive">Validação de segurança indisponível.</p>
                  )}
                </div>
                <Button
                  className="sm:col-span-2"
                  disabled={busy || !siteKey || !form.turnstileToken}
                >
                  {busy ? "Enviando…" : "Enviar pré-cadastro"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/45">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row">
          <span className="font-display font-semibold text-white/70">MDI 360</span>
          <span>
            © {new Date().getFullYear()} Márcio Stuart · 360BH · Todos os direitos reservados.
          </span>
        </div>
      </footer>
    </div>
  );
}
