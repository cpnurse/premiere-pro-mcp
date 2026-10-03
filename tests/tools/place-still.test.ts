import { describe, it, expect, vi } from "vitest";
import { BridgeOptions } from "../../src/bridge/file-bridge.js";

vi.mock("../../src/bridge/file-bridge.js", () => ({
  sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  sendRawCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getTempDir: vi.fn().mockReturnValue("/tmp/test"),
  cleanupTempDir: vi.fn(),
}));

import { sendCommand } from "../../src/bridge/file-bridge.js";
import { getTimelineTools } from "../../src/tools/timeline.js";

const mockedSendCommand = vi.mocked(sendCommand);
const bridgeOptions: BridgeOptions = { tempDir: "/tmp/test-bridge", timeoutMs: 5000 };
const { place_still_at_length } = getTimelineTools(bridgeOptions);

// 2026-10-02: trim_clip can't lengthen a placed still on Premiere 26.5, but a still
// placed while its project item carries a longer in/out arrives at that length.
// This tool does set-in/out -> insert -> restore in one call so the item is never
// left altered (an earlier hand-run of this changed 16 unrelated items).
describe("place_still_at_length", () => {
  it("refuses bad durations, tracks or start times before touching Premiere", async () => {
    for (const bad of [
      { item_id: "a.jpg", duration_seconds: 0 },
      { item_id: "a.jpg", duration_seconds: 2, track_index: -1 },
      { item_id: "a.jpg", duration_seconds: 2, start_seconds: -0.5 },
      { item_id: "a.jpg", duration_seconds: Number.NaN },
    ]) {
      mockedSendCommand.mockClear();
      const result = await place_still_at_length.handler(bad as never);
      expect(result).toEqual(expect.objectContaining({ success: false }));
      expect(mockedSendCommand).not.toHaveBeenCalled();
    }
  });

  it("saves the item's in/out, inserts, and restores the in/out even if insertion throws", async () => {
    mockedSendCommand.mockClear();
    await place_still_at_length.handler({ item_id: "CPN06327.jpg", track_index: 3, start_seconds: 0.5005, duration_seconds: 4.838 });
    expect(mockedSendCommand).toHaveBeenCalledTimes(1);
    const script = mockedSendCommand.mock.calls[0][0] as string;
    expect(script).toContain("var savedIn = item.getInPoint().ticks");
    expect(script).toContain("var savedOut = item.getOutPoint().ticks");
    expect(script).toContain("seq.insertClip(item");
    expect(script).toMatch(/finally\s*\{[\s\S]*item\.setInPoint\(savedIn, 4\)[\s\S]*item\.setOutPoint\(savedOut, 4\)/);
  });

  it("reports the new clip's node ID and its measured length", async () => {
    mockedSendCommand.mockClear();
    await place_still_at_length.handler({ item_id: "x", duration_seconds: 2 });
    const script = mockedSendCommand.mock.calls[0][0] as string;
    expect(script).toContain("nodeId: placed.nodeId");
    expect(script).toContain("durationSeconds:");
    expect(script).toContain("restored: true");
  });
});
