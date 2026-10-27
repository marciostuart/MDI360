import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  MonitorPlay,
  ShieldCheck,
} from "lucide-react";
import {
  consolidateQuiz,
  contactSchema,
  maskWhatsapp,
  remainingQuizSteps,
  type PublicQuiz,
  type QuizAnswer,
} from "@/lib/landing/quiz";

export function LeadQuiz({ config }: { config: PublicQuiz }) {
  const [contact, setContact] = useState({ nome: "", whatsapp: "", email: "", consent: false });
  const [current, setCurrent] = useState("contact");
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [pending, setPending] = useState<QuizAnswer | null>(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState<"fim_a" | "fim_b" | null>(null);
  const id = useRef("");
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const website = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    heading.current?.focus();
  }, [current, ending]);
  const step = config.steps.find((entry) => entry.id === current);
  const complete = current === "contact" ? 0 : 1 + answers.length;
  const remaining =
    current === "contact"
      ? 1 + remainingQuizSteps(config, config.start)
      : remainingQuizSteps(config, current);
  const progress = ending ? 100 : Math.round((100 * complete) / (complete + remaining));
  const move = (target: string) => {
    lock.current = true;
    setMoving(true);
    setError("");
    timer.current = setTimeout(() => {
      setCurrent(target);
      setMoving(false);
      lock.current = false;
    }, 160);
  };
  const finish = async (nextAnswers: QuizAnswer[]) => {
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const parsedContact = contactSchema.parse(contact);
      const result = consolidateQuiz(config, parsedContact, nextAnswers);
      id.current ||= crypto.randomUUID();
      const response = await fetch("/api/public/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: id.current,
          revision: config.revision,
          contact: parsedContact,
          answers: nextAnswers,
          website: website.current?.value ?? "",
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const receipt = await response.json();
      if (!response.ok || !receipt.ok)
        throw new Error(receipt.error || "Não foi possível salvar. Tente novamente.");
      setEnding(result.ending);
      setAnswers(nextAnswers);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const choose = (answer: QuizAnswer, target: string) => {
    if (lock.current) return;
    const next = [...answers, answer];
    setPending(null);
    if (target === "fim_a" || target === "fim_b") {
      setPending(answer);
      void finish(next);
    } else {
      setAnswers(next);
      move(target);
    }
  };
  const back = () => {
    if (lock.current || busy) return;
    id.current = "";
    setPending(null);
    setError("");
    const previous = answers.at(-1);
    if (!previous) {
      move("contact");
      return;
    }
    setAnswers(answers.slice(0, -1));
    setPending(previous);
    move(previous.stepId);
  };
  const start = (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!contactSchema.safeParse(contact).success) {
      setError("Confira seu nome, WhatsApp com DDD, e-mail e a autorização de contato.");
      return;
    }
    move(config.start);
  };
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div
        role="progressbar"
        aria-label="Progresso do diagnóstico"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed inset-x-0 top-0 z-20 h-1.5 bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <a href="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <MonitorPlay className="size-5" />
          </span>
          MDI 360
        </a>
        <span className="text-sm text-muted-foreground">{progress}% concluído</span>
      </header>
      <section
        className="mx-auto flex min-h-[75svh] max-w-3xl flex-col justify-center px-6 py-10"
        aria-busy={busy}
      >
        {!config.enabled ? (
          <>
            <h1 className="font-display text-3xl">Diagnóstico temporariamente indisponível</h1>
            <p className="mt-4 text-muted-foreground">Tente novamente em outro momento.</p>
          </>
        ) : ending ? (
          <div
            className="animate-in fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none"
            role="status"
          >
            <CheckCircle2 className="mb-8 size-14 text-primary" />
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
              Diagnóstico concluído
            </p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="font-display text-3xl font-semibold leading-snug outline-none md:text-4xl"
            >
              {config.endings[ending]}
            </h1>
            <p className="mt-6 text-muted-foreground">
              Seus dados foram registrados com segurança. Obrigado por conhecer o MDI 360.
            </p>
            <a
              href="/"
              className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              Conhecer a plataforma <ArrowRight className="size-4" />
            </a>
          </div>
        ) : (
          <div
            className={`transition-all duration-150 motion-reduce:transition-none ${moving ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.2em] text-primary">
              Seu próximo passo com o MDI 360
            </p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="font-display text-3xl font-semibold leading-tight tracking-tight outline-none md:text-5xl"
            >
              {current === "contact" ? config.title : step?.title}
            </h1>
            {current === "contact" ? (
              <form onSubmit={start} className="mt-7 space-y-5">
                <p className="max-w-xl leading-relaxed text-muted-foreground">
                  {config.description}
                </p>
                <h2 className="pt-2 text-lg font-medium">{config.contactTitle}</h2>
                {(
                  [
                    { field: "nome", label: "Nome", type: "text", autoComplete: "name" },
                    {
                      field: "whatsapp",
                      label: "WhatsApp com DDD",
                      type: "tel",
                      autoComplete: "tel-national",
                    },
                    { field: "email", label: "E-mail", type: "email", autoComplete: "email" },
                  ] as const
                ).map((input) => (
                  <label key={input.field} className="block space-y-2 text-sm font-medium">
                    {input.label}
                    <input
                      required
                      type={input.type}
                      autoComplete={input.autoComplete}
                      maxLength={input.field === "email" ? 254 : input.field === "nome" ? 120 : 16}
                      value={contact[input.field]}
                      onChange={(event) =>
                        setContact({
                          ...contact,
                          [input.field]:
                            input.field === "whatsapp"
                              ? maskWhatsapp(event.target.value)
                              : event.target.value,
                        })
                      }
                      className="h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                ))}
                <label className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    required
                    checked={contact.consent}
                    onChange={(event) => setContact({ ...contact, consent: event.target.checked })}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  {config.consentText}
                </label>
                <button
                  disabled={moving}
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {config.startLabel}
                  <ArrowRight className="size-4" />
                </button>
              </form>
            ) : (
              step && (
                <div className="mt-8 space-y-3">
                  {step.type === "choice"
                    ? step.options.map((option, index) => (
                        <button
                          key={option.id}
                          disabled={busy || moving}
                          onClick={() => {
                            if (lock.current) return;
                            if (option.detail) {
                              setPending({ stepId: step.id, optionId: option.id, text: "" });
                              setError("");
                            } else choose({ stepId: step.id, optionId: option.id }, option.next);
                          }}
                          className={`flex min-h-16 w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${pending?.optionId === option.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-xs text-muted-foreground">
                            {pending?.optionId === option.id ? (
                              <Check className="size-4 text-primary" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className="text-base md:text-lg">{option.label}</span>
                        </button>
                      ))
                    : null}
                  {(step.type === "text" ||
                    (pending &&
                      step.options.find((option) => option.id === pending.optionId)?.detail)) && (
                    <form
                      className="space-y-4 pt-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        choose(
                          { stepId: step.id, ...pending, text: pending?.text ?? "" },
                          step.type === "text"
                            ? step.next
                            : step.options.find((option) => option.id === pending?.optionId)!.next,
                        );
                      }}
                    >
                      <label className="block space-y-2 text-sm">
                        <span>
                          {step.type === "text"
                            ? "Sua resposta"
                            : step.options.find((option) => option.id === pending?.optionId)
                                ?.detailLabel}
                        </span>
                        <input
                          autoFocus
                          required={step.type === "text"}
                          maxLength={500}
                          disabled={busy}
                          value={pending?.text ?? ""}
                          onChange={(event) =>
                            setPending({ stepId: step.id, ...pending, text: event.target.value })
                          }
                          className="h-12 w-full rounded-xl border border-input bg-card px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                      <button
                        disabled={busy || moving}
                        className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}Continuar
                        <ArrowRight className="size-4" />
                      </button>
                    </form>
                  )}
                  {busy ? (
                    <p
                      role="status"
                      className="flex items-center gap-2 pt-4 text-sm text-muted-foreground"
                    >
                      <Loader2 className="size-4 animate-spin" />
                      Salvando seu diagnóstico…
                    </p>
                  ) : (
                    <button
                      onClick={back}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="size-4" />
                      Voltar
                    </button>
                  )}
                </div>
              )
            )}
            {error ? (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {error}
                {pending && !busy ? (
                  <button
                    className="ml-3 underline"
                    onClick={() => {
                      const target =
                        step?.type === "text"
                          ? step.next
                          : step?.options.find((option) => option.id === pending.optionId)?.next;
                      if (target && (target === "fim_a" || target === "fim_b"))
                        void finish([...answers, pending]);
                    }}
                  >
                    Tentar novamente
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        <label className="absolute -left-[10000px]" aria-hidden="true">
          Não preencha este campo
          <input ref={website} name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <p className="mt-12 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Seus dados serão utilizados somente para este atendimento comercial.
        </p>
      </section>
    </main>
  );
}
