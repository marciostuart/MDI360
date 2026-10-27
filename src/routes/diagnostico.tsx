import { createFileRoute } from "@tanstack/react-router";
import { LeadQuiz } from "@/components/landing/lead-quiz";
import { fetchPublicQuiz } from "@/lib/landing/quiz.functions";

export const Route = createFileRoute("/diagnostico")({
  loader: () => fetchPublicQuiz(),
  head: () => ({
    meta: [
      { title: "Diagnóstico de telas | MDI 360" },
      {
        name: "description",
        content:
          "Descubra a solução de mídia digital indoor ideal para o seu negócio ou sua revenda em menos de um minuto.",
      },
    ],
  }),
  component: DiagnosisPage,
});

function DiagnosisPage() {
  return <LeadQuiz config={Route.useLoaderData()} />;
}
