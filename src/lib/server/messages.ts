import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { Store } from "./database";
import { extract } from "./extraction";
import { planDescription, mergePlanDraft } from "../plans";

type Extractor = typeof extract;
const locks = new Map<string, Promise<unknown>>();
export async function processMessage(
  store: Store,
  personId: string,
  body: string,
  messageId: string = randomUUID(),
  now: DateTime = DateTime.now(),
  extractor: Extractor = extract,
) {
  const previous = locks.get(personId) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      const person = store.person(personId);
      const seen = store.receipt(messageId);
      if (seen) return seen;
      const text = body.trim();
      if (!text || text.length > 1500)
        throw new Error("Please use between 1 and 1,500 characters.");
      store.message(personId, "incoming", text);
      let reply: string;
      let planId: string | null = null;
      if (/^(cancel|start over)$/i.test(text)) {
        store.clearDraft(personId);
        reply = "Draft cleared. No plan was shared.";
      } else {
        const current = store.getDraft(personId);
        const changes = await extractor(
          text,
          now.setZone(person.timezone),
          current,
        );
        const draft = mergePlanDraft(current, changes, person.timezone);
        const missing = [
          !draft.activity && "what you're doing",
          !draft.ageGroups?.length &&
            "which age groups are coming (kids, adults, or both)",
          !draft.place && "where",
          !draft.startsAt && "when",
        ].filter(Boolean);
        if (missing.length) {
          store.saveDraft(personId, draft);
          reply = `Got it. Before I share it, tell me ${missing.join(" and ")}.`;
        } else {
          const plan = store.create(
            personId,
            { ...draft, category: draft.category || "other" },
            now,
          );
          planId = plan.id;
          store.clearDraft(personId);
          reply = `Shared with your circle. ${planDescription(plan)}`;
        }
      }
      const result = { reply, planId };
      store.message(personId, "outgoing", reply, planId);
      store.saveReceipt(messageId, result);
      return result;
    });
  locks.set(personId, task);
  try {
    return await task;
  } finally {
    if (locks.get(personId) === task) locks.delete(personId);
  }
}
