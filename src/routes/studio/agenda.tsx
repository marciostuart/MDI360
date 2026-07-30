import { createFileRoute } from "@tanstack/react-router";

import { ScheduleManager } from "@/components/schedules/schedule-manager";

export const Route = createFileRoute("/studio/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda | MDI 360" },
      {
        name: "description",
        content: "Programe qual playlist toca em cada dia e horário, por tela ou por grupo.",
      },
      { property: "og:title", content: "Agenda de exibição | MDI 360" },
      {
        property: "og:description",
        content: "Programe qual playlist toca em cada dia e horário.",
      },
    ],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Agenda</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Defina janelas de exibição: por exemplo, o menu do almoço das 11h às 15h e as promoções
          da noite depois disso.
        </p>
      </div>
      <ScheduleManager />
    </div>
  );
}