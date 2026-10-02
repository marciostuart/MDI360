import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { requestDeviceScreenshot, consumeDeviceScreenshot, cancelDeviceScreenshot } from "@/lib/devices/screenshot.functions";

export function ScreenshotDialog({ deviceId }: { deviceId: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><Camera className="size-4" />Capturar tela</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? <ScreenshotContent deviceId={deviceId} /> : null}
    </Dialog>
  </>;
}

function ScreenshotContent({ deviceId }: { deviceId: string }) {
  const request = useServerFn(requestDeviceScreenshot);
  const consume = useServerFn(consumeDeviceScreenshot);
  const cancel = useServerFn(cancelDeviceScreenshot);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let requestId: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const discard = () => { if (requestId) void cancel({ data: { deviceId, requestId } }).catch(() => undefined); };
    const load = async () => {
      try {
        const result = await request({ data: { deviceId } });
        requestId = result.requestId;
        if (disposed) { discard(); return; }
        const deadline = Date.now() + 55_000;
        const poll = async () => {
          try {
            const shot = await consume({ data: { deviceId, requestId: result.requestId } });
            if (disposed) return;
            if (shot.status === "ready") { setImage(shot.image); return; }
            if (shot.status === "expired" || Date.now() >= deadline) {
              discard(); setError("O terminal não respondeu à captura. Verifique a conexão e solicite novamente."); return;
            }
            timer = setTimeout(() => void poll(), 1000);
          } catch (failure) {
            if (!disposed) { discard(); setError(failure instanceof Error ? failure.message : "Não foi possível receber a captura."); }
          }
        };
        void poll();
      } catch (failure) { if (!disposed) setError(failure instanceof Error ? failure.message : "Não foi possível solicitar a captura."); }
    };
    void load();
    return () => { disposed = true; clearTimeout(timer); discard(); };
  }, [deviceId, request, consume, cancel]);
  return <DialogContent className="max-w-5xl">
    <DialogHeader><DialogTitle>Captura de tela do terminal</DialogTitle>
      <DialogDescription>Visualização única. Ao fechar, esta imagem será descartada e não ficará salva no servidor.</DialogDescription>
    </DialogHeader>
    {image ? <img src={image} alt="Tela atual do terminal" className="max-h-[75vh] w-full rounded-md bg-black object-contain" />
      : error ? <p role="alert" className="py-12 text-center text-muted-foreground">{error}</p>
        : <div className="grid min-h-64 place-items-center gap-3 py-12"><Loader2 className="size-7 animate-spin" /><p>Solicitando captura ao terminal...</p></div>}
  </DialogContent>;
}
