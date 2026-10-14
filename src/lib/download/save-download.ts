import { offlineDownloadsAvailable, saveInBrowser } from "@/lib/browser-download";
import { enqueueDownload } from "@/lib/download/downloads-store";
import { buildDefaultFilename } from "@/lib/download/filename";

type SaveArgs = Parameters<typeof enqueueDownload>[0];

/**
 * Queues a download in the Offline Room, or, in the web app (which has no Offline Room files),
 * has the browser save the file: Safari on iPad and iPhone puts it in Files → Downloads.
 */
export async function saveDownload(args: SaveArgs): Promise<void> {
  if (typeof window === "undefined" || offlineDownloadsAvailable()) {
    await enqueueDownload(args);
    return;
  }
  if (!/^https:\/\//i.test(args.url)) {
    throw new Error("This source can only be saved in the desktop app.");
  }
  saveInBrowser(
    args.url,
    buildDefaultFilename(args.meta, args.episode, args.url, args.streamLabel),
  );
}
