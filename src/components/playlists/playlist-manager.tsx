import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListVideo, Loader2, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlaylistEditorDialog } from "@/components/playlists/playlist-editor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
} from "@/lib/playlists/playlists.functions";

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

export function PlaylistManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlaylists);
  const createFn = useServerFn(createPlaylist);
  const deleteFn = useServerFn(deletePlaylist);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => listFn({}) });

  const createMutation = useMutation({
    mutationFn: (name: string) => createFn({ data: { name } }),
    onSuccess: async (result, name) => {
      setNewName("");
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setEditing({ id: result.id, name });
      toast.success("Lista criada. Arraste os conteúdos para montá-la.");
    },
    onError: () => toast.error("Não foi possível criar a lista."),
  });

  const deleteMutation = useMutation({
    mutationFn: (playlistId: string) => deleteFn({ data: { playlistId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Lista excluída.");
    },
    onError: () => toast.error("Não foi possível excluir a lista."),
  });

  if (playlists.data && !playlists.data.configured) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Conecte o banco de dados (DATABASE_URL) para usar as playlists.
        </CardContent>
      </Card>
    );
  }

  const items = playlists.data?.items ?? [];
  const term = search.trim().toLowerCase();
  const visible = items
    .filter((item) => !term || item.name.toLowerCase().includes(term))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortBy === "oldest" ? diff : -diff;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Clique no nome de uma lista para abrir o montador: à esquerda ficam todos os conteúdos
          disponíveis (arquivos, entretenimento e ferramentas) e à direita a sequência da lista.
          Basta arrastar e soltar na ordem desejada.
        </p>
        <Button className="gap-2" onClick={() => setShowCreate((value) => !value)}>
          <Plus className="size-4" />
          {showCreate ? "Fechar" : "Nova lista"}
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label htmlFor="playlist-name">Nome da nova lista</Label>
            <div className="flex max-w-md gap-2">
              <Input
                id="playlist-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ex.: Vitrine manhã"
              />
              <Button
                onClick={() => createMutation.mutate(newName.trim())}
                disabled={newName.trim().length === 0 || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Criar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar listas"
            className="pl-9"
            aria-label="Pesquisar listas"
          />
        </div>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-[210px]" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Alteração mais recente</SelectItem>
            <SelectItem value="oldest">Alteração mais antiga</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {playlists.isPending ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma lista ainda. Crie a primeira pelo botão acima.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma lista encontrada com essa busca.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((playlist) => (
            <div key={playlist.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <ListVideo className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setEditing({ id: playlist.id, name: playlist.name })}
                    className="truncate text-left text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
                  >
                    {playlist.name}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{playlist.itemCount} item(ns)</Badge>
                  <Badge variant="outline">{formatDuration(playlist.totalDurationMs)}</Badge>
                  <Badge variant="outline">
                    Atualizada em {new Date(playlist.updatedAt).toLocaleDateString("pt-BR")}
                  </Badge>
                  {playlist.itemCount === 0 ? (
                    <Badge variant="destructive">Vazia</Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditing({ id: playlist.id, name: playlist.name })}
                >
                  <Settings2 className="size-4" />
                  Gerenciar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => deleteMutation.mutate(playlist.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Remover ${playlist.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <PlaylistEditorDialog
          playlistId={editing.id}
          playlistName={editing.name}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
