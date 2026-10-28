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
    const legacyAdults = {
      ...original,
      id: "legacy-adults",
      company: "adults",
    };
    db.put("plans", legacyAdults);
    const legacyAnyone = {
      ...original,
      id: "legacy-anyone",
      company: "anyone",
    };
    db.put("plans", legacyAnyone);
    db.db
      .prepare("INSERT INTO drafts (person_id,payload) VALUES (?,?)")
      .run("jon", JSON.stringify({ place: "River", company: "anyone" }));
    const before = db.rows<Plan>("plans").length;
    db.db.close();
    db = new Store(path);
    expect(db.plan("legacy-adults")).toEqual({
      ...original,
      id: "legacy-adults",
      company: "no_kids",
    });
    expect(db.plan("legacy-anyone")).toEqual({
      ...original,
      id: "legacy-anyone",
      company: "no_kids",
    });
    expect(db.getDraft("jon")).toEqual({ place: "River", company: "no_kids" });
    expect(db.rows("plans")).toHaveLength(before);
    db.db.close();
    db = new Store(path);
    expect(db.plan("legacy-anyone").company).toBe("no_kids");
  } finally {
    db?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
