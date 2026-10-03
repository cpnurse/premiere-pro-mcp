import { describe, it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { getHelpersSource } from "../../src/bridge/script-builder.js";

/**
 * Minimal ExtendScript Folder stand-in over a fake directory listing. Enough for the
 * path helpers: fsName, displayName, exists, getFiles.
 */
function sandboxWith(dirs: string[], os = "Macintosh OS 15.2.0") {
  const set = new Set(dirs);
  class Folder {
    fsName: string;
    constructor(p: string) { this.fsName = p.replace(/\/+$/, ""); }
    get exists() { return set.has(this.fsName); }
    get displayName() { return this.fsName.split("/").pop() ?? ""; }
    getFiles(filter?: (f: Folder) => boolean) {
      const kids = [...set]
        .filter((d) => d.startsWith(this.fsName + "/") && !d.slice(this.fsName.length + 1).includes("/"))
        .map((d) => new Folder(d));
      return filter ? kids.filter(filter) : kids;
    }
  }
  const sandbox: Record<string, unknown> = { Folder, File: Folder, $: { os } };
  runInNewContext(getHelpersSource(), sandbox);
  return sandbox as Record<string, (...a: unknown[]) => { fsName: string }>;
}

// 2026-10-02: on macOS the install folder *contains* the .app bundle, so appending
// /Contents/ to the install folder pointed at a path that doesn't exist and the
// still-frame preset search (and so export_frame's AME fallback) found nothing.
describe("__adobeApplicationResourceFolder on macOS", () => {
  const ame = "/Applications/Adobe Media Encoder 2026";
  const bundle = `${ame}/Adobe Media Encoder 2026.app`;

  it("descends into the .app bundle inside an install folder", () => {
    const s = sandboxWith(["/Applications", ame, bundle]);
    const folder = s.__adobeApplicationResourceFolder(new (s.Folder as never as new (p: string) => object)(ame), "MediaIO/systempresets");
    expect(folder.fsName).toBe(`${bundle}/Contents/MediaIO/systempresets`);
  });

  it("uses a folder that is already the bundle as-is", () => {
    const s = sandboxWith(["/Applications", bundle]);
    const folder = s.__adobeApplicationResourceFolder(new (s.Folder as never as new (p: string) => object)(bundle), "MediaIO/systempresets");
    expect(folder.fsName).toBe(`${bundle}/Contents/MediaIO/systempresets`);
  });

  it("leaves Windows install folders alone", () => {
    const win = "C:/Program Files/Adobe/Adobe Media Encoder 2026";
    const s = sandboxWith([win], "Windows/10");
    const folder = s.__adobeApplicationResourceFolder(new (s.Folder as never as new (p: string) => object)(win), "MediaIO/systempresets");
    expect(folder.fsName).toBe(`${win}/MediaIO/systempresets`);
  });
});
