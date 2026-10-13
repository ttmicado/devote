import type { NormalizedListing } from "@devote/core";
import { describe, expect, it } from "vitest";
import { sameBuilding } from "./similar";

const l = (title: string, town = "赤坂") =>
  ({
    title,
    address: { prefecture: "東京都", city: "港区", town, raw: "" },
  }) as unknown as NormalizedListing;

describe("sameBuilding", () => {
  it("建物名の表記揺れ（空白・全角・部屋番号）を吸収し、所在地も見る", () => {
    expect(sameBuilding(l("パークコート赤坂 1204号室"), l("パークコート赤坂　805"))).toBe(true);
    expect(sameBuilding(l("パークコート赤坂"), l("パークコート赤坂", "六本木"))).toBe(false);
    expect(sameBuilding(l("パークコート赤坂"), l("パークタワー赤坂"))).toBe(false);
  });
});
