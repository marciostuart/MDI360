import { Eye, EyeOff, Move, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
        className="relative aspect-video w-full select-none overflow-hidden rounded-xl border border-border"
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
