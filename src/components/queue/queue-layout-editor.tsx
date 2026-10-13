import { Eye, EyeOff, Move, RotateCcw } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueueButtonContent } from "@/components/queue/queue-button-content";
import { queueButtonStyle } from "@/components/queue/queue-button-style";
import { type QueueLayout, type QueueLayoutBlock } from "@/lib/queue/queue-layout";

export type QueueLayoutEditorItem = {
  id: string;
  label: string;
  sample: string;
  kind?: "image" | "button" | "background";
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function NumberField({
  label,
  value,
  min,
  max,
  integer = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={integer ? "1" : "0.1"}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next))
            onChange(integer ? Math.round(clamp(next, min, max)) : clamp(next, min, max));
        }}
      />
    </div>
  );
}

/** Editor isolado das senhas: o canvas é apenas preview; todo controle fica no painel lateral. */
export function QueueLayoutEditor({
  title,
  description,
  layout,
  defaults,
  items,
  background,
  imageUrls,
  imageControls,
  itemControls,
  backgroundControls,
  onChange,
}: {
  title: string;
  description: string;
  layout: QueueLayout;
  defaults: QueueLayout;
  items: QueueLayoutEditorItem[];
  background: ReactNode;
  imageUrls?: Record<string, string | null | undefined>;
  imageControls?: (item: QueueLayoutEditorItem) => ReactNode;
  itemControls?: (item: QueueLayoutEditorItem) => ReactNode;
  backgroundControls?: ReactNode;
  onChange: (layout: QueueLayout) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const dragRef = useRef<{ x: number; y: number; block: QueueLayoutBlock } | null>(null);
  const block = layout[selected] ?? defaults[selected];
  const selectedItem = items.find((item) => item.id === selected);
  const patch = (next: Partial<QueueLayoutBlock>) =>
    onChange({ ...layout, [selected]: { ...block, ...next } });
  const point = (event: PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? {
          x: ((event.clientX - rect.left) * 100) / rect.width,
          y: ((event.clientY - rect.top) * 100) / rect.height,
        }
      : null;
  };
  const drag = (
    item: QueueLayoutEditorItem,
    entry: QueueLayoutBlock,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const start = dragRef.current;
    const cursor = point(event);
    if (!start || !cursor || selected !== item.id) return;
    const x = Math.round(clamp(start.block.x + cursor.x - start.x, 0, 100 - entry.w));
    const y = Math.round(clamp(start.block.y + cursor.y - start.y, 0, 100 - entry.h));
    onChange({ ...layout, [item.id]: { ...entry, x, y } });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(defaults)}>
          <RotateCcw className="size-4" />
          Padrão
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div
            ref={canvasRef}
            className="relative w-full select-none overflow-hidden rounded-lg border bg-black"
            style={{ aspectRatio: "16 / 9", containerType: "inline-size" }}
          >
            {background}
            {items
              .filter((item) => item.kind !== "background")
              .map((item) => {
                const entry = layout[item.id] ?? defaults[item.id];
                if (!entry) return null;
                const active = selected === item.id;
                const imageUrl = imageUrls?.[item.id];
                const isHistory = item.id === "history";
                const isVerticalHistory = isHistory && entry.historyDirection === "vertical";
                const horizontalAlignment =
                  entry.align === "left"
                    ? "flex-start"
                    : entry.align === "right"
                      ? "flex-end"
                      : "center";
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    onPointerDown={(event) => {
                      const p = point(event);
                      if (!p) return;
                      setSelected(item.id);
                      dragRef.current = { x: p.x, y: p.y, block: entry };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => drag(item, entry, event)}
                    onPointerUp={() => {
                      dragRef.current = null;
                    }}
                    onPointerCancel={() => {
                      dragRef.current = null;
                    }}
                    className={`absolute flex cursor-move items-center overflow-hidden whitespace-nowrap border-2 border-dashed px-1 leading-none ${active ? "border-primary bg-primary/20" : "border-primary/40 bg-black/10"} ${entry.hidden ? "opacity-30" : ""}`}
                    style={{
                      left: `${entry.x}%`,
                      top: `${entry.y}%`,
                      width: `${entry.w}%`,
                      height: `${entry.h}%`,
                      justifyContent: isVerticalHistory ? "center" : horizontalAlignment,
                      alignItems: isVerticalHistory ? horizontalAlignment : undefined,
                      color: entry.color,
                      ...(item.kind === "button" ? queueButtonStyle(entry) : {}),
                      opacity: entry.opacity / 100,
                      fontSize: `${entry.fontSize}cqw`,
                      textAlign: entry.align,
                      touchAction: "none",
                      flexDirection: isVerticalHistory ? "column" : "row",
                      gap: isVerticalHistory ? "0.15em" : undefined,
                      whiteSpace: isVerticalHistory ? "normal" : "nowrap",
                    }}
                  >
                    <span className="absolute -top-4 left-0 whitespace-nowrap text-[9px] text-primary">
                      <Move className="mr-0.5 inline size-3" />
                      {item.label}
                    </span>
                    {item.kind === "image" ? (
                      imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="size-full object-contain"
                          style={{ objectPosition: entry.align }}
                          draggable={false}
                        />
                      ) : (
                        "IMAGEM"
                      )
                    ) : isHistory ? (
                      ["AO11", "AO10", "AO09"].map((value) => <span key={value}>{value}</span>)
                    ) : item.kind === "button" ? (
                      <QueueButtonContent block={entry}>{item.sample}</QueueButtonContent>
                    ) : (
                      <span
                        style={{
                          textTransform: entry.textCase === "uppercase" ? "uppercase" : "none",
                        }}
                      >
                        {item.sample}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={selected === item.id ? "default" : "outline"}
                onClick={() => setSelected(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        {block || selectedItem?.kind === "background" ? (
          <aside className="space-y-4 rounded-lg border bg-background p-4">
            <div>
              <p className="text-xs text-muted-foreground">Item selecionado</p>
              <p className="font-medium">{selectedItem?.label}</p>
            </div>
            {selectedItem?.kind === "background" ? backgroundControls : null}
            {selectedItem ? itemControls?.(selectedItem) : null}
            {block ? (
              <>
                <>{selectedItem?.kind === "image" ? imageControls?.(selectedItem) : null}</>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Esquerda (%)"
                    value={block.x}
                    min={0}
                    max={100 - block.w}
                    onChange={(x) => patch({ x })}
                  />
                  <NumberField
                    label="Topo (%)"
                    value={block.y}
                    min={0}
                    max={100 - block.h}
                    onChange={(y) => patch({ y })}
                  />
                  <NumberField
                    label="Largura (%)"
                    value={block.w}
                    min={2}
                    max={100}
                    onChange={(w) => patch({ w })}
                  />
                  <NumberField
                    label="Altura (%)"
                    value={block.h}
                    min={2}
                    max={100}
                    onChange={(h) => patch({ h })}
                  />
                  <NumberField
                    label="Fonte (vw)"
                    value={block.fontSize}
                    min={0.5}
                    max={25}
                    onChange={(fontSize) => patch({ fontSize })}
                  />
                </div>
                {selectedItem?.id === "history" ? (
                  <>
                    <NumberField
                      label="Quantidade de senhas"
                      value={block.historyLimit ?? 3}
                      min={1}
                      max={8}
                      integer
                      onChange={(historyLimit) => patch({ historyLimit })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          (block.historyDirection ?? "horizontal") === "horizontal"
                            ? "default"
                            : "outline"
                        }
                        onClick={() => patch({ historyDirection: "horizontal" })}
                      >
                        Horizontal
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={block.historyDirection === "vertical" ? "default" : "outline"}
                        onClick={() => patch({ historyDirection: "vertical" })}
                      >
                        Vertical
                      </Button>
                    </div>
                  </>
                ) : null}
                {selectedItem?.kind === "button" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Cor do botão</Label>
                    <Input
                      type="color"
                      value={block.backgroundColor ?? "#000000"}
                      onChange={(event) => patch({ backgroundColor: event.target.value })}
                    />
                  </div>
                ) : null}
                {selectedItem?.kind === "button" ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <Label className="text-xs">Texto</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={block.textCase ?? "normal"}
                      onChange={(event) =>
                        patch({ textCase: event.target.value as "normal" | "uppercase" })
                      }
                    >
                      <option value="normal">Normal</option>
                      <option value="uppercase">CAIXA ALTA</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={block.showIcon ?? true}
                        onChange={(event) => patch({ showIcon: event.target.checked })}
                      />
                      Exibir ícone
                    </label>
                    <div className="space-y-1">
                      <Label className="text-xs">Ícone</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={block.icon ?? "ticket"}
                        onChange={(event) =>
                          patch({ icon: event.target.value as QueueLayoutBlock["icon"] })
                        }
                      >
                        <option value="ticket">Ticket</option>
                        <option value="user">Pessoa</option>
                        <option value="star">Estrela</option>
                        <option value="heart">Coração</option>
                        <option value="none">Nenhum</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={block.buttonGradient ?? false}
                        onChange={(event) => patch({ buttonGradient: event.target.checked })}
                      />
                      Usar gradiente
                    </label>
                    {block.buttonGradient ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Cor inicial</Label>
                          <Input
                            type="color"
                            value={block.gradientStartColor ?? block.backgroundColor ?? "#000000"}
                            onChange={(event) => patch({ gradientStartColor: event.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cor final</Label>
                          <Input
                            type="color"
                            value={block.gradientEndColor ?? block.backgroundColor ?? "#000000"}
                            onChange={(event) => patch({ gradientEndColor: event.target.value })}
                          />
                        </div>
                        <NumberField
                          label="Direção do gradiente (°)"
                          value={block.gradientAngle ?? 135}
                          min={0}
                          max={360}
                          integer
                          onChange={(gradientAngle) => patch({ gradientAngle })}
                        />
                      </>
                    ) : null}
                    <NumberField
                      label="Padding (cqw)"
                      value={block.buttonPadding ?? 0.6}
                      min={0}
                      max={5}
                      onChange={(buttonPadding) => patch({ buttonPadding })}
                    />
                    <NumberField
                      label="Border radius (cqw)"
                      value={block.borderRadius ?? 0.8}
                      min={0}
                      max={5}
                      onChange={(borderRadius) => patch({ borderRadius })}
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Cor {selectedItem?.kind === "button" ? "do texto" : ""}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 w-12 p-1"
                      type="color"
                      value={block.color}
                      onChange={(event) => patch({ color: event.target.value })}
                    />
                    <Input
                      value={block.color}
                      className="font-mono"
                      maxLength={7}
                      onChange={(event) => patch({ color: event.target.value })}
                    />
                  </div>
                </div>
                <NumberField
                  label="Opacidade (%)"
                  value={block.opacity}
                  min={0}
                  max={100}
                  onChange={(opacity) => patch({ opacity })}
                />
                <div className="grid grid-cols-3 gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <Button
                      type="button"
                      size="sm"
                      key={align}
                      variant={block.align === align ? "default" : "outline"}
                      onClick={() => patch({ align })}
                    >
                      {align === "left" ? "Esq." : align === "right" ? "Dir." : "Centro"}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => patch({ hidden: !block.hidden })}
                >
                  {block.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {block.hidden ? "Mostrar item" : "Ocultar item"}
                </Button>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
