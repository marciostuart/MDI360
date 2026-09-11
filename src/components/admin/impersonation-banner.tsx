import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { endImpersonation, fetchImpersonationState } from "@/lib/admin/platform.functions";

/**
 * Shown only while a platform admin is signed in as a customer, so support
 * sessions are never mistaken for the customer's own session.
 */
export function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["impersonation-state"],
    queryFn: () => fetchImpersonationState(),
  });

  const exit = useMutation({
    mutationFn: () => endImpersonation(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error("A sessão administrativa expirou. Saia e entre novamente na Torre.");
        return;
      }
      queryClient.clear();
      window.location.assign("/torre/clientes");
    },
    onError: () => toast.error("Não foi possível restaurar a sessão administrativa."),
  });

  if (!data?.impersonating) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span className="flex items-center gap-2">
        <ShieldAlert className="size-4" />
        Você está acessando esta conta como suporte da plataforma.
      </span>
      <Button size="sm" variant="secondary" onClick={() => exit.mutate()} disabled={exit.isPending}>
        <LogOut className="mr-2 size-3.5" /> Voltar para a Torre
      </Button>
    </div>
  );
}
