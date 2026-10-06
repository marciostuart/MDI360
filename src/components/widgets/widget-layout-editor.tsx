import { Eye, EyeOff, Move, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidgetView } from "@/components/widgets/widget-view";
import {
  LAYOUT_PRESETS,
  WIDGET_BLOCKS,
  resolveWidgetLayout,
  type WidgetBlock,
  type WidgetConfig,
  type WidgetLayout,
} from "@/lib/widgets/catalog";

const ALIGNMENTS: { id: WidgetBlock["align"]; label: string }[] = [
  { id: "left", label: "Esquerda" },
  { id: "center", label: "Centro" },
  { id: "right", label: "Direita" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Free-form editor: the customer drags each piece of the widget over a live
 * preview and fine-tunes font size, width, alignment and visibility. The values
 * are relative to the screen, so the arrangement holds on any TV or totem.
 */
export function WidgetLayoutEditor({
  config,
  onChange,
  layout: suppliedLayout,
  defaultLayout,
  previewConfig,
  title = "Layout livre (arraste e solte)",
}: {
  config: WidgetConfig;
  onChange: (layout: WidgetLayout) => void;
  layout?: WidgetLayout;
  defaultLayout?: WidgetLayout;
  previewConfig?: WidgetConfig;
  title?: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocks = WIDGET_BLOCKS[config.type];
  const layout =
    suppliedLayout ?? resolveWidgetLayout(config.type, config.layout as WidgetLayout | undefined);
  const [selected, setSelected] = useState<string>(blocks[0]?.id ?? "");
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const current = layout[selected];

  function patch(id: string, next: Partial<WidgetBlock>) {
    onChange({ ...layout, [id]: { ...layout[id]!, ...next } });
  }

  function pointerPercent(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function startDrag(id: string, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const point = pointerPercent(event);
    if (!point) return;
    const block = layout[id]!;
    dragRef.current = { id, dx: point.x - block.x, dy: point.y - block.y };
    setSelected(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointerPercent(event);
    if (!point) return;
    patch(drag.id, {
      x: Math.round(clamp(point.x - drag.dx, -5, 98) * 10) / 10,
      y: Math.round(clamp(point.y - drag.dy, -5, 98) * 10) / 10,
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  function nudge(dx: number, dy: number) {
    if (!current) return;
    patch(selected, {
      x: Math.round(clamp(current.x + dx, -5, 98) * 10) / 10,
      y: Math.round(clamp(current.y + dy, -5, 98) * 10) / 10,
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            Arraste cada item na prévia para posicioná-lo e ajuste o tamanho da fonte, a largura e o
            alinhamento.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...(defaultLayout ?? LAYOUT_PRESETS[config.type]) })}
        >
          <RotateCcw className="size-4" />
          Padrão
        </Button>
      </div>

      <div
        ref={canvasRef}
        className="relative w-full select-none overflow-hidden rounded-xl border border-border"
        style={{ aspectRatio: "16 / 9" }}
      >
        <div className="pointer-events-none absolute inset-0">
          <WidgetView config={previewConfig ?? config} />
        </div>
        {blocks.map((entry) => {
          const block = layout[entry.id];
          if (!block) return null;
          const active = selected === entry.id;
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => startDrag(entry.id, event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") nudge(-1, 0);
                if (event.key === "ArrowRight") nudge(1, 0);
                if (event.key === "ArrowUp") nudge(0, -1);
                if (event.key === "ArrowDown") nudge(0, 1);
              }}
              className={`absolute cursor-move rounded-md border-2 border-dashed transition-colors ${
                active
                  ? "border-primary bg-primary/15"
                  : "border-primary/35 bg-primary/5 hover:border-primary/70"
              } ${block.hidden ? "opacity-40" : ""}`}
              style={{
                left: `${block.x}%`,
                top: `${block.y}%`,
                width: `${block.w}%`,
                height: `${clamp(block.size * 1.5, 4, 60)}%`,
                touchAction: "none",
              }}
            >
              <span className="absolute -top-0.5 left-1 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-primary">
                <Move className="size-3" />
                {entry.label}
              </span>
            </div>
          );
        })}
      </div>

      {current ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {blocks.map((entry) => (
              <Button
                key={entry.id}
                type="button"
                size="sm"
                variant={selected === entry.id ? "default" : "outline"}
                onClick={() => setSelected(entry.id)}
              >
                {entry.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tamanho da fonte: {current.size.toFixed(1)}% da altura</Label>
              <Slider
                min={1}
                max={34}
                step={0.2}
                value={[current.size]}
                onValueChange={([value]) => patch(selected, { size: value ?? current.size })}
              />
            </div>
            <div className="space-y-2">
              <Label>Largura do bloco: {Math.round(current.w)}%</Label>
              <Slider
                min={5}
                max={100}
                step={1}
                value={[current.w]}
                onValueChange={([value]) => patch(selected, { w: value ?? current.w })}
              />
            </div>
            <div className="space-y-2">
              <Label>Horizontal: {current.x.toFixed(1)}%</Label>
              <Slider
                min={-5}
                max={98}
                step={0.5}
                value={[current.x]}
                onValueChange={([value]) => patch(selected, { x: value ?? current.x })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vertical: {current.y.toFixed(1)}%</Label>
              <Slider
                min={-5}
                max={98}
                step={0.5}
                value={[current.y]}
                onValueChange={([value]) => patch(selected, { y: value ?? current.y })}
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cor da fonte deste item</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 cursor-pointer p-1"
                  value={current.color || "#ffffff"}
                  onChange={(event) => patch(selected, { color: event.target.value, colorOpacity: 100 })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => patch(selected, { color: "" })}
                >
                  Herdar cor do widget
                </Button>
              </div>
              <Label className="text-xs">Opacidade da fonte: {current.colorOpacity}%</Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[current.colorOpacity]}
                onValueChange={([value]) => patch(selected, { colorOpacity: value ?? 100 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fundo deste item</Label>
              <Select
                value={current.backgroundMode}
                onValueChange={(value) => patch(selected, { backgroundMode: value as WidgetBlock["backgroundMode"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transparent">Transparente</SelectItem>
                  <SelectItem value="solid">Cor sólida</SelectItem>
                  <SelectItem value="gradient">Degradê</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 cursor-pointer p-1"
                  value={current.backgroundColor || "#000000"}
                  onChange={(event) => patch(selected, { backgroundColor: event.target.value, backgroundMode: "solid" })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => patch(selected, { backgroundColor: "", backgroundMode: "transparent" })}
                >
                  Transparente
                </Button>
              </div>
              <Label className="text-xs">Opacidade da cor sólida: {current.backgroundColorOpacity}%</Label>
              <Slider min={0} max={100} step={1} value={[current.backgroundColorOpacity]} onValueChange={([value]) => patch(selected, { backgroundColorOpacity: value ?? 100 })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Imagem de fundo exclusiva deste item (URL HTTPS)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://.../fundo-do-item.jpg"
                  value={current.backgroundImageUrl}
                  onChange={(event) => patch(selected, { backgroundImageUrl: event.target.value, backgroundMode: "image" })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => patch(selected, { backgroundImageUrl: "", backgroundMode: "transparent" })}
                >
                  Remover
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A imagem ocupa somente este item e acompanha a proporÃ§Ã£o da tela na TV.
              </p>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="font-medium">Gradiente e sobreposição deste item</div>
              <p className="text-xs text-muted-foreground">
                Use o gradiente como fundo do bloco ou como uma camada de leitura sobre a imagem.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Início do gradiente</Label>
              <div className="flex items-center gap-3">
                <Input type="color" className="h-10 w-16 cursor-pointer p-1" value={current.backgroundGradientFrom} onChange={(event) => patch(selected, { backgroundGradientFrom: event.target.value, backgroundMode: "gradient" })} />
                <div className="min-w-0 flex-1">
                  <Label className="text-xs">{current.backgroundGradientFromOpacity}%</Label>
                  <Slider min={0} max={100} step={1} value={[current.backgroundGradientFromOpacity]} onValueChange={([value]) => patch(selected, { backgroundGradientFromOpacity: value ?? 65, backgroundMode: "gradient" })} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fim do gradiente</Label>
              <div className="flex items-center gap-3">
                <Input type="color" className="h-10 w-16 cursor-pointer p-1" value={current.backgroundGradientTo} onChange={(event) => patch(selected, { backgroundGradientTo: event.target.value, backgroundMode: "gradient" })} />
                <div className="min-w-0 flex-1">
                  <Label className="text-xs">{current.backgroundGradientToOpacity}%</Label>
                  <Slider min={0} max={100} step={1} value={[current.backgroundGradientToOpacity]} onValueChange={([value]) => patch(selected, { backgroundGradientToOpacity: value ?? 10, backgroundMode: "gradient" })} />
                </div>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Ângulo do gradiente: {current.backgroundGradientAngle}°</Label>
              <Slider min={0} max={360} step={1} value={[current.backgroundGradientAngle]} onValueChange={([value]) => patch(selected, { backgroundGradientAngle: value ?? 160, backgroundMode: "gradient" })} />
            </div>
            {current.backgroundImageUrl ? (
              <>
                <div className="space-y-2">
                  <Label>Sobreposição sobre a imagem</Label>
                  <Select value={current.imageOverlayMode} onValueChange={(value) => patch(selected, { imageOverlayMode: value as WidgetBlock["imageOverlayMode"], backgroundMode: "image" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem sobreposição</SelectItem>
                      <SelectItem value="solid">Cor sólida</SelectItem>
                      <SelectItem value="gradient">Degradê</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {current.imageOverlayMode === "solid" ? (
                  <div className="space-y-2">
                    <Label>Cor da sobreposição</Label>
                    <div className="flex items-center gap-3">
                      <Input type="color" className="h-10 w-16 cursor-pointer p-1" value={current.imageOverlayColor} onChange={(event) => patch(selected, { imageOverlayColor: event.target.value })} />
                      <div className="min-w-0 flex-1">
                        <Label className="text-xs">{current.imageOverlayOpacity}%</Label>
                        <Slider min={0} max={100} step={1} value={[current.imageOverlayOpacity]} onValueChange={([value]) => patch(selected, { imageOverlayOpacity: value ?? 45 })} />
                      </div>
                    </div>
                  </div>
                ) : null}
                {current.imageOverlayMode === "gradient" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Início da sobreposição</Label>
                      <div className="flex items-center gap-3">
                        <Input type="color" className="h-10 w-16 cursor-pointer p-1" value={current.imageOverlayGradientFrom} onChange={(event) => patch(selected, { imageOverlayGradientFrom: event.target.value })} />
                        <div className="min-w-0 flex-1"><Label className="text-xs">{current.imageOverlayGradientFromOpacity}%</Label><Slider min={0} max={100} step={1} value={[current.imageOverlayGradientFromOpacity]} onValueChange={([value]) => patch(selected, { imageOverlayGradientFromOpacity: value ?? 60 })} /></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Fim da sobreposição</Label>
                      <div className="flex items-center gap-3">
                        <Input type="color" className="h-10 w-16 cursor-pointer p-1" value={current.imageOverlayGradientTo} onChange={(event) => patch(selected, { imageOverlayGradientTo: event.target.value })} />
                        <div className="min-w-0 flex-1"><Label className="text-xs">{current.imageOverlayGradientToOpacity}%</Label><Slider min={0} max={100} step={1} value={[current.imageOverlayGradientToOpacity]} onValueChange={([value]) => patch(selected, { imageOverlayGradientToOpacity: value ?? 15 })} /></div>
                      </div>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Ângulo da sobreposição: {current.imageOverlayGradientAngle}°</Label>
                      <Slider min={0} max={360} step={1} value={[current.imageOverlayGradientAngle]} onValueChange={([value]) => patch(selected, { imageOverlayGradientAngle: value ?? 160 })} />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ALIGNMENTS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={current.align === option.id ? "default" : "outline"}
                onClick={() => patch(selected, { align: option.id })}
              >
                {option.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch(selected, { hidden: !current.hidden })}
            >
              {current.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {current.hidden ? "Oculto" : "Visível"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
