import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Person, Plan, PlanDraft, Message, Notice } from "../types";
import { normalizePlan, planDescription } from "../plans";

export const CIRCLE_ID = "weekend-friends";
export const TIMEZONE = "America/Los_Angeles";
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Row = { payload: string };
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (person_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
    // Preserve existing plans and drafts when replacing the former company labels.
    // Repeating this migration is safe across route workers and server restarts.
    this.transaction(() => {
      this.db.exec(`
        UPDATE plans SET payload = json_set(payload, '$.company', 'no_kids')
          WHERE json_extract(payload, '$.company') IN ('adults', 'anyone');
        UPDATE drafts SET payload = json_set(payload, '$.company', 'no_kids')
          WHERE json_extract(payload, '$.company') IN ('adults', 'anyone');
      `);
    });
  }
  rows<T>(table: "people" | "plans" | "messages" | "notices"): T[] {
    return (
      this.db
        .prepare(`SELECT payload FROM ${table} ORDER BY rowid`)
        .all() as unknown as Row[]
    ).map((r) => JSON.parse(r.payload));
  }
  put(
    table: "people" | "plans" | "messages" | "notices",
    item: { id: string },
  ) {
    this.db
      .prepare(
        `INSERT INTO ${table} (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(item.id, JSON.stringify(item));
  }
  person(id: string): Person {
    const p = this.rows<Person>("people").find((p) => p.id === id);
    if (!p) throw new ServiceError("You are not in this circle.", 403);
    return p;
  }
  plan(id: string): Plan {
    const p = this.rows<Plan>("plans").find((p) => p.id === id);
    if (!p) throw new ServiceError("That plan was not found.", 404);
    return p;
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = work();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  message(
    personId: string,
    direction: Message["direction"],
    body: string,
    planId: string | null = null,
  ) {
    const msg: Message = {
      id: randomUUID(),
      personId,
      direction,
      body,
      createdAt: new Date().toISOString(),
      planId,
    };
    this.put("messages", msg);
    return msg;
  }
  notify(
    plan: Plan,
    recipientIds: string[],
    kind: Notice["kind"],
    prefix = "",
  ) {
    for (const recipientId of [...new Set(recipientIds)]) {
      const notice: Notice = {
        id: randomUUID(),
        recipientId,
        kind,
        planId: plan.id,
        createdAt: new Date().toISOString(),
        body: `${prefix}${planDescription(plan)} ${plan.participants
          .map((id) => this.person(id).name)
          .sort()
          .join(", ")} going. /plans/${plan.id}`,
        status: "preview",
      };
      this.put("notices", notice);
    }
  }
  create(
    personId: string,
    input: unknown,
    now: DateTime = DateTime.now(),
  ): Plan {
    this.person(personId);
    const normalized = normalizePlan(input);
    if (DateTime.fromISO(normalized.startsAt) < now.minus({ minutes: 5 }))
      throw new ServiceError("Choose a start time that hasn't passed.");
    return this.transaction(() => {
      const plan: Plan = {
        ...normalized,
        id: randomUUID(),
        version: 1,
        participants: [personId],
        status: "shared",
      };
      this.put("plans", plan);
      this.notify(
        plan,
        this.rows<Person>("people")
          .filter((p) => p.id !== personId)
          .map((p) => p.id),
        "new",
      );
      return plan;
    });
  }
  participate(personId: string, planId: string, joining: boolean): Plan {
    this.person(personId);
    return this.transaction(() => {
      const plan = this.plan(planId);
      if (
        DateTime.fromISO(plan.endsAt) <= DateTime.now() ||
        plan.status !== "shared"
      )
        throw new ServiceError("This plan has ended.");
      const already = plan.participants.includes(personId);
      if (already === joining) return plan;
      const previous = [...plan.participants];
      plan.participants = joining
        ? [...plan.participants, personId]
        : plan.participants.filter((id) => id !== personId);
      plan.version++;
      if (!plan.participants.length) plan.status = "withdrawn";
      this.put("plans", plan);
      this.notify(
        plan,
        previous.filter((id) => id !== personId),
        joining ? "joined" : "left",
        `${this.person(personId).name} ${joining ? "is coming" : "can't make it"}. `,
      );
      return plan;
    });
  }
  edit(
    personId: string,
    planId: string,
    version: number,
    input: unknown,
  ): Plan {
    this.person(personId);
    const normalized = normalizePlan(input);
    return this.transaction(() => {
      const plan = this.plan(planId);
      if (!plan.participants.includes(personId))
        throw new ServiceError("Join this plan before editing it.", 403);
      if (
        plan.status !== "shared" ||
        DateTime.fromISO(plan.endsAt) <= DateTime.now()
      )
        throw new ServiceError("This plan has ended.");
      if (plan.version !== version)
        throw new ServiceError(
          "Someone changed this plan. Close it and reopen the latest version.",
          409,
        );
      const updated = { ...plan, ...normalized, version: plan.version + 1 };
      this.put("plans", updated);
      const changed = [
        "activity",
        "company",
        "companyDetail",
        "place",
        "startsAt",
        "endsAt",
        "note",
      ] as const;
      if (changed.some((key) => plan[key] !== updated[key]))
        this.notify(
          updated,
          updated.participants.filter((id) => id !== personId),
          "change",
          "Plan updated. ",
        );
      return updated;
    });
  }
  getDraft(personId: string): PlanDraft {
    const row = this.db
      .prepare("SELECT payload FROM drafts WHERE person_id=?")
      .get(personId) as Row | undefined;
    return row ? JSON.parse(row.payload) : {};
  }
  saveDraft(personId: string, draft: PlanDraft) {
    this.db
      .prepare(
        "INSERT INTO drafts(person_id,payload) VALUES (?,?) ON CONFLICT(person_id) DO UPDATE SET payload=excluded.payload",
      )
      .run(personId, JSON.stringify(draft));
  }
  clearDraft(personId: string) {
    this.db.prepare("DELETE FROM drafts WHERE person_id=?").run(personId);
  }
  receipt(id: string): { reply: string; planId: string | null } | null {
    const row = this.db
      .prepare("SELECT payload FROM receipts WHERE id=?")
      .get(id) as Row | undefined;
    return row ? JSON.parse(row.payload) : null;
  }
  saveReceipt(id: string, result: { reply: string; planId: string | null }) {
    this.db
      .prepare("INSERT INTO receipts(id,payload) VALUES (?,?)")
      .run(id, JSON.stringify(result));
  }
  seed(now: DateTime = DateTime.now().setZone(TIMEZONE)) {
    if (this.rows("people").length) return;
    const people: Person[] = [
      {
        id: "jon",
        name: "Jon",
        initials: "JR",
        color: "sage",
        phone: "+12025550101",
        timezone: TIMEZONE,
      },
      {
        id: "eric",
        name: "Eric",
        initials: "EL",
        color: "clay",
        phone: "+12025550102",
        timezone: TIMEZONE,
      },
      {
        id: "tim",
        name: "Tim",
        initials: "TM",
        color: "blue",
        phone: "+12025550103",
        timezone: TIMEZONE,
      },
      {
        id: "sarah",
        name: "Sarah",
        initials: "SK",
        color: "rose",
        phone: "+12025550104",
        timezone: TIMEZONE,
      },
      {
        id: "alex",
        name: "Alex",
        initials: "AW",
        color: "ochre",
        phone: "+12025550105",
        timezone: TIMEZONE,
      },
      {
        id: "emma",
        name: "Emma",
        initials: "EC",
        color: "lilac",
        phone: "+12025550106",
        timezone: TIMEZONE,
      },
    ];
    people.forEach((p) => this.put("people", p));
    const tomorrow = now.plus({ days: 1 }).startOf("day");
    const saturday = now
      .plus({ days: (6 - now.weekday + 7) % 7 || 7 })
      .startOf("day");
    const samples = [
      {
        id: "chickity-ride",
        activity: "A ride at Chickity",
        category: "bike",
        company: "no_kids",
        companyDetail: "",
        place: "Chickity trailhead",
        start: tomorrow.set({ hour: 12 }),
        duration: 120,
        participants: ["eric", "tim"],
        note: "A couple of laps, nothing too ambitious. Meet by the trail map.",
      },
      {
        id: "library-morning",
        activity: "A morning at the library",
        category: "library",
        company: "with_kids",
        companyDetail: "Ages 3 and 5",
        place: "Downtown library",
        start: saturday.set({ hour: 10 }),
        duration: 90,
        participants: ["sarah", "emma"],
        note: "Books, a little exploring, and probably a snack afterwards.",
      },
      {
        id: "coffee-walk",
        activity: "Coffee and a wander",
        category: "coffee",
        company: "no_kids",
        companyDetail: "",
        place: "Little Oak Coffee",
        start: tomorrow.set({ hour: 16 }),
        duration: null,
        participants: ["alex"],
        note: "Grabbing a coffee, then a walk along the river. Bring whoever's around.",
      },
      {
        id: "park-afternoon",
        activity: "An afternoon at the park",
        category: "park",
        company: "with_kids",
        companyDetail: "Ages 4 to 7",
        place: "Riverside playground",
        start: saturday.set({ hour: 14 }),
        duration: 120,
        participants: ["jon", "eric", "sarah"],
        note: "Taking the kids out to burn off some energy. We'll bring a ball.",
      },
      {
        id: "sunday-walk",
        activity: "The long way home",
        category: "walk",
        company: "no_kids",
        companyDetail: "",
        place: "Cedar loop",
        start: saturday.plus({ days: 1 }).set({ hour: 9, minute: 30 }),
        duration: 90,
        participants: ["emma", "tim"],
        note: "An easy Sunday walk. Dogs welcome too.",
      },
    ] as const;
    for (const s of samples) {
      const base = normalizePlan({
        activity: s.activity,
        category: s.category,
        company: s.company,
        companyDetail: s.companyDetail,
        place: s.place,
        startsAt: s.start.toISO(),
        endsAt: s.duration
          ? s.start.plus({ minutes: s.duration }).toISO()
          : null,
        timezone: TIMEZONE,
        note: s.note,
      });
      this.put("plans", {
        ...base,
        id: s.id,
        version: 1,
        participants: [...s.participants],
        status: "shared",
      } as Plan);
    }
  }
  reset() {
    this.transaction(() => {
      for (const table of [
        "people",
        "plans",
        "messages",
        "notices",
        "drafts",
        "receipts",
      ])
        this.db.exec(`DELETE FROM ${table}`);
      this.seed();
    });
  }
}
let singleton: Store | undefined;
export function getStore(): Store {
  if (!singleton) {
    const dir =
      process.env.OPEN_INVITE_DATA_DIR || join(process.cwd(), ".data");
    mkdirSync(dir, { recursive: true });
    singleton = new Store(join(dir, "open-invite.sqlite"));
    singleton.seed();
  }
  return singleton;
}
