import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  LayoutDashboard,
  ListVideo,
  Loader2,
  LogOut,
  MonitorPlay,
  BarChart3,
  Settings,
  Images,
  Gauge,
  Ticket,
  Download,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { Fragment, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { signOut } from "@/lib/auth/auth.functions";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: DashboardLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  section?: string;
};

const NAV: NavItem[] = [
  { to: "/studio", label: "Visão geral", icon: LayoutDashboard, exact: true, section: "Operação" },
  { to: "/studio/terminais", label: "Terminais", icon: Smartphone, section: "Operação" },
  { to: "/studio/conteudos", label: "Conteúdos", icon: Images, section: "Programação" },
  { to: "/studio/widgets", label: "Widgets", icon: Gauge, section: "Programação" },
  { to: "/studio/playlists", label: "Playlists", icon: ListVideo, section: "Programação" },
  { to: "/studio/agenda", label: "Agenda", icon: CalendarClock, section: "Programação" },
  { to: "/studio/senhas", label: "Senhas e atendimento", icon: Ticket, section: "Atendimento" },
  { to: "/studio/relatorios", label: "Relatórios", icon: BarChart3, section: "Análise" },
  { to: "/studio/downloads", label: "Downloads", icon: Download, section: "Sistema" },
  { to: "/studio/configuracoes", label: "Configurações", icon: Settings, section: "Sistema" },
  { to: "/studio/faturamento", label: "Faturamento", icon: CreditCard, section: "Sistema" },
];

function DashboardLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user, isPending } = useCurrentUser();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const signOutFn = useServerFn(signOut);

  // Server functions enforce access on their own; this is just UX routing.
  useEffect(() => {
    if (!isPending && !user) navigate({ to: "/entrar" });
  }, [isPending, user, navigate]);

  const signOutMutation = useMutation({
    mutationFn: () => signOutFn({}),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate({ to: "/entrar" });
    },
  });

  if (isPending || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ImpersonationBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
          <Link to="/studio" className="mb-8 flex items-center gap-2 px-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MonitorPlay className="size-4" />
            </span>
            <span className="font-display text-base font-semibold">MDI 360</span>
          </Link>

          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item, index) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Fragment key={item.to}>
                  {item.section !== NAV[index - 1]?.section ? (
                    <p
                      className={cn(
                        "px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70",
                        index === 0 && "pt-0",
                      )}
                    >
                      {item.section}
                    </p>
                  ) : null}
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </Fragment>
              );
            })}
          </nav>

          <div className="mt-4 rounded-lg border border-sidebar-border p-3">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.organizationName}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start px-2 text-muted-foreground"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 overflow-x-auto border-b border-border p-3 md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {item.label}
              </Link>
            ))}
          </header>
          <main className="min-w-0 flex-1 p-6 lg:p-10">
            {/* Nested dashboard pages render here. */}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
