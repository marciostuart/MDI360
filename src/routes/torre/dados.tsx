import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SUPPORT_RESOURCES,
  editableSupportValues,
  type SupportResource,
} from "@/lib/admin/support-resources";
import {
  attachSupportQueue,
  deleteSupportOrphanFile,
  listSupportFiles,
  listSupportOrganizations,
  listSupportRecords,
  mutateSupportRecord,
  retrySupportCleanup,
} from "@/lib/admin/support.functions";

export const Route = createFileRoute("/torre/dados")({
  validateSearch: (search: Record<string, unknown>) => ({
    organizationId:
      typeof search.organizationId === "string" && /^[0-9a-f-]{36}$/i.test(search.organizationId)
        ? search.organizationId
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dados e suporte | Torre MDI 360" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportData,
});

const labels: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  username: "Usuário",
  desk_label: "Guichê",
  is_active: "Ativo",
  is_enabled: "Habilitado",
  issuing_enabled: "Emissão habilitada",
  status: "Estado (active ou blocked)",
  address: "Endereço",
  timezone: "Fuso horário",
  description: "Descrição",
  priority: "Prioridade",
  roles: "Perfis",
};
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";
type Row = {
  record: Record<string, unknown>;
  organization_id: string | null;
  organization_name: string | null;
};
type Action =
  | { kind: "edit" | "delete" | "attach"; row: Row; resource: SupportResource }
  | { kind: "file"; key: string; organizationId: string };

function SupportData() {
  const qc = useQueryClient();
  const [resource, setResource] = useState<SupportResource>("queue_panels");
  const [organizationId, setOrganizationId] = useState(Route.useSearch().organizationId ?? "");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [detachedOnly, setDetachedOnly] = useState(false);
  const [files, setFiles] = useState(false);
  const [area, setArea] = useState<"org" | "branding">("org");
  const [cursor, setCursor] = useState<string>();
  const [action, setAction] = useState<Action | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const organizations = useQuery({
    queryKey: ["support-orgs"],
    queryFn: () => listSupportOrganizations(),
  });
  const rows = useQuery({
    queryKey: ["support-records", resource, organizationId, query, page, detachedOnly],
    queryFn: () =>
      listSupportRecords({
        data: {
          resource,
          organizationId: organizationId || undefined,
          search: query,
          page,
          detachedOnly,
        },
      }),
    enabled: !files,
  });
  const objects = useQuery({
    queryKey: ["support-files", organizationId, area, cursor],
    queryFn: () =>
      listSupportFiles({ data: { organizationId: organizationId || undefined, area, cursor } }),
    enabled: files && (!organizationId || /^[0-9a-f-]{36}$/i.test(organizationId)),
    retry: false,
  });
  const targets = useQuery({
    queryKey: ["support-targets", action?.kind === "attach" ? action.row.organization_id : null],
    queryFn: () =>
      listSupportRecords({
        data: {
          resource: "devices",
          organizationId: action?.kind === "attach" ? action.row.organization_id! : undefined,
          search: "",
          page: 0,
          detachedOnly: false,
        },
      }),
    enabled: action?.kind === "attach",
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["support-records"] });
    void qc.invalidateQueries({ queryKey: ["support-files"] });
  };
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) return;
      if (action.kind === "file")
        return deleteSupportOrphanFile({
          data: { organizationId: action.organizationId, key: action.key, confirmation, reason },
        });
      if (action.kind === "attach")
        return attachSupportQueue({
          data: {
            organizationId: action.row.organization_id!,
            panelId: String(action.row.record.id),
            deviceId,
            reason,
          },
        });
      return mutateSupportRecord({
        data: {
          resource: action.resource,
          id: String(action.row.record.id),
          organizationId: action.row.organization_id,
          action: action.kind,
          values,
          reason,
          confirmation,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        "Operação registrada. Consulte as limpezas pendentes se o armazenamento estiver indisponível.",
      );
      setAction(null);
      refresh();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível concluir a operação."),
  });
  const retry = useMutation({
    mutationFn: () => retrySupportCleanup(),
    onSuccess: (result) => {
      toast.success(
        `${result.deleted} arquivo(s) removido(s); ${result.failed} falha(s); ${result.skipped} ainda em uso.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const open = (next: Action) => {
    setAction(next);
    setReason("");
    setConfirmation("");
    setDeviceId("");
    setValues(next.kind === "edit" ? editableSupportValues(next.resource, next.row.record) : {});
  };
  const destructive = action?.kind === "delete" || action?.kind === "file";
  const expected =
    action?.kind === "file"
      ? action.key
      : action && "row" in action
        ? String(action.row.record.id)
        : "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Dados e suporte global</h1>
        <p className="text-sm text-muted-foreground">
          Todas as empresas, filas sem terminal, usuários e arquivos. Alterações exigem motivo e
          ficam na auditoria. Nenhuma limpeza em massa é automática.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Estabelecimento"
          className={selectClass}
          value={organizationId}
          onChange={(e) => {
            setOrganizationId(e.target.value);
            setPage(0);
            setCursor(undefined);
          }}
        >
          <option value="">Todas as empresas</option>
          {organizations.data?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <Button variant={files ? "outline" : "default"} onClick={() => setFiles(false)}>
          Cadastros
        </Button>
        <Button variant={files ? "default" : "outline"} onClick={() => setFiles(true)}>
          Arquivos / possíveis órfãos
        </Button>
        <Button
          variant="outline"
          disabled={retry.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Reprocessar até 50 exclusões de arquivos já registradas? Arquivos ainda referenciados serão preservados.",
              )
            )
              retry.mutate();
          }}
        >
          Reprocessar limpezas pendentes
        </Button>
      </div>
      {organizations.error ? (
        <p role="alert">Não foi possível carregar as empresas. Verifique seu acesso à Torre.</p>
      ) : null}
      {!files ? (
        <>
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
              setPage(0);
            }}
          >
            <select
              aria-label="Tipo de cadastro"
              className={selectClass}
              value={resource}
              onChange={(e) => {
                setResource(e.target.value as SupportResource);
                setPage(0);
              }}
            >
              {Object.entries(SUPPORT_RESOURCES).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
            <Input
              aria-label="Buscar nome, usuário ou ID"
              className="max-w-sm"
              placeholder="Buscar nome, usuário, e-mail ou ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button>Buscar</Button>
            {resource === "queue_panels" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={detachedOnly}
                  onChange={(e) => {
                    setDetachedOnly(e.target.checked);
                    setPage(0);
                  }}
                />
                Somente sem terminal
              </label>
            ) : null}
          </form>
          {rows.isPending ? (
            <p>Carregando…</p>
          ) : rows.error ? (
            <p role="alert">Não foi possível consultar os dados. {rows.error.message}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {rows.data?.total ?? 0} registro(s). Página {page + 1}, até 50 por página.
              </p>
              <div className="space-y-3">
                {rows.data?.items.map((row) => (
                  <div key={String(row.record.id)} className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {String(
                            row.record.name ??
                              row.record.username ??
                              row.record.label ??
                              row.record.storage_key ??
                              row.record.id,
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {row.organization_name ?? "Sem empresa vinculada"} ·{" "}
                          {String(row.record.id)}
                        </p>
                        {row.linked_terminals !== null ? (
                          <p
                            className={
                              row.linked_terminals === 0
                                ? "text-sm text-amber-500"
                                : "text-sm text-muted-foreground"
                            }
                          >
                            {row.linked_terminals} terminal(is) vinculado(s)
                            {row.linked_terminals === 0
                              ? " — fila preservada; login ainda reservado"
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.organization_id ? (
                          <Button variant="outline" asChild>
                            <Link
                              to="/torre/clientes/$organizationId"
                              params={{ organizationId: row.organization_id }}
                            >
                              Empresa / suporte
                            </Link>
                          </Button>
                        ) : null}
                        {Object.keys(SUPPORT_RESOURCES[resource].edit.shape).length ? (
                          <Button
                            variant="outline"
                            onClick={() => open({ kind: "edit", row, resource })}
                          >
                            Editar
                          </Button>
                        ) : null}
                        {resource === "queue_panels" && row.organization_id ? (
                          <Button
                            variant="outline"
                            onClick={() => open({ kind: "attach", row, resource })}
                          >
                            Vincular terminal
                          </Button>
                        ) : null}
                        {SUPPORT_RESOURCES[resource].deletable ? (
                          <Button
                            variant="destructive"
                            onClick={() => open({ kind: "delete", row, resource })}
                          >
                            Excluir
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer">
                        Ver todos os dados (sem senhas e tokens)
                      </summary>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(row.record, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
                {!rows.data?.items.length ? <p>Nenhum registro encontrado.</p> : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 >= (rows.data?.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A visão global inclui arquivos de empresas já excluídas. Filtre por empresa ou informe
            seu UUID. Arquivos sem referência há menos de 24 horas são protegidos. Mídias em uso
            podem ser excluídas em Cadastros → Mídias; outros vínculos devem ser removidos em sua
            configuração.
          </p>
          <Input
            aria-label="UUID da empresa para inventário"
            className="max-w-md"
            placeholder="UUID da empresa"
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setCursor(undefined);
            }}
          />
          <select
            aria-label="Área de arquivos"
            className={selectClass}
            value={area}
            onChange={(e) => {
              setArea(e.target.value as typeof area);
              setCursor(undefined);
            }}
          >
            <option value="org">Conteúdos e filas</option>
            <option value="branding">Logos</option>
          </select>
          {objects.error ? (
            <p role="alert">Falha no inventário: {objects.error.message}</p>
          ) : objects.isFetching ? (
            <p>Verificando arquivos e referências…</p>
          ) : (
            objects.data?.items.map((file) => (
              <div
                key={file.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm">{file.key}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.size} bytes · {file.modifiedAt} ·{" "}
                    {file.referenced
                      ? "Em uso / referenciado"
                      : file.mature
                        ? "Candidato a órfão"
                        : "Recente: protegido"}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  disabled={file.referenced || !file.mature || !file.organizationId}
                  onClick={() =>
                    open({ kind: "file", key: file.key, organizationId: file.organizationId! })
                  }
                >
                  Excluir órfão
                </Button>
              </div>
            ))
          )}
          {!objects.data?.items.length && !objects.isFetching ? (
            <p>Nenhum arquivo nesta página.</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>
              Primeira página
            </Button>
            <Button
              variant="outline"
              disabled={!objects.data?.cursor}
              onClick={() => setCursor(objects.data!.cursor!)}
            >
              Próximos arquivos
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={Boolean(action)}
        onOpenChange={(opened) => {
          if (!opened && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {destructive
                ? "Confirmar exclusão permanente"
                : action?.kind === "attach"
                  ? "Recuperar vínculo da fila"
                  : "Editar cadastro"}
            </DialogTitle>
            <DialogDescription>
              {destructive
                ? "A exclusão não pode ser desfeita. Filas perdem operadores, setores, senhas e vínculos. Mídias saem das playlists e o arquivo é encaminhado à limpeza. Excluir um terminal revoga seu vínculo, mas preserva sua fila."
                : "Somente campos seguros são editáveis. Identificadores e vínculos entre empresas não podem ser alterados livremente."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {action?.kind === "edit" ? (
              <>
                {Object.entries(values)
                  .filter(([key]) => key !== "password" && key !== "clear_file_slot")
                  .map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`support-${key}`}>{labels[key] ?? key}</Label>
                      {key === "roles" ? (
                        <select
                          id={`support-${key}`}
                          className={`${selectClass} h-24 w-full`}
                          multiple
                          value={Array.isArray(value) ? (value as string[]) : []}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              roles: Array.from(e.target.selectedOptions, (option) => option.value),
                            })
                          }
                        >
                          <option value="owner">Proprietário</option>
                          <option value="admin">Administrador</option>
                          <option value="operator">Operador</option>
                        </select>
                      ) : typeof value === "boolean" ? (
                        <input
                          id={`support-${key}`}
                          type="checkbox"
                          checked={value}
                          onChange={(e) => setValues({ ...values, [key]: e.target.checked })}
                          className="ml-3"
                        />
                      ) : (
                        <Input
                          id={`support-${key}`}
                          type={
                            typeof value === "number"
                              ? "number"
                              : key === "email"
                                ? "email"
                                : "text"
                          }
                          value={value === null ? "" : String(value)}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [key]:
                                typeof value === "number"
                                  ? Number(e.target.value)
                                  : e.target.value === "" && value === null
                                    ? null
                                    : e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                {action.resource === "queue_panels" ? (
                  <div className="space-y-1">
                    <Label>Remover arquivo exclusivo (opcional)</Label>
                    <select
                      className={`${selectClass} w-full`}
                      value={String(values.clear_file_slot ?? "")}
                      onChange={(e) => {
                        const next = { ...values };
                        if (e.target.value) next.clear_file_slot = e.target.value;
                        else delete next.clear_file_slot;
                        setValues(next);
                      }}
                    >
                      <option value="">Manter os arquivos</option>
                      <option value="theme_bg_image_key">Fundo da chamada</option>
                      <option value="theme_image_key">Bloco de imagem da chamada</option>
                      <option value="kiosk_bg_image_key">Fundo do emissor</option>
                      <option value="kiosk_logo_key">Logo do emissor</option>
                      <option value="kiosk_image_key">Bloco de imagem do emissor</option>
                      <option value="chime_storage_key">Tom da chamada</option>
                    </select>
                  </div>
                ) : null}
                {action.resource === "users" || action.resource === "queue_operators" ? (
                  <div className="space-y-1">
                    <Label>Nova senha (opcional; deixe vazia para manter)</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      onChange={(e) => {
                        const next = { ...values };
                        if (e.target.value) next.password = e.target.value;
                        else delete next.password;
                        setValues(next);
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {action?.kind === "attach" ? (
              <div className="space-y-1">
                <Label>Terminal da mesma empresa</Label>
                <select
                  className={`${selectClass} w-full`}
                  required
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {targets.data?.items
                    .filter((row) => row.record.status !== "pending")
                    .map((row) => (
                      <option key={String(row.record.id)} value={String(row.record.id)}>
                        {String(row.record.name)} · {String(row.record.id)}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="support-reason">Motivo do atendimento / moderação</Label>
              <Input
                id="support-reason"
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {destructive ? (
              <div className="space-y-1">
                <Label htmlFor="support-confirm">
                  Digite exatamente: <span className="break-all">{expected}</span>
                </Label>
                <Input
                  id="support-confirm"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : null}
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={mutation.isPending || (destructive && confirmation !== expected)}
            >
              {mutation.isPending
                ? "Processando…"
                : destructive
                  ? "Excluir definitivamente"
                  : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
