import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";

import { ModulePlaceholder } from "@/components/module-placeholder";

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
  component: () => (
    <ModulePlaceholder
      icon={CalendarClock}
      title="Agenda"
      description="Defina janelas de exibição: por exemplo, o menu do almoço das 11h às 15h e as promoções da noite depois disso."
      comingUp={[
        "Faixas de horário por dia da semana",
        "Prioridade entre agendamentos",
        "Campanhas com data de início e fim",
      ]}
    />
  ),
});