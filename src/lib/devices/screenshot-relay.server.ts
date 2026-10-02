import { ScreenshotRelay } from "./screenshot-relay";

// Same single Node worker as the existing device long-poll bus (stack replicas=1).
const shared = globalThis as unknown as { __mdiScreenshots?: ScreenshotRelay };
export const screenshotRelay = shared.__mdiScreenshots ??= new ScreenshotRelay();
