import { describe, it, expect, vi } from "vitest";
import { BridgeOptions } from "../../src/bridge/file-bridge.js";

vi.mock("../../src/bridge/file-bridge.js", () => ({
  sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  sendRawCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getTempDir: vi.fn().mockReturnValue("/tmp/test"),
  cleanupTempDir: vi.fn(),
}));

import { sendCommand } from "../../src/bridge/file-bridge.js";
import { getUtilityTools } from "../../src/tools/utility.js";

const mockedSendCommand = vi.mocked(sendCommand);
const bridgeOptions: BridgeOptions = { tempDir: "/tmp/test-bridge", timeoutMs: 5000 };
const { set_sequence_resolution } = getUtilityTools(bridgeOptions);

// 2026-10-02: 14292x9016 was accepted and get_sequence_settings read back 9016, but
// Premiere had clamped the frame to 8192 high, so every normalized position was off.
describe("set_sequence_resolution limits and read-back", () => {
  it("refuses a frame taller than 8192 before touching Premiere", async () => {
    mockedSendCommand.mockClear();
    const result = await set_sequence_resolution.handler({ width: 14292, height: 9016 });
    expect(result).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("8192") }));
    expect(mockedSendCommand).not.toHaveBeenCalled();
  });

  it("refuses a frame wider than 16384 and non-positive or fractional sizes", async () => {
    for (const bad of [{ width: 20000, height: 1080 }, { width: 0, height: 1080 }, { width: 1920.5, height: 1080 }]) {
      mockedSendCommand.mockClear();
      const result = await set_sequence_resolution.handler(bad);
      expect(result).toEqual(expect.objectContaining({ success: false }));
      expect(mockedSendCommand).not.toHaveBeenCalled();
    }
  });

  it("reads the applied size back and fails if Premiere stored something else", async () => {
    mockedSendCommand.mockClear();
    await set_sequence_resolution.handler({ width: 12986, height: 8192 });
    const script = mockedSendCommand.mock.calls[0][0] as string;
    expect(script).toContain("videoFrameHeight");
    expect(script).toContain("did not apply");
  });
});
