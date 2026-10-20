import { describe, expect, it } from "vitest";
import { centeredPopupBounds } from "../src/popup-layout";

describe("approval popup positioning", () => {
  it("centers in the browser window rather than the primary screen", () => {
    expect(centeredPopupBounds({ left: 200, top: 100, width: 1200, height: 900 }))
      .toEqual({ left: 560, top: 290, width: 480, height: 520 });
  });
  it("preserves negative coordinates on a second monitor", () => {
    expect(centeredPopupBounds({ left: -1600, top: -900, width: 1600, height: 900 }))
      .toEqual({ left: -1040, top: -710, width: 480, height: 520 });
  });
  it("fits small windows and handles unavailable dimensions", () => {
    expect(centeredPopupBounds({ left: 50, top: 40, width: 400, height: 350 }))
      .toEqual({ left: 50, top: 40, width: 400, height: 350 });
    expect(centeredPopupBounds({})).toEqual({ left: 0, top: 0, width: 480, height: 520 });
  });
});
