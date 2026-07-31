import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPendingDevices, resetPendingDevices } from "@/lib/admin/platform.functions";

/**
 * Releases activation codes that got stuck in the "waiting to pair" state.
 * Only unclaimed screens are affected, so a customer's linked TVs are safe.
 */
export function PendingDevicesReset() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");

  const pending = useQuery({
    queryKey: ["torre", "pending-devices"],
    queryFn: () => fetchPendingDevices(),
    refetchInterval: 10_000,
  });

  const reset = useMutation({
    mutationFn: (input: { code?: string }) => resetPendingDevices({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível liberar os códigos.");
        return;
      }
      toast.success(
        result.removed === 1
          ? "1 código liberado. A tela vai gerar um novo em instantes."
          : `${result.removed} códigos liberados.`,
      );
      setCode("");
      void queryClient.invalidateQueries({ queryKey: ["torre", "pending-devices"] });
      void queryClient.invalidateQueries({ queryKey: ["torre", "overview"] });
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error("Falha ao executar o reset."),
  });

  const rows = pending.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="size-4 text-amber-500" />
          Telas aguardando vínculo
        </CardTitle>
        <CardDescription>
          Libere códigos travados. Apenas telas ainda não reivindicadas são afetadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Código específico (ex.: WTLDKK)"
            maxLength={12}
            className="font-mono uppercase tracking-widest"
          />
          <Button
            variant="outline"
            disabled={reset.isPending || code.trim().length < 4}
            onClick={() => reset.mutate({ code: code.trim() })}
          >
            {reset.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Liberar código
          </Button>
          <Button
            variant="destructive"
            disabled={reset.isPending || rows.length === 0}
            onClick={() => {
              if (!window.confirm(`Liberar todos os ${rows.length} códigos pendentes?`)) return;
              reset.mutate({});
            }}
          >
            Resetar todos
          </Button>
        </div>

        {pending.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum código pendente no momento.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-mono tracking-widest">{row.pairingCode ?? "—"}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {row.lastSeenAt
                      ? `visto ${new Date(row.lastSeenAt).toLocaleString("pt-BR")}`
                      : "nunca visto"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={reset.isPending || !row.pairingCode}
                    onClick={() => reset.mutate({ code: row.pairingCode ?? "" })}
                  >
                    Liberar
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}