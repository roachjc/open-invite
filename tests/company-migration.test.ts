import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Store } from "@/lib/server/database";
import type { Plan } from "@/lib/types";

it("migrates legacy plans and drafts without changing participation or resetting the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "open-invite-migration-"));
  const path = join(dir, "test.sqlite");
  let db: Store | undefined;
  try {
    db = new Store(path);
    db.seed();
    const original = db.rows<Plan>("plans")[0];
    const {
      ageGroups: _ageGroups,
      attendeeDetail: _detail,
      ...legacy
    } = original;
    void _ageGroups;
    void _detail;
    const legacyAdults = {
      ...legacy,
      id: "legacy-adults",
      company: "adults",
      companyDetail: "",
    };
    db.put("plans", legacyAdults);
    const legacyAnyone = {
      ...legacy,
      id: "legacy-anyone",
      company: "anyone",
      companyDetail: "",
    };
    db.put("plans", legacyAnyone);
    db.db
      .prepare("INSERT INTO drafts (person_id,payload) VALUES (?,?)")
      .run("jon", JSON.stringify({ place: "River", company: "anyone" }));
    const legacyKids = {
      ...legacy,
      id: "legacy-kids",
      company: "with_kids",
      companyDetail: "Ages 3 and 5",
    };
    db.put("plans", legacyKids);
    const before = db.rows<Plan>("plans").length;
    db.db.close();
    db = new Store(path);
    expect(db.plan("legacy-adults")).toEqual({
      ...original,
      id: "legacy-adults",
      ageGroups: ["adults"],
      attendeeDetail: "",
    });
    expect(db.plan("legacy-anyone")).toEqual({
      ...original,
      id: "legacy-anyone",
      ageGroups: ["adults"],
      attendeeDetail: "",
    });
    expect(db.getDraft("jon")).toEqual({
      place: "River",
      ageGroups: ["adults"],
    });
    expect(db.plan("legacy-kids")).toEqual({
      ...original,
      id: "legacy-kids",
      ageGroups: ["kids", "adults"],
      attendeeDetail: "Ages 3 and 5",
    });
    expect(db.rows("plans")).toHaveLength(before);
    db.db.close();
    db = new Store(path);
    expect(db.plan("legacy-anyone").ageGroups).toEqual(["adults"]);
  } finally {
    db?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
