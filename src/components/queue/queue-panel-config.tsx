import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";
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
  rotateQueueKioskToken,
  saveQueueOperator,
  saveQueueSector,
  setQueueIssuing,
  type QueueOperatorRow,
} from "@/lib/queue/queue.functions";

type SectorDraft = {
  sectorId: string;
  name: string;
  prefix: string;
  operatorIds: string[];
};

type OperatorDraft = {
  operatorId?: string;
  name: string;
  username: string;
  password: string;
  isEnabled: boolean;
  sectorIds: string[];
};

const emptyOperator: OperatorDraft = {
  name: "",
  username: "",
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
  kioskToken,
  issuingEnabled,
}: {
  panelId: string;
  kioskToken: string | null;
  issuingEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const loadDetails = useServerFn(getQueuePanelDetails);
  const saveSector = useServerFn(saveQueueSector);
  const removeSector = useServerFn(deleteQueueSector);
  const saveOperator = useServerFn(saveQueueOperator);
  const removeOperator = useServerFn(deleteQueueOperator);
  const resetCounters = useServerFn(resetQueueCounters);
  const rotateToken = useServerFn(rotateQueueKioskToken);
  const setIssuing = useServerFn(setQueueIssuing);

  const [open, setOpen] = useState(false);
  const [sectorDraft, setSectorDraft] = useState({ name: "", prefix: "" });
  const [sectorEdit, setSectorEdit] = useState<SectorDraft | null>(null);
  const [operatorDraft, setOperatorDraft] = useState<OperatorDraft | null>(null);

  const queryKey = ["queue-panel-details", panelId];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => loadDetails({ data: { panelId } }),
    enabled: open,
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
    mutationFn: () => resetCounters({ data: { panelId } }),
    onSuccess: async () => {
      toast.success("Contadores zerados e fila limpa.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateToken({ data: { panelId } }),
    onSuccess: async () => {
      toast.success("Novo endereço de emissão gerado.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Libera/bloqueia a emissão no terminal (tela inteira ou uma fila). */
  const issuingMutation = useMutation({
    mutationFn: (input: { sectorId: string | null; enabled: boolean }) =>
      setIssuing({ data: { panelId, sectorId: input.sectorId, enabled: input.enabled } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const kioskUrl = kioskToken
    ? `${typeof window === "undefined" ? "" : window.location.origin}/emitir/${kioskToken}`
    : null;

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
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Emissão no terminal (/emitir)</p>
              <p className="text-xs text-muted-foreground">
                Quando ligado, esta tela aparece no terminal de emissão — que usa o seu próprio
                login do painel. As mudanças chegam ao terminal em poucos segundos.
              </p>
            </div>
            <Switch
              checked={issuingEnabled}
              disabled={issuingMutation.isPending}
              onCheckedChange={(checked) =>
                issuingMutation.mutate({ sectorId: null, enabled: checked })
              }
              aria-label="Liberar emissão de senhas no terminal"
            />
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filas / setores
            </p>
            <div className="space-y-1.5">
              {data.sectors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum setor cadastrado. No modo sequencial isso não é necessário.
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
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                Zerar contadores
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

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tela de emissão (totem / recepção)
            </p>
            {kioskUrl ? (
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => rotateMutation.mutate()}
                  disabled={rotateMutation.isPending}
                >
                  <RefreshCw className="size-4" />
                  Gerar novo
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => rotateMutation.mutate()}
                disabled={rotateMutation.isPending}
              >
                <RefreshCw className="size-4" />
                Gerar endereço de emissão
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Abra este endereço em um tablet ou totem na recepção: o cliente escolhe o atendimento
              e retira senha normal ou preferencial.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
