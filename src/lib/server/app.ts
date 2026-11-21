import type { AstroGlobal } from "astro";
import { getStore, TIMEZONE } from "./database";
import { identity, checkOrigin } from "./http";
import { takeFlash } from "./flash";
import { isCurrent } from "../plans";
import type { Message, Notice, Person, Plan } from "../types";

export type View = "plans" | "people" | "texts" | "notifications";
export const CIRCLE_NAME = "The usual people";

// Everything a page needs, read straight from the store during rendering.
export function loadApp(Astro: AstroGlobal) {
  const store = getStore();
  const meId = identity(Astro.cookies);
  const people = store.rows<Person>("people");
  const me = people.find((person) => person.id === meId)!;
  const plans = store
    .rows<Plan>("plans")
    .filter((plan) => isCurrent(plan))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    store,
    me,
    people,
    plans,
    timezone: TIMEZONE,
    circleName: CIRCLE_NAME,
    parser: process.env.OPENAI_API_KEY
      ? ("openai" as const)
      : ("examples" as const),
    preferences: store.notificationPreferences(meId),
    messages: store
      .rows<Message>("messages")
      .filter((message) => message.personId === meId),
    notices: store
      .rows<Notice>("notices")
      .filter((notice) => notice.recipientId === meId)
      .slice(-40),
    flash: takeFlash(Astro.cookies, Astro.request, Astro.locals),
    person: (id: string) => people.find((person) => person.id === id),
  };
}
export type App = ReturnType<typeof loadApp>;

// Runs a page's form submission. Origin and identity checks happen first.
export async function readForm(Astro: AstroGlobal) {
  checkOrigin(Astro.request);
  return Astro.request.formData();
}
