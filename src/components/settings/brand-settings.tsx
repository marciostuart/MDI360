import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBranding, removeBrandLogo, updateBranding } from "@/lib/settings/branding.functions";

export function BrandSettings() {
  const queryClient = useQueryClient();
  const brandingFn = useServerFn(getBranding);
  const updateFn = useServerFn(updateBranding);
  const removeLogoFn = useServerFn(removeBrandLogo);
  const fileRef = useRef<HTMLInputElement>(null);

  const [splashText, setSplashText] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [uploading, setUploading] = useState(false);

  const branding = useQuery({ queryKey: ["branding"], queryFn: () => brandingFn({}) });

  useEffect(() => {
    if (!branding.data) return;
    setSplashText(branding.data.splashText ?? "");
    setBrandColor(branding.data.brandColor ?? "#2563eb");
  }, [branding.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["branding"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          splashText: splashText.trim() ? splashText.trim() : null,
          brandColor: brandColor || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Marca atualizada. As telas aplicam na próxima sincronização.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível salvar a marca."),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeLogoFn({}),
    onSuccess: async () => {
      toast.success("Logo removida.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível remover a logo."),
  });

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/branding/logo", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "upload");
      toast.success("Logo enviada.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio da logo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Personalize a marca exibida nas TVs. O mesmo aplicativo atende todas as telas — logo,
          texto e cor são aplicados automaticamente em cada aparelho vinculado à sua conta.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marca do aplicativo</CardTitle>
            <CardDescription>
              Aplicada na abertura do app na TV e na tela do código de ativação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Logo (PNG, JPG, WEBP ou SVG, até 1 MB)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageUp className="size-4" />
                  )}
                  Enviar logo
                </Button>
                {branding.data?.hasLogo ? (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => removeMutation.mutate()}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    Remover
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="splash-text">Texto de abertura</Label>
              <Input
                id="splash-text"
                value={splashText}
                maxLength={80}
                placeholder={branding.data?.organizationName ?? "Ex.: Rede Bom Preço"}
                onChange={(event) => setSplashText(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-color">Cor de destaque</Label>
              <div className="flex items-center gap-3">
                <input
                  id="brand-color"
                  type="color"
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background"
                />
                <Input
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="w-36 font-mono"
                  maxLength={7}
                />
              </div>
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar marca
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização na TV</CardTitle>
            <CardDescription>É assim que a abertura aparece nos aparelhos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid aspect-video place-items-center rounded-lg bg-black px-6 text-center">
              <div className="space-y-4">
                {branding.data?.logoUrl ? (
                  <img
                    src={branding.data.logoUrl}
                    alt="Logo da marca"
                    className="mx-auto max-h-20 object-contain"
                  />
                ) : (
                  <div
                    className="mx-auto size-12 rounded-xl"
                    style={{ backgroundColor: brandColor }}
                  />
                )}
                <p className="font-display text-lg font-semibold text-white">
                  {splashText || branding.data?.organizationName || "Sua marca"}
                </p>
                <div
                  className="mx-auto h-1 w-24 rounded-full"
                  style={{ backgroundColor: brandColor }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}