import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Building2, LayoutDashboard, MonitorPlay, ShieldCheck, Tags } from "lucide-react";

export const Route = createFileRoute("/torre")({
  component: TowerLayout,
});

const NAV = [
  { to: "/torre", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/torre/clientes", label: "Estabelecimentos", icon: Building2, exact: false },
  { to: "/torre/planos", label: "Planos", icon: Tags, exact: false },
] as const;

function TowerLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/torre" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorPlay className="size-4" />
            </span>
            <span className="font-display text-base font-semibold">Torre de Controle</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
              >
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </nav>

          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Acesso restrito
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
