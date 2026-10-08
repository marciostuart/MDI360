import { Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCanvasPreset } from "@/lib/media/presets";
import { prepareUpload } from "@/lib/media/optimize-client";

export function WidgetBackgroundUpload({
  assetId,
  scope,
  url,
  imageKey,
  onChange,
}: {
  assetId?: string;
  scope: string;
  url: string;
  imageKey?: string;
  onChange: (value: { url: string; imageKey: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!assetId) {
      toast.info("Salve o widget primeiro; depois escolha a imagem de fundo.");
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareUpload(file, getCanvasPreset("landscape-fhd"));
      if (prepared.kind !== "image") throw new Error("Selecione uma imagem.");
      const form = new FormData();
      form.append("assetId", assetId);
      form.append("scope", scope);
      form.append("file", prepared.blob, `${assetId}.webp`);
      const response = await fetch("/api/widgets/background", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string; url?: string; key?: string };
      if (!response.ok || !payload.url || !payload.key) throw new Error(payload.error ?? "Não foi possível salvar a imagem.");
      onChange({ url: payload.url, imageKey: payload.key });
      toast.success("Imagem de fundo atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!assetId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("assetId", assetId);
      form.append("scope", scope);
      form.append("remove", "1");
      const response = await fetch("/api/widgets/background", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível remover a imagem.");
      onChange({ url: "", imageKey: "" });
      toast.success("Imagem de fundo removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Imagem de fundo</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy || !assetId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {url ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="mr-1 size-4" /> Remover
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Redimensionada e convertida para WebP com qualidade de 75%.</p>
      {imageKey ? <p className="truncate text-xs text-muted-foreground">Imagem armazenada com segurança.</p> : null}
    </div>
  );
}

