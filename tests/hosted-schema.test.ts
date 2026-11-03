import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

let db: PGlite;
const jon = "00000000-0000-0000-0000-000000000001";
const eric = "00000000-0000-0000-0000-000000000002";
const stranger = "00000000-0000-0000-0000-000000000003";
const circle = "10000000-0000-0000-0000-000000000001";
const details = {
  activity: "Mountain biking",
  category: "bike",
  age_groups: ["adults"],
  place: "Chickity",
  starts_at: "2030-11-03T00:15:00-07:00",
  ends_at: null,
  timezone: "America/Los_Angeles",
};
async function as(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec("set local role authenticated");
}
async function share() {
  return (
    await db.query<{ id: string; version: number; ends_at: Date }>(
      "select * from public.share_plan($1,$2::jsonb)",
      [circle, JSON.stringify(details)],
    )
  ).rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026000000_initial_circle.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261027000000_kids_context.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261030000001_age_groups.sql", "utf8"),
  );
  await db.exec(`insert into auth.users values ('${jon}'),('${eric}'),('${stranger}');
    insert into public.people(id,name,phone) values ('${jon}','Jon','+12025550101'),('${eric}','Eric','+12025550102'),('${stranger}','Stranger','+12025550103');
    insert into public.circles(id,name) values ('${circle}','Friends');
    insert into public.circle_memberships values ('${circle}','${jon}'),('${circle}','${eric}');`);
}, 20000);
beforeEach(async () => {
  await db.exec("begin");
  await as(jon);
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db?.close();
});

describe("hosted database permissions and transactions", () => {
  it("creates one plan and participation, with local-midnight expiry and a notification", async () => {
    // Call the function once in FROM. Expanding a volatile composite in SELECT can call it once per column.
    const row = (
      await db.query<{ id: string; ends_at: Date }>(
        "select * from public.share_plan($1,$2::jsonb)",
        [circle, JSON.stringify(details)],
      )
    ).rows[0];
    expect(new Date(row.ends_at).toISOString()).toBe(
      "2030-11-04T08:00:00.000Z",
    );
    expect((await db.query("select * from public.plans")).rows).toHaveLength(1);
    expect(
      (await db.query("select * from public.participations")).rows,
    ).toHaveLength(1);
    await as(eric);
    expect(
      (await db.query("select * from public.notification_deliveries")).rows,
    ).toHaveLength(1);
  });
  it("does not expose circle contacts or plans to an outsider", async () => {
    await share();
    await as(stranger);
    expect((await db.query("select * from public.plans")).rows).toHaveLength(0);
    expect((await db.query("select * from public.people")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query("select * from public.share_plan($1,$2::jsonb)", [
        circle,
        JSON.stringify(details),
      ]),
    ).rejects.toThrow("Not a member");
  });
  it("lets another participant edit after the first participant leaves", async () => {
    const plan = await share();
    await as(eric);
    await db.query("select * from public.set_participation($1,true)", [
      plan.id,
    ]);
    await as(jon);
    await db.query("select * from public.set_participation($1,false)", [
      plan.id,
    ]);
    await as(eric);
    const latest = (
      await db.query<{ version: number }>(
        "select version from public.plans where id=$1",
        [plan.id],
      )
    ).rows[0];
    const edited = (
      await db.query<{ place: string; status: string }>(
        "select * from public.edit_plan($1,$2,$3::jsonb)",
        [
          plan.id,
          latest.version,
          JSON.stringify({ ...details, place: "Cedar loop" }),
        ],
      )
    ).rows[0];
    expect(edited.place).toBe("Cedar loop");
    expect(edited.status).toBe("shared");
  });
  it("prevents nonparticipants from editing and prevents direct table writes", async () => {
    const plan = await share();
    await as(eric);
    await expect(
      db.query("select * from public.edit_plan($1,1,$2::jsonb)", [
        plan.id,
        JSON.stringify(details),
      ]),
    ).rejects.toThrow("Only participants");
  });
  it("does not grant authenticated members direct writes or access to incoming texts", async () => {
    await expect(
      db.query("update public.plans set place='Elsewhere'"),
    ).rejects.toThrow("permission denied");
  });
  it("keeps raw texts server-only", async () => {
    await expect(
      db.query("select * from public.incoming_messages"),
    ).rejects.toThrow("permission denied");
  });
});
