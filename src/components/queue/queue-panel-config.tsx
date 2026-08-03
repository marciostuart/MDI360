import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteQueueOperator,
  deleteQueueSector,
  getQueuePanelDetails,
  resetQueueCounters,
  saveQueueOperator,
  saveQueueSector,
  setQueueIssuing,
  type QueueOperatorRow,
} from "@/lib/queue/queue.functions";
import {
  claimEmitter,
  listEmitters,
  removeEmitter,
} from "@/lib/queue/emitter.functions";


type SectorDraft = {
  sectorId: string;
  name: string;
  prefix: string;
  /** Vazio = sem limite diário. */
  dailyLimit: string;
  operatorIds: string[];
};

type OperatorDraft = {
  operatorId?: string;
  name: string;
  username: string;
  /** Guichê/mesa deste operador ("Guichê 01"). */
  deskLabel: string;
  password: string;
  isEnabled: boolean;
  sectorIds: string[];
};

const emptyOperator: OperatorDraft = {
  name: "",
  username: "",
  deskLabel: "",
  password: "",
  isEnabled: true,
  sectorIds: [],
};

/**
 * Filas, operadores e tela de emissão de um painel de senhas.
 * Tudo aqui é exclusivo do cliente — o operador só chama senhas.
 */
export function QueuePanelConfig({
  panelId,
}: {
  panelId: string;
}) {
  const queryClient = useQueryClient();
  const loadDetails = useServerFn(getQueuePanelDetails);
  const saveSector = useServerFn(saveQueueSector);
  const removeSector = useServerFn(deleteQueueSector);
  const saveOperator = useServerFn(saveQueueOperator);
  const removeOperator = useServerFn(deleteQueueOperator);
  const resetCounters = useServerFn(resetQueueCounters);
  const setIssuing = useServerFn(setQueueIssuing);
  const claimEmitterFn = useServerFn(claimEmitter);
  const listEmittersFn = useServerFn(listEmitters);
  const removeEmitterFn = useServerFn(removeEmitter);



  // A gestão de filas e operadores fica sempre visível: é o painel de trabalho
  // do cliente, não um detalhe escondido.
  const [open, setOpen] = useState(true);
  const [sectorDraft, setSectorDraft] = useState({ name: "", prefix: "" });
  const [sectorEdit, setSectorEdit] = useState<SectorDraft | null>(null);
  const [operatorDraft, setOperatorDraft] = useState<OperatorDraft | null>(null);
  const [emitterCode, setEmitterCode] = useState("");

  const queryKey = ["queue-panel-details", panelId];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => loadDetails({ data: { panelId } }),
    enabled: open,
  });

  const emittersQueryKey = ["queue-emitters", panelId];
  const { data: emittersData } = useQuery({
    queryKey: emittersQueryKey,
    queryFn: () => listEmittersFn({ data: { panelId } }),
    enabled: open,
    refetchInterval: 10_000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["queue-panels"] });
  };

  const sectorMutation = useMutation({
    mutationFn: () =>
      saveSector({
        data: { panelId, name: sectorDraft.name, prefix: sectorDraft.prefix || null },
      }),
    onSuccess: async () => {
      setSectorDraft({ name: "", prefix: "" });
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sectorDeleteMutation = useMutation({
    mutationFn: (sectorId: string) => removeSector({ data: { panelId, sectorId } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const sectorEditMutation = useMutation({
    mutationFn: (draft: SectorDraft) =>
      saveSector({
        data: {
          panelId,
          sectorId: draft.sectorId,
          name: draft.name,
          prefix: draft.prefix || null,
          dailyLimit: draft.dailyLimit.trim() === "" ? null : Number(draft.dailyLimit),
          operatorIds: draft.operatorIds,
        },
      }),
    onSuccess: async () => {
      toast.success("Setor atualizado.");
      setSectorEdit(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const operatorMutation = useMutation({
    mutationFn: (draft: OperatorDraft) =>
      saveOperator({
        data: {
          panelId,
          operatorId: draft.operatorId,
          name: draft.name,
          username: draft.username.trim().toLowerCase(),
          deskLabel: draft.deskLabel.trim() || null,
          password: draft.password || undefined,
          isEnabled: draft.isEnabled,
          sectorIds: draft.sectorIds,
        },
      }),
    onSuccess: async () => {
      toast.success("Operador salvo.");
      setOperatorDraft(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const operatorDeleteMutation = useMutation({
    mutationFn: (operatorId: string) => removeOperator({ data: { panelId, operatorId } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: (sectorId?: string | null) =>
      resetCounters({ data: { panelId, sectorId: sectorId ?? null } }),
    onSuccess: async () => {
      toast.success("Contadores zerados e fila limpa.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claimEmitterMutation = useMutation({
    mutationFn: () => claimEmitterFn({ data: { panelId, code: emitterCode } }),
    onSuccess: async () => {
      setEmitterCode("");
      toast.success("Terminal vinculado. Ele começará a imprimir automaticamente.");
      await queryClient.invalidateQueries({ queryKey: emittersQueryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEmitterMutation = useMutation({
    mutationFn: (emitterId: string) => removeEmitterFn({ data: { panelId, emitterId } }),
    onSuccess: async () => {
      toast.success("Terminal desvinculado.");
      await queryClient.invalidateQueries({ queryKey: emittersQueryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Libera ou bloqueia uma fila no emissor por token. */
  const issuingMutation = useMutation({
    mutationFn: (input: { sectorId: string; enabled: boolean }) =>
      setIssuing({ data: { panelId, sectorId: input.sectorId, enabled: input.enabled } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const kioskUrl = `${typeof window === "undefined" ? "" : window.location.origin}/emitir`;

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Users className="size-4" />
        Filas, operadores e emissão
      </Button>
    );
  }

  const startEditOperator = (operator: QueueOperatorRow) =>
    setOperatorDraft({
      operatorId: operator.id,
      name: operator.name,
      username: operator.username,
      deskLabel: operator.deskLabel ?? "",
      password: "",
      isEnabled: operator.isEnabled,
      sectorIds: operator.sectorIds,
    });

  const toggleSector = (sectorId: string) =>
    setOperatorDraft((draft) =>
      draft
        ? {
            ...draft,
            sectorIds: draft.sectorIds.includes(sectorId)
              ? draft.sectorIds.filter((id) => id !== sectorId)
              : [...draft.sectorIds, sectorId],
          }
        : draft,
    );

  const toggleSectorOperator = (operatorId: string) =>
    setSectorEdit((draft) =>
      draft
        ? {
            ...draft,
            operatorIds: draft.operatorIds.includes(operatorId)
              ? draft.operatorIds.filter((id) => id !== operatorId)
              : [...draft.operatorIds, operatorId],
          }
        : draft,
    );

  return (
    <div className="space-y-5 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Filas, operadores e emissão</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>

      {isPending ? (
        <div className="grid place-items-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {data ? (
        <>
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filas / setores
            </p>
            <div className="space-y-1.5">
              {data.sectors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum setor cadastrado. O emissor gera a senha diretamente ao tocar em Normal
                  ou Preferencial.
                </p>
              ) : null}
              {data.sectors.map((sector) => {
                const allowed = data.operators.filter((operator) =>
                  operator.sectorIds.includes(sector.id),
                );
                const isEditing = sectorEdit?.sectorId === sector.id;
                return (
                  <div key={sector.id} className="rounded-md border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">
                        {sector.prefix ? `${sector.prefix} · ` : ""}
                        {sector.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {allowed.length === 0
                            ? "Sem operador designado"
                            : `${allowed.length} operador(es)`}
                        </Badge>
                        {sector.waitingPriority > 0 ? (
                          <Badge variant="destructive">{sector.waitingPriority} pref.</Badge>
                        ) : null}
                        <Badge variant="secondary">{sector.waitingNormal} na fila</Badge>
                        <Badge variant="outline">
                          {sector.dailyLimit === null
                            ? `${sector.issuedToday} emitidas hoje`
                            : `${sector.issuedToday}/${sector.dailyLimit} hoje`}
                        </Badge>
                        <Badge variant="outline">normal nº {sector.lastNumber}</Badge>
                        <Badge variant="outline">pref. nº {sector.lastPriorityNumber}</Badge>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Emissão</span>
                          <Switch
                            checked={sector.issuingEnabled}
                            disabled={issuingMutation.isPending}
                            onCheckedChange={(checked) =>
                              issuingMutation.mutate({ sectorId: sector.id, enabled: checked })
                            }
                            aria-label={`Liberar emissão de senhas em ${sector.name}`}
                          />
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSectorEdit(
                              isEditing
                                ? null
                                : {
                                    sectorId: sector.id,
                                    name: sector.name,
                                    prefix: sector.prefix ?? "",
                                    dailyLimit:
                                      sector.dailyLimit === null ? "" : String(sector.dailyLimit),
                                    operatorIds: allowed.map((operator) => operator.id),
                                  },
                            )
                          }
                        >
                          {isEditing ? "Fechar" : "Configurar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label={`Remover ${sector.name}`}
                          onClick={() => sectorDeleteMutation.mutate(sector.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </div>

                    {isEditing && sectorEdit ? (
                      <form
                        className="grid gap-3 border-t border-border p-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          sectorEditMutation.mutate(sectorEdit);
                        }}
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor={`sector-name-${sector.id}`}>Nome do setor</Label>
                          <Input
                            id={`sector-name-${sector.id}`}
                            value={sectorEdit.name}
                            onChange={(event) =>
                              setSectorEdit((draft) =>
                                draft ? { ...draft, name: event.target.value } : draft,
                              )
                            }
                            required
                          />
                        </div>
                        <div className="w-24 space-y-1.5">
                          <Label htmlFor={`sector-prefix-${sector.id}`}>Prefixo</Label>
                          <Input
                            id={`sector-prefix-${sector.id}`}
                            value={sectorEdit.prefix}
                            maxLength={3}
                            onChange={(event) =>
                              setSectorEdit((draft) =>
                                draft
                                  ? { ...draft, prefix: event.target.value.toUpperCase() }
                                  : draft,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`sector-limit-${sector.id}`}>
                            Senhas disponíveis por dia (vazio = sem limite)
                          </Label>
                          <Input
                            id={`sector-limit-${sector.id}`}
                            value={sectorEdit.dailyLimit}
                            inputMode="numeric"
                            placeholder="Ex.: 50"
                            className="w-32"
                            onChange={(event) =>
                              setSectorEdit((draft) =>
                                draft
                                  ? {
                                      ...draft,
                                      dailyLimit: event.target.value.replace(/\D/g, "").slice(0, 4),
                                    }
                                  : draft,
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Ao atingir o limite, o terminal deixa de emitir senhas desta fila até o
                            dia seguinte. Hoje: {sector.issuedToday} emitida(s).
                          </p>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Operadores com acesso a esta chamada</Label>
                          <div className="flex flex-wrap gap-2">
                            {data.operators.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Cadastre operadores abaixo para liberar o acesso.
                              </p>
                            ) : null}
                            {data.operators.map((operator) => (
                              <Button
                                key={operator.id}
                                type="button"
                                size="sm"
                                variant={
                                  sectorEdit.operatorIds.includes(operator.id)
                                    ? "default"
                                    : "outline"
                                }
                                onClick={() => toggleSectorOperator(operator.id)}
                              >
                                {operator.name}
                              </Button>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Operadores sem nenhum setor designado continuam vendo todas as filas.
                          </p>
                        </div>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button type="submit" disabled={sectorEditMutation.isPending}>
                            {sectorEditMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Salvar setor
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setSectorEdit(null)}>
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive"
                            disabled={resetMutation.isPending}
                            onClick={() => resetMutation.mutate(sector.id)}
                          >
                            Zerar contador desta fila
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                sectorMutation.mutate();
              }}
            >
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor={`new-sector-${panelId}`}>Novo setor</Label>
                <Input
                  id={`new-sector-${panelId}`}
                  value={sectorDraft.name}
                  placeholder="Caixa, Farmácia, Triagem…"
                  onChange={(event) =>
                    setSectorDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="w-24 space-y-1.5">
                <Label htmlFor={`new-sector-prefix-${panelId}`}>Prefixo</Label>
                <Input
                  id={`new-sector-prefix-${panelId}`}
                  value={sectorDraft.prefix}
                  maxLength={3}
                  placeholder="C"
                  onChange={(event) =>
                    setSectorDraft((draft) => ({
                      ...draft,
                      prefix: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <Button type="submit" disabled={sectorMutation.isPending}>
                <Plus className="size-4" />
                Adicionar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => resetMutation.mutate(null)}
                disabled={resetMutation.isPending}
              >
                Zerar todos os contadores
              </Button>
            </form>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Operadores
            </p>
            <div className="space-y-1.5">
              {data.operators.map((operator) => (
                <div
                  key={operator.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{operator.name}</span>
                    <span className="text-muted-foreground"> · {operator.username}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {operator.deskLabel ? (
                      <Badge>{operator.deskLabel}</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {operator.sectorIds.length === 0
                        ? "Todas as filas"
                        : `${operator.sectorIds.length} fila(s)`}
                    </Badge>
                    {operator.isEnabled ? null : <Badge variant="secondary">Desativado</Badge>}
                    <Button variant="outline" size="sm" onClick={() => startEditOperator(operator)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={`Remover ${operator.name}`}
                      onClick={() => operatorDeleteMutation.mutate(operator.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>

            {operatorDraft ? (
              <form
                className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  operatorMutation.mutate(operatorDraft);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`op-name-${panelId}`}>Nome</Label>
                  <Input
                    id={`op-name-${panelId}`}
                    value={operatorDraft.name}
                    onChange={(event) =>
                      setOperatorDraft((draft) =>
                        draft ? { ...draft, name: event.target.value } : draft,
                      )
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`op-user-${panelId}`}>Usuário</Label>
                  <Input
                    id={`op-user-${panelId}`}
                    value={operatorDraft.username}
                    autoComplete="off"
                    onChange={(event) =>
                      setOperatorDraft((draft) =>
                        draft ? { ...draft, username: event.target.value } : draft,
                      )
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`op-desk-${panelId}`}>Guichê / mesa (opcional)</Label>
                  <Input
                    id={`op-desk-${panelId}`}
                    value={operatorDraft.deskLabel}
                    placeholder="Guichê 01"
                    onChange={(event) =>
                      setOperatorDraft((draft) =>
                        draft ? { ...draft, deskLabel: event.target.value } : draft,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Quando preenchido, a TV mostra e fala este guichê na chamada — vários guichês
                    podem atender a mesma fila sem repetir senha.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`op-pass-${panelId}`}>
                    Senha {operatorDraft.operatorId ? "(vazio = manter)" : "(mínimo 6)"}
                  </Label>
                  <Input
                    id={`op-pass-${panelId}`}
                    type="password"
                    autoComplete="new-password"
                    value={operatorDraft.password}
                    required={!operatorDraft.operatorId}
                    onChange={(event) =>
                      setOperatorDraft((draft) =>
                        draft ? { ...draft, password: event.target.value } : draft,
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id={`op-enabled-${panelId}`}
                    checked={operatorDraft.isEnabled}
                    onCheckedChange={(checked) =>
                      setOperatorDraft((draft) => (draft ? { ...draft, isEnabled: checked } : draft))
                    }
                  />
                  <Label htmlFor={`op-enabled-${panelId}`}>Ativo</Label>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Filas que este operador pode chamar</Label>
                  <div className="flex flex-wrap gap-2">
                    {data.sectors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Cadastre setores acima para designar filas.
                      </p>
                    ) : null}
                    {data.sectors.map((sector) => (
                      <Button
                        key={sector.id}
                        type="button"
                        size="sm"
                        variant={
                          operatorDraft.sectorIds.includes(sector.id) ? "default" : "outline"
                        }
                        onClick={() => toggleSector(sector.id)}
                      >
                        {sector.name}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sem nenhuma fila selecionada, o operador enxerga todas.
                  </p>
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={operatorMutation.isPending}>
                    {operatorMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Salvar operador
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setOperatorDraft(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setOperatorDraft(emptyOperator)}>
                <Plus className="size-4" />
                Novo operador
              </Button>
            )}
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vincular terminal emissor / impressor
              </p>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4 bg-muted/30">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Vinculação do terminal</p>
                  <p className="text-xs text-muted-foreground">
                    Abra a tela de emissão no tablet/totem ou o MDI360 Impressor no computador.
                    Digite aqui o código de 6 caracteres exibido no aparelho.
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Input
                    value={emitterCode}
                    onChange={(event) =>
                      setEmitterCode(
                        event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
                      )
                    }
                    className="w-36 font-mono text-lg font-bold tracking-[0.2em] uppercase"
                    placeholder="A1B2C3"
                    maxLength={6}
                    autoComplete="off"
                    aria-label="Código exibido no terminal emissor"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={emitterCode.length !== 6 || claimEmitterMutation.isPending}
                    onClick={() => claimEmitterMutation.mutate()}
                  >
                    {claimEmitterMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Vincular
                  </Button>
                </div>
              </div>
              {(emittersData?.items.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {emittersData!.items.map((emitter) => (
                    <div
                      key={emitter.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{emitter.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {emitter.lastSeenAt
                            ? `Último contato: ${new Date(emitter.lastSeenAt).toLocaleString("pt-BR")}`
                            : "Vinculado · aguardando primeiro contato"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={removeEmitterMutation.isPending}
                        onClick={() => removeEmitterMutation.mutate(emitter.id)}
                      >
                        <Trash2 className="size-4" />
                        Desvincular
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum terminal vinculado.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tela de emissão (totem / recepção)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={kioskUrl} className="min-w-56 flex-1 font-mono text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(kioskUrl);
                    toast.success("Endereço copiado.");
                  }}
                >
                  <Copy className="size-4" />
                  Copiar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={kioskUrl} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Abra este endereço em um tablet ou totem na recepção: o cliente escolhe o atendimento
                e retira senha normal ou preferencial.
              </p>
            </div>
          </section>

        </>
      ) : null}
    </div>
  );
}
