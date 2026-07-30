import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** Shown for dashboard modules whose implementation lands in a later phase. */
export function ModulePlaceholder({
  icon: Icon,
  title,
  description,
  comingUp,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  comingUp: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <Icon className="size-6" />
          </span>
          <div>
            <p className="font-display text-base font-semibold">Módulo em construção</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vamos ativar este módulo na próxima etapa do projeto.
            </p>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {comingUp.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}