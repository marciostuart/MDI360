import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Info } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StepList({ steps }: { steps: readonly ReactNode[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm text-muted-foreground">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5 leading-relaxed">{step}</div>
        </li>
      ))}
    </ol>
  );
}

export function InstallGuide({
  title,
  description,
  icon,
  downloads,
  downloadDescription = "O download começa imediatamente.",
  steps,
  notes,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  downloads: { label: string; href: string; secondary?: boolean }[];
  downloadDescription?: string;
  steps: readonly ReactNode[];
  notes: readonly ReactNode[];
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/studio/downloads">
          <ArrowLeft className="size-4" />
          Voltar para aplicativos
        </Link>
      </Button>

      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-lg">Download</CardTitle>
          <CardDescription>{downloadDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          {downloads.map((download) => (
            <Button
              key={download.href}
              variant={download.secondary ? "outline" : "default"}
              asChild
            >
              <a href={download.href} download>
                <Download className="size-4" />
                {download.label}
              </a>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Instalação passo a passo</CardTitle>
          <CardDescription>
            Faça uma etapa por vez e só avance quando ela estiver concluída.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepList
            steps={steps.map((step, index) =>
              typeof step === "string" ? (
                <span key={index} className="whitespace-pre-line">
                  {step}
                </span>
              ) : (
                step
              ),
            )}
          />
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-primary" />
            Informações importantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {notes.map((note, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
