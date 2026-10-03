import { describe, it, expect, vi } from "vitest";
import { BridgeOptions } from "../../src/bridge/file-bridge.js";

vi.mock("../../src/bridge/file-bridge.js", () => ({
  sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  sendRawCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getTempDir: vi.fn().mockReturnValue("/tmp/test"),
  cleanupTempDir: vi.fn(),
}));

import { sendCommand } from "../../src/bridge/file-bridge.js";
import { getKeyframeTools, easedKeyframes } from "../../src/tools/keyframes.js";

const mockedSendCommand = vi.mocked(sendCommand);
const bridgeOptions: BridgeOptions = { tempDir: "/tmp/test-bridge", timeoutMs: 5000 };
const { add_eased_move } = getKeyframeTools(bridgeOptions);

// Premiere's scripting API can't set Ease In/Out handles, so an eased move is built
// from closely spaced keyframes that follow the ease curve.
describe("easedKeyframes", () => {
  it("starts and ends exactly on the requested values and times", () => {
    const keys = easedKeyframes({ start: 1, end: 3, from: 100, to: 40, ease: "in_out", strength: 2, steps: 8 });
    expect(keys[0]).toEqual({ t: 1, v: 100 });
    expect(keys.at(-1)).toEqual({ t: 3, v: 40 });
    expect(keys).toHaveLength(9);
  });

  it("in_out moves slowly at both ends and fastest in the middle", () => {
    const keys = easedKeyframes({ start: 0, end: 1, from: 0, to: 1, ease: "in_out", strength: 2, steps: 10 });
    const deltas = keys.slice(1).map((k, i) => (k.v as number) - (keys[i].v as number));
    expect(deltas[0]).toBeLessThan(deltas[4]);
    expect(deltas.at(-1)!).toBeLessThan(deltas[5]);
    expect((keys[5].v as number)).toBeCloseTo(0.5, 6);
  });

  it("eases each component of a point independently", () => {
    const keys = easedKeyframes({ start: 0, end: 2, from: [0.1, 1.0], to: [0.5, 0.5], ease: "out", strength: 2, steps: 4 });
    expect(keys[0].v).toEqual([0.1, 1.0]);
    expect(keys.at(-1)!.v).toEqual([0.5, 0.5]);
    // ease-out: the first step covers more than a linear quarter
    expect((keys[1].v as number[])[0] - 0.1).toBeGreaterThan(0.1);
  });

  it("strength 1 is linear", () => {
    const keys = easedKeyframes({ start: 0, end: 1, from: 0, to: 4, ease: "in_out", strength: 1, steps: 4 });
    expect(keys.map((k) => k.v)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("add_eased_move", () => {
  it("writes every keyframe in one Premiere call", async () => {
    mockedSendCommand.mockClear();
    await add_eased_move.handler({
      node_id: "clip-1", effect_name: "Motion", property_name: "Position",
      start_seconds: 0, end_seconds: 3.67, from_point: [0.107, 1.025], to_point: [0.5, 0.5], ease: "in_out", steps: 6,
    });
    expect(mockedSendCommand).toHaveBeenCalledTimes(1);
    const script = mockedSendCommand.mock.calls[0][0] as string;
    expect(script).toContain("[0.107, 1.025]");
    expect(script).toContain("[0.5, 0.5]");
    expect(script).toContain("setValueAtKey");
  });

  it("rejects mismatched from/to shapes and bad times before touching Premiere", async () => {
    for (const bad of [
      { from: 1, to_point: [0.5, 0.5], start_seconds: 0, end_seconds: 1 },
      { from: 1, to: 2, start_seconds: 2, end_seconds: 1 },
      { from_point: [1], to_point: [2], start_seconds: 0, end_seconds: 1 },
      { from: 1, start_seconds: 0, end_seconds: 1 },
    ]) {
      mockedSendCommand.mockClear();
      const result = await add_eased_move.handler({ node_id: "c", effect_name: "Motion", property_name: "Scale", ...bad } as never);
      expect(result).toEqual(expect.objectContaining({ success: false }));
      expect(mockedSendCommand).not.toHaveBeenCalled();
    }
  });
});
