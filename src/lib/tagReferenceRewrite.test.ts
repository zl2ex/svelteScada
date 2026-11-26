import { describe, expect, it } from "vitest";
import { diffTagPathMappings, rewriteQuotedTagPaths } from "./tagReferenceRewrite";

const mappings = [{ oldPath: "/Plant/Motor", newPath: "/Plant/Pump" }];

describe("rewriteQuotedTagPaths", () => {
  it("rewrites quoted paths anywhere in the expression", () => {
    expect(rewriteQuotedTagPaths('tagValue("/Plant/Motor")', mappings)).toBe(
      'tagValue("/Plant/Pump")',
    );
    expect(rewriteQuotedTagPaths('toast("Writing /Plant/Motor")', mappings)).toBe(
      'toast("Writing /Plant/Pump")',
    );
  });

  it("supports different quote styles", () => {
    expect(rewriteQuotedTagPaths("tag('/Plant/Motor')", mappings)).toBe("tag('/Plant/Pump')");
    expect(rewriteQuotedTagPaths("tag(`/Plant/Motor`)", mappings)).toBe("tag(`/Plant/Pump`)");
  });

  it("rewrites descendant paths with boundaries", () => {
    expect(rewriteQuotedTagPaths('tag("/Plant/Motor.Child")', mappings)).toBe(
      'tag("/Plant/Pump.Child")',
    );
    expect(rewriteQuotedTagPaths('tag("/Plant/Motor2")', mappings)).toBe('tag("/Plant/Motor2")');
  });

  it("does not rewrite dynamic template strings", () => {
    expect(rewriteQuotedTagPaths("tag(`/Plant/${name}`)", mappings)).toBe("tag(`/Plant/${name}`)");
  });

  it("does not rewrite comments", () => {
    expect(rewriteQuotedTagPaths('// "/Plant/Motor"\ntag("x")', mappings)).toBe(
      '// "/Plant/Motor"\ntag("x")',
    );
  });

  it("uses the longest mapping first", () => {
    const nested = [
      { oldPath: "/Plant", newPath: "/Site" },
      { oldPath: "/Plant/Motor", newPath: "/Plant/Pump" },
    ];
    expect(rewriteQuotedTagPaths('tag("/Plant/Motor.Child")', nested)).toBe(
      'tag("/Plant/Pump.Child")',
    );
  });
});

describe("diffTagPathMappings", () => {
  it("returns changed paths only", () => {
    expect(
      diffTagPathMappings(
        new Map([
          ["a", "/A"],
          ["b", "/B"],
        ]),
        new Map([
          ["a", "/A2"],
          ["b", "/B"],
        ]),
      ),
    ).toEqual([{ oldPath: "/A", newPath: "/A2" }]);
  });
});
