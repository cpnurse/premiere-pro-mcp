import { describe, it, expect, vi } from "vitest";
import { BridgeOptions } from "../../src/bridge/file-bridge.js";

vi.mock("../../src/bridge/file-bridge.js", () => ({
  sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  sendRawCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getTempDir: vi.fn().mockReturnValue("/tmp/test"),
  cleanupTempDir: vi.fn(),
}));

import { sendCommand } from "../../src/bridge/file-bridge.js";
import { getKeyframeTools } from "../../src/tools/keyframes.js";

const mockedSendCommand = vi.mocked(sendCommand);
const bridgeOptions: BridgeOptions = { tempDir: "/tmp/test-bridge", timeoutMs: 5000 };
const { add_keyframe } = getKeyframeTools(bridgeOptions);

async function scriptFor(args: unknown) {
  mockedSendCommand.mockClear();
  const result = await add_keyframe.handler(args as never);
  return { result, script: mockedSendCommand.mock.calls[0]?.[0] as string | undefined };
}

// Position / Anchor Point are two-value properties; a plain number garbles them.
describe("add_keyframe with a two-value point", () => {
  it("advertises an optional point array and no longer requires value", () => {
    const props = add_keyframe.parameters.properties as Record<string, { type?: string }>;
    expect(props.point.type).toBe("array");
    expect(add_keyframe.parameters.required).not.toContain("value");
  });

  it("writes the point as an ExtendScript array and compares both components on read-back", async () => {
    const { script } = await scriptFor({
      node_id: "clip-1", effect_name: "Motion", property_name: "Position", time_seconds: 1.5, point: [0.25, 0.75],
    });
    expect(script).toContain("prop.setValueAtKey(time, [0.25, 0.75], true)");
    expect(script).toContain("readBack[1]");
  });

  it("still writes scalar values unchanged", async () => {
    const { script } = await scriptFor({
      node_id: "clip-1", effect_name: "Motion", property_name: "Scale", time_seconds: 0, value: 120,
    });
    expect(script).toContain("prop.setValueAtKey(time, 120, true)");
  });

  it("rejects a call with neither value nor point, or a malformed point, before touching Premiere", async () => {
    for (const bad of [
      { node_id: "c", effect_name: "Motion", property_name: "Position", time_seconds: 0 },
      { node_id: "c", effect_name: "Motion", property_name: "Position", time_seconds: 0, point: [0.5] },
      { node_id: "c", effect_name: "Motion", property_name: "Position", time_seconds: 0, point: [0.5, "x"] },
      { node_id: "c", effect_name: "Motion", property_name: "Position", time_seconds: 0, value: 1, point: [0.5, 0.5] },
    ]) {
      const { result, script } = await scriptFor(bad);
      expect(result).toEqual(expect.objectContaining({ success: false }));
      expect(script).toBeUndefined();
    }
  });
});
