import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/diagnostico")({
  beforeLoad: () => {
    throw redirect({ to: "/cadastro", search: { confirm: "" }, replace: true });
  },
});
