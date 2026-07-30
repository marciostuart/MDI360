import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { MonitorPlay, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/torre")({
  component: TowerLayout,
});

function TowerLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/torre" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorPlay className="size-4" />
            </span>
            <span className="font-display text-base font-semibold">Torre de Controle</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Acesso restrito da plataforma
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}