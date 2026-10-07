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
import { DEFAULT_ACTIVATION_BRANDING, type ActivationBrandStyle } from "@/lib/settings/activation-branding";

export function BrandSettings() {
  const queryClient = useQueryClient();
  const brandingFn = useServerFn(getBranding);
  const updateFn = useServerFn(updateBranding);
  const removeLogoFn = useServerFn(removeBrandLogo);
  const fileRef = useRef<HTMLInputElement>(null);

  const [splashText, setSplashText] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [activationStyle, setActivationStyle] = useState<ActivationBrandStyle>(DEFAULT_ACTIVATION_BRANDING);
  const [uploading, setUploading] = useState(false);

  const branding = useQuery({ queryKey: ["branding"], queryFn: () => brandingFn({}) });

  useEffect(() => {
    if (!branding.data) return;
    setSplashText(branding.data.splashText ?? "");
    setBrandColor(branding.data.brandColor ?? "#2563eb");
    setActivationStyle(branding.data.activationStyle ?? DEFAULT_ACTIVATION_BRANDING);
  }, [branding.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["branding"] });
  const previewOverlay = activationStyle.overlayMode === "solid"
    ? activationStyle.overlayColor
    : activationStyle.overlayMode === "gradient"
      ? `linear-gradient(${activationStyle.overlayAngle}deg, ${activationStyle.overlayColor}, ${activationStyle.overlayColorEnd})`
      : "transparent";
  const previewBackground = activationStyle.backgroundMode === "image" && activationStyle.backgroundImageUrl
    ? `url(${JSON.stringify(activationStyle.backgroundImageUrl)})`
    : undefined;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          splashText: splashText.trim() ? splashText.trim() : null,
          brandColor: brandColor || null,
          activationStyle,
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

            <div className="space-y-4 rounded-lg border border-border p-4">
              <div>
                <Label>Tela de vinculação</Label>
                <p className="text-xs text-muted-foreground">A tela do código usa estas mesmas definições no navegador e no app Android.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">Fundo
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3" value={activationStyle.backgroundMode} onChange={(e) => setActivationStyle((s) => ({ ...s, backgroundMode: e.target.value as "color" | "image" }))}>
                    <option value="color">Cor sólida</option><option value="image">Imagem</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">Cor do fundo
                  <Input type="text" value={activationStyle.backgroundColor} onChange={(e) => setActivationStyle((s) => ({ ...s, backgroundColor: e.target.value }))} />
                </label>
              </div>
              {activationStyle.backgroundMode === "image" ? (
                <label className="block space-y-1 text-sm">Imagem de fundo (URL HTTPS)
                  <Input value={activationStyle.backgroundImageUrl ?? ""} placeholder="https://..." onChange={(e) => setActivationStyle((s) => ({ ...s, backgroundImageUrl: e.target.value || null }))} />
                </label>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">Sobreposição
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3" value={activationStyle.overlayMode} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayMode: e.target.value as ActivationBrandStyle["overlayMode"] }))}>
                    <option value="none">Sem sobreposição</option><option value="solid">Cor sólida</option><option value="gradient">Gradiente</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">Ângulo do gradiente
                  <Input type="number" min={0} max={360} value={activationStyle.overlayAngle} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayAngle: Number(e.target.value) }))} />
                </label>
              </div>
              {activationStyle.overlayMode !== "none" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">Cor / opacidade
                    <div className="flex gap-2"><Input type="text" value={activationStyle.overlayColor} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayColor: e.target.value }))} /><Input type="number" min={0} max={100} value={activationStyle.overlayOpacity} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayOpacity: Number(e.target.value) }))} /></div>
                  </label>
                  {activationStyle.overlayMode === "gradient" ? <label className="space-y-1 text-sm">Cor final / opacidade
                    <div className="flex gap-2"><Input type="text" value={activationStyle.overlayColorEnd} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayColorEnd: e.target.value }))} /><Input type="number" min={0} max={100} value={activationStyle.overlayOpacityEnd} onChange={(e) => setActivationStyle((s) => ({ ...s, overlayOpacityEnd: Number(e.target.value) }))} /></div>
                  </label> : null}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {(["logo", "title", "code", "message"] as const).map((item) => {
                  const value = activationStyle[item];
                  return <div key={item} className="grid grid-cols-2 gap-2 text-sm">
                    <span className="col-span-2 font-medium">{item === "logo" ? "Logo" : item === "title" ? "Título" : item === "code" ? "Código" : "Mensagem"}</span>
                    <label>Esquerda (%)<Input type="number" min={0} max={100} value={value.x} onChange={(e) => setActivationStyle((s) => ({ ...s, [item]: { ...s[item], x: Number(e.target.value) } }))} /></label>
                    <label>Topo (%)<Input type="number" min={0} max={100} value={value.y} onChange={(e) => setActivationStyle((s) => ({ ...s, [item]: { ...s[item], y: Number(e.target.value) } }))} /></label>
                  </div>;
                })}
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
            <div className="relative aspect-video overflow-hidden rounded-lg bg-black text-center" style={{ backgroundColor: activationStyle.backgroundColor, backgroundImage: previewBackground, backgroundPosition: "center", backgroundSize: "cover" }}>
              <div className="absolute inset-0" style={{ background: previewOverlay, opacity: activationStyle.overlayMode === "none" ? 0 : 0.5 }} />
              {activationStyle.logo.visible && branding.data?.logoUrl ? <img src={branding.data.logoUrl} alt="Logo da marca" className="absolute max-h-[25%] -translate-x-1/2 -translate-y-1/2 object-contain" style={{ left: `${activationStyle.logo.x}%`, top: `${activationStyle.logo.y}%`, width: `${activationStyle.logo.width}%` }} /> : null}
              {activationStyle.title.visible ? <p className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 font-display font-semibold text-white" style={{ left: `${activationStyle.title.x}%`, top: `${activationStyle.title.y}%`, fontSize: `${Math.max(0.5, activationStyle.title.size / 4)}rem`, textAlign: activationStyle.title.align }}>{splashText || branding.data?.organizationName || "Sua marca"}</p> : null}
              <p className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 font-mono font-bold" style={{ left: `${activationStyle.code.x}%`, top: `${activationStyle.code.y}%`, color: brandColor, fontSize: `${Math.max(0.8, activationStyle.code.size / 4)}rem`, textAlign: activationStyle.code.align }}>A B C 1 2 3</p>
              {activationStyle.message.visible ? <p className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 text-xs text-white/70" style={{ left: `${activationStyle.message.x}%`, top: `${activationStyle.message.y}%`, fontSize: `${Math.max(0.45, activationStyle.message.size / 4)}rem`, textAlign: activationStyle.message.align }}>Aguardando vínculo</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
