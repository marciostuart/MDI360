/** Transport only: no files, database images, signed URLs or screenshot history. */
export const SCREENSHOT_TTL_MS = 60_000;
export const MAX_SCREENSHOT_CHARS = 6 * 1024 * 1024;
type Owner = { userId: string; organizationId: string; deviceId: string };
type Job = Owner & { expiresAt: number; image?: string; timer: ReturnType<typeof setTimeout> };
export type ScreenshotResult = { status: "pending" | "expired" } | { status: "ready"; image: string };

export class ScreenshotRelay {
  private jobs = new Map<string, Job>();
  private now: () => number;
  constructor(now = () => Date.now()) { this.now = now; }
  private sweep() {
    for (const [id, job] of this.jobs) if (job.expiresAt <= this.now()) this.remove(id);
  }
  private remove(id: string) { const job = this.jobs.get(id); if (job) clearTimeout(job.timer); this.jobs.delete(id); }
  begin(id: string, owner: Owner) {
    this.sweep();
    if (this.jobs.size >= 32) throw new Error("Aguarde um instante antes de solicitar outra captura.");
    if ([...this.jobs.values()].some((job) => job.deviceId === owner.deviceId)) {
      throw new Error("Este terminal já tem uma captura em andamento. Aguarde ou feche a solicitação anterior.");
    }
    const timer = setTimeout(() => this.remove(id), SCREENSHOT_TTL_MS);
    timer.unref?.();
    this.jobs.set(id, { ...owner, expiresAt: this.now() + SCREENSHOT_TTL_MS, timer });
  }
  publish(deviceId: string, organizationId: string, requestId: string | undefined, image: string): boolean {
    this.sweep();
    const id = requestId ?? [...this.jobs].find(([, job]) => job.deviceId === deviceId && job.organizationId === organizationId)?.[0];
    const job = id ? this.jobs.get(id) : undefined;
    if (!job || job.deviceId !== deviceId || job.organizationId !== organizationId || job.image) return false;
    if (image.length > MAX_SCREENSHOT_CHARS + 32) return false;
    const used = [...this.jobs.values()].reduce((sum, entry) => sum + (entry.image?.length ?? 0), 0);
    if (used + image.length > 16 * 1024 * 1024) return false;
    job.image = image;
    return true;
  }
  take(id: string, owner: Owner): ScreenshotResult {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job || job.userId !== owner.userId || job.organizationId !== owner.organizationId || job.deviceId !== owner.deviceId) return { status: "expired" };
    if (!job.image) return { status: "pending" };
    const image = job.image;
    this.remove(id); // The image can be read once, then only the open modal owns it.
    return { status: "ready", image };
  }
  cancel(id: string, owner: Owner) {
    const job = this.jobs.get(id);
    if (job && job.userId === owner.userId && job.organizationId === owner.organizationId && job.deviceId === owner.deviceId) this.remove(id);
  }
}

/** Accept only actual JPEG/PNG, never executable SVG/HTML from a device. */
export function screenshotDataUrl(image: string, contentType: string): string | null {
  const match = image.match(/^data:(image\/(?:jpeg|png));base64,(.*)$/s);
  if (match) { contentType = match[1]!; image = match[2]!; }
  if (!image || image.length > MAX_SCREENSHOT_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length % 4 !== 0) return null;
  try {
    const bytes = atob(image);
    const jpg = bytes.startsWith("\xff\xd8\xff");
    const png = bytes.startsWith("\x89PNG\r\n\x1a\n");
    if (!((contentType === "image/jpeg" && jpg) || (contentType === "image/png" && png))) return null;
    return `data:${contentType};base64,${image}`;
  } catch { return null; }
}
