"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bike,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  Compass,
  Copy,
  Footprints,
  Info,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  TreePine,
  Users,
  X,
} from "lucide-react";
import { ageGroupsDescription } from "@/lib/plans";
import { createRequestId } from "@/lib/request-id";
import { ExtractionInspector } from "@/components/extraction-inspector";
import type {
  AppState,
  Category,
  AgeGroup,
  Person,
  Plan,
  PlanInput,
} from "@/lib/types";

type View = "plans" | "people" | "texts" | "notifications";
type Filter = "upcoming" | "weekend" | "mine";
const icons = {
  bike: Bike,
  library: BookOpen,
  park: TreePine,
  walk: Footprints,
  coffee: Coffee,
  other: Compass,
};
const examples = [
  "Mountain biking at Chickity tomorrow at noon, no kids, for two hours.",
  "Going to the library on Saturday at 10am with my five-year-old, for an hour.",
  "Coffee at Little Oak tomorrow at 4pm, no kids.",
];

async function request<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(
    url,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "That didn't work. Please try again.");
  return result as T;
}
function Avatar({
  person,
  small = false,
}: {
  person: Person;
  small?: boolean;
}) {
  return (
    <span
      title={person.name}
      className={`avatar ${person.color} ${small ? "small" : ""}`}
    >
      {person.initials}
    </span>
  );
}
function Avatars({ ids, people }: { ids: string[]; people: Person[] }) {
  return (
    <span className="avatars">
      {ids.map((id) => {
        const person = people.find((p) => p.id === id);
        return person ? <Avatar key={id} person={person} small /> : null;
      })}
    </span>
  );
}
function clock(iso: string, zone: string) {
  return DateTime.fromISO(iso).setZone(zone).toFormat("h:mm a");
}
function dayLabel(iso: string, zone: string) {
  const day = DateTime.fromISO(iso).setZone(zone);
  const now = DateTime.now().setZone(zone);
  return day.hasSame(now, "day")
    ? "Today"
    : day.hasSame(now.plus({ days: 1 }), "day")
      ? "Tomorrow"
      : day.toFormat("cccc");
}
function inferCategory(activity: string): Category {
  if (/bik|ride|cycl/i.test(activity)) return "bike";
  if (/library|book/i.test(activity)) return "library";
  if (/park|playground/i.test(activity)) return "park";
  if (/coffee|cafe/i.test(activity)) return "coffee";
  if (/walk|hike/i.test(activity)) return "walk";
  return "other";
}

const ToastContext = createContext<{
  message: string;
  dismiss: () => void;
} | null>(null);

function ToastNotice() {
  const toast = useContext(ToastContext);
  if (!toast?.message) return null;
  return (
    <div className="toast" role="status">
      <Check size={16} />
      <span>{toast.message}</span>
      <button onClick={toast.dismiss} aria-label="Dismiss message">
        <X size={14} />
      </button>
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="dialog-head">
        <span className="eyebrow">OPEN INVITE</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
      <ToastNotice />
    </dialog>
  );
}

function PlanForm({
  plan,
  timezone,
  onSave,
  onClose,
  saving,
}: {
  plan?: Plan;
  timezone: string;
  onSave: (input: PlanInput) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [error, setError] = useState("");
  const tomorrow = DateTime.now()
    .setZone(timezone)
    .plus({ days: 1 })
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const start = plan
    ? DateTime.fromISO(plan.startsAt).setZone(timezone)
    : tomorrow;
  const end =
    plan && !plan.endWasDefault
      ? DateTime.fromISO(plan.endsAt)
          .setZone(timezone)
          .toFormat("yyyy-MM-dd'T'HH:mm")
      : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const from = DateTime.fromISO(String(data.get("start")), {
      zone: timezone,
    });
    const to = data.get("end")
      ? DateTime.fromISO(String(data.get("end")), { zone: timezone })
      : null;
    if (!from.isValid || (to && !to.isValid)) {
      setError("Check the start and end times.");
      return;
    }
    const activity = String(data.get("activity"));
    try {
      await onSave({
        activity,
        category: inferCategory(activity),
        ageGroups: data.getAll("ageGroups") as AgeGroup[],
        attendeeDetail: String(data.get("attendeeDetail") || ""),
        place: String(data.get("place")),
        startsAt: from.toISO()!,
        endsAt: to ? to.toISO()! : null,
        timezone,
        note: String(data.get("note") || ""),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Dialog title={plan ? "Edit plan" : "Share a plan"} onClose={onClose}>
      <h2>{plan ? "Edit plan" : "Already heading out?"}</h2>
      <p className="dialog-intro">
        {plan
          ? "Anyone going can edit. The others get a heads-up on what changed."
          : "Post it to the circle. Anyone free can join."}
      </p>
      <form onSubmit={submit} className="plan-form">
        <label>
          What are you doing?
          <input
            name="activity"
            placeholder="Ride, ski day, library run…"
            defaultValue={plan?.activity}
            required
            minLength={2}
            maxLength={100}
            autoFocus
          />
        </label>
        <div className="form-pair">
          <fieldset className="age-group-fields">
            <legend>Who&apos;s coming?</legend>
            {(["kids", "adults"] as const).map((group) => (
              <label key={group}>
                <input
                  type="checkbox"
                  name="ageGroups"
                  value={group}
                  defaultChecked={
                    plan ? plan.ageGroups.includes(group) : group === "adults"
                  }
                />
                {group === "kids" ? "Kids" : "Adults"}
              </label>
            ))}
          </fieldset>
          <label>
            Details <span>optional</span>
            <input
              name="attendeeDetail"
              placeholder="With my five-year-old"
              defaultValue={plan?.attendeeDetail}
              maxLength={140}
            />
          </label>
        </div>
        <p className="field-note">
          Everyone is welcome. Choose the age groups coming on this outing.
        </p>
        <label>
          Where?
          <input
            name="place"
            placeholder="Trailhead, park, address"
            defaultValue={plan?.place}
            required
            minLength={2}
            maxLength={160}
          />
        </label>
        <div className="form-pair">
          <label>
            When?
            <input
              type="datetime-local"
              name="start"
              defaultValue={start.toFormat("yyyy-MM-dd'T'HH:mm")}
              required
            />
          </label>
          <label>
            Until <span>optional</span>
            <input type="datetime-local" name="end" defaultValue={end} />
          </label>
        </div>
        <p className="field-note">
          Times in {timezone.replaceAll("_", " ")}. No end time means the plan
          runs until midnight.
        </p>
        <label>
          Anything else? <span>optional</span>
          <textarea
            name="note"
            rows={2}
            placeholder="Pace, gear, where to meet…"
            defaultValue={plan?.note}
            maxLength={500}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : plan ? (
              <Check size={16} />
            ) : (
              <ArrowUpRight size={17} />
            )}
            {plan ? "Save changes" : "Share with the circle"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function OpenInvite({ initialPlanId }: { initialPlanId?: string }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("plans");
  const [textMode, setTextMode] = useState<"conversation" | "inspect">(
    "conversation",
  );
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [company, setCompany] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPlanId || null,
  );
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [text, setText] = useState("");
  const [messageError, setMessageError] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const result = await request<AppState>("/api/state");
    setState(result);
    return result;
  }, []);
  useEffect(() => {
    let active = true;
    request<AppState>("/api/state")
      .then((result) => {
        if (active) setState(result);
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (form || busy) return;
    let active = true;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      request<AppState>("/api/state")
        .then((next) => {
          if (active) setState(next);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [form, busy]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state?.messages.length]);
  useEffect(() => {
    const onPop = () =>
      setSelectedId(
        location.pathname.startsWith("/plans/")
          ? location.pathname.split("/")[2]
          : null,
      );
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  async function action(url: string, data: unknown, success: string) {
    setBusy(true);
    try {
      await request(url, data);
      await refresh();
      setToast(success);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openPlan(id: string) {
    setSelectedId(id);
    window.history.pushState(null, "", `/plans/${id}`);
  }
  function closePlan() {
    setSelectedId(null);
    setForm(null);
    window.history.pushState(null, "", "/");
  }
  async function save(input: PlanInput) {
    setBusy(true);
    try {
      const editing = form === "edit" && selected;
      const result = await request<{ plan: Plan }>(
        editing ? `/api/plans/${editing.id}` : "/api/plans",
        editing ? { action: "edit", version: editing.version, input } : input,
      );
      await refresh();
      setForm(null);
      openPlan(result.plan.id);
      setToast(
        editing
          ? "Plan updated. The other participants have a notification preview."
          : "Plan shared. Your circle has a notification preview.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendText(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setMessageError("");
    try {
      const result = await request<{ reply: string; planId: string | null }>(
        "/api/messages",
        { body: text, messageId: createRequestId() },
      );
      setText("");
      await refresh();
      if (result.planId) setToast("Your plan is on the board.");
    } catch (error) {
      setMessageError((error as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <main className="loading-screen">
        <span className="logo-mark">
          <ArrowUpRight size={26} />
        </span>
        <h1>Open Invite</h1>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button
              className="button secondary"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <p>
            <LoaderCircle size={16} className="spin" /> Loading plans…
          </p>
        )}
      </main>
    );
  const me = state.people.find((p) => p.id === state.currentPersonId)!;
  const selected = state.plans.find((p) => p.id === selectedId);
  const now = DateTime.now().setZone(state.timezone);
  const saturday = now
    .startOf("day")
    .plus({ days: now.weekday === 7 ? -1 : (6 - now.weekday + 7) % 7 });
  const filtered = state.plans
    .filter((plan) => {
      if (company !== "all" && !plan.ageGroups.includes(company as AgeGroup))
        return false;
      if (filter === "mine" && !plan.participants.includes(me.id)) return false;
      if (filter === "weekend") {
        const date = DateTime.fromISO(plan.startsAt).setZone(plan.timezone);
        if (date < saturday || date >= saturday.plus({ days: 2 })) return false;
      }
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const groups = new Map<string, Plan[]>();
  for (const plan of filtered) {
    const key = DateTime.fromISO(plan.startsAt)
      .setZone(state.timezone)
      .toISODate()!;
    groups.set(key, [...(groups.get(key) || []), plan]);
  }
  const navigation: {
    id: View;
    label: string;
    icon: typeof Compass;
    count?: number;
  }[] = [
    { id: "plans", label: "What's happening", icon: Compass },
    {
      id: "people",
      label: "Our circle",
      icon: Users,
      count: state.people.length,
    },
    { id: "texts", label: "Try a text", icon: MessageCircle },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      count: state.notices.length || undefined,
    },
  ];
  const title =
    view === "people"
      ? "The usual people."
      : view === "texts"
        ? "Post by text."
        : view === "notifications"
          ? "Notifications"
          : "What are we doing?";

  return (
    <ToastContext.Provider
      value={{ message: toast, dismiss: () => setToast("") }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="logo-mark">
              <ArrowUpRight size={25} strokeWidth={1.7} />
            </span>
            <span>
              open invite<span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="circle-label">
            <span className="status-dot" /> {state.circleName}
            <ChevronDown size={13} />
          </div>
          <nav aria-label="Main navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  onClick={() => setView(item.id)}
                >
                  <Icon size={18} strokeWidth={1.65} />
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span className="nav-count">{item.count}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <ol className="sidebar-note" aria-label="How it works">
            <li>Post what you&apos;re doing.</li>
            <li>Anyone free can join.</li>
            <li>No RSVPs. No group chat.</li>
          </ol>
          <div className="sidebar-bottom">
            <div className="demo-label">
              <span /> Local preview
            </div>
            <label className="identity">
              <Avatar person={me} />
              <span>
                <small>Viewing as</small>
                <select
                  aria-label="Preview as a friend"
                  value={me.id}
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedId(null);
                    setForm(null);
                    void action(
                      "/api/demo/identity",
                      { personId: event.target.value },
                      "Switched perspective.",
                    );
                  }}
                >
                  {state.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </span>
              <ChevronDown size={14} />
            </label>
            <button
              className="reset-button"
              onClick={() => setResetConfirm(true)}
            >
              <RotateCcw size={12} /> Reset sample plans
            </button>
          </div>
        </aside>

        <div className="main-shell">
          <header className="topbar">
            <span className="breadcrumb">
              <span className="status-dot" /> {state.circleName}
              <span aria-hidden="true">/</span>
              <strong>
                {navigation.find((item) => item.id === view)?.label}
              </strong>
            </span>
            <div>
              <span className="sample-pill">Sample circle</span>
              <Avatar person={me} small />
            </div>
          </header>
          <main className="main-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {view === "plans"
                    ? now.toFormat("cccc, LLLL d")
                    : view === "people"
                      ? `${state.people.length} people · one circle`
                      : view === "texts"
                        ? "Text simulator"
                        : "Preview only"}
                </p>
                <h1>{title}</h1>
                <p className="subtitle">
                  {view === "people"
                    ? "Everyone here sees every plan."
                    : view === "texts"
                      ? textMode === "inspect"
                        ? "Inspect the request, response, and plan model without publishing."
                        : "One sentence: what, who, where, when. Complete plans go to the board."
                      : view === "notifications"
                        ? "Updates on new plans and plans you're in. No texts are sent from this preview."
                        : "What your friends have planned. Join anything that fits."}
                </p>
              </div>
              {view === "plans" && (
                <button
                  className="button primary share-button"
                  onClick={() => setForm("create")}
                >
                  <Plus size={17} /> Share a plan
                </button>
              )}
            </div>

            {view === "plans" && (
              <>
                <div className="board-toolbar">
                  <div className="tabs" aria-label="When to browse">
                    {(
                      [
                        ["upcoming", "Coming up"],
                        ["weekend", "This weekend"],
                        ["mine", "I'm going"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={filter === value ? "selected" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                        {value === "mine" && (
                          <span>
                            {
                              state.plans.filter((p) =>
                                p.participants.includes(me.id),
                              ).length
                            }
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <label className="company-filter">
                    <SlidersHorizontal size={14} />
                    <select
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      aria-label="Filter by age group"
                    >
                      <option value="all">All plans</option>
                      <option value="kids">Kids coming</option>
                      <option value="adults">Adults coming</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>
                <div className="board-layout">
                  <section className="plans-column" aria-label="Friends' plans">
                    {filtered.length === 0 && (
                      <div className="empty-state">
                        <TreePine size={36} strokeWidth={1} />
                        <h2>
                          {filter === "mine"
                            ? "You haven’t joined a plan yet."
                            : "No plans here yet."}
                        </h2>
                        <p>
                          {filter === "mine"
                            ? "Have a look at what's coming up, or share something you're already doing."
                            : "No plans here just yet. Heading somewhere anyway? Let your friends know."}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() =>
                            filter === "mine"
                              ? setFilter("upcoming")
                              : setForm("create")
                          }
                        >
                          {filter === "mine"
                            ? "See what's happening"
                            : "Share a plan"}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                    {[...groups.entries()].map(([date, plans]) => (
                      <section className="day-section" key={date}>
                        <div className="day-heading">
                          <h2>{dayLabel(plans[0].startsAt, state.timezone)}</h2>
                          <span>
                            {DateTime.fromISO(date).toFormat("ccc, LLL d")}
                          </span>
                          <small>
                            {plans.length}{" "}
                            {plans.length === 1 ? "plan" : "plans"}
                          </small>
                        </div>
                        <div className="plan-grid">
                          {plans.map((plan) => {
                            const Icon = icons[plan.category];
                            const joined = plan.participants.includes(me.id);
                            const start = DateTime.fromISO(
                              plan.startsAt,
                            ).setZone(plan.timezone);
                            return (
                              <article
                                className={`plan-card ${joined ? "joined" : ""}`}
                                key={plan.id}
                              >
                                <button
                                  className="card-open"
                                  onClick={() => openPlan(plan.id)}
                                  aria-label={`View ${plan.activity}`}
                                >
                                  <span className="plan-time">
                                    <strong>
                                      {start.toFormat("h:mm")}
                                      <small>{start.toFormat("a")}</small>
                                    </strong>
                                    {!plan.endWasDefault && (
                                      <span>
                                        to {clock(plan.endsAt, plan.timezone)}
                                      </span>
                                    )}
                                  </span>
                                  <span className="plan-main">
                                    <span className="plan-title">
                                      <span className="activity-icon">
                                        <Icon size={16} strokeWidth={1.75} />
                                      </span>
                                      <span>{plan.activity}</span>
                                    </span>
                                    <span className="plan-meta">
                                      <span className="plan-location">
                                        <MapPin size={13} />
                                        {plan.place}
                                      </span>
                                      {plan.attendeeDetail && (
                                        <span className="company-detail">
                                          {plan.attendeeDetail}
                                        </span>
                                      )}
                                    </span>
                                    {plan.note && (
                                      <span className="plan-note">
                                        {plan.note}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`company-tag ${plan.ageGroups.includes("kids") ? "with_kids" : ""}`}
                                  >
                                    {ageGroupsDescription(plan.ageGroups)}
                                  </span>
                                </button>
                                <div className="card-footer">
                                  <span className="going-summary">
                                    <Avatars
                                      ids={[...plan.participants].sort()}
                                      people={state.people}
                                    />
                                    <span>
                                      {plan.participants.length} going
                                    </span>
                                  </span>
                                  <button
                                    className={`join-small ${joined ? "joined" : ""}`}
                                    onClick={() => openPlan(plan.id)}
                                  >
                                    {joined ? (
                                      <>
                                        <Check size={14} /> Going
                                      </>
                                    ) : (
                                      <>
                                        <Plus size={14} /> Join
                                      </>
                                    )}
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </section>
                  <aside className="board-aside">
                    <div className="aside-panel">
                      <h2>Heading out?</h2>
                      <p>
                        A ride, a ski day, an hour at the library. Post it and
                        whoever&apos;s free can join. No obligation either way.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setView("texts")}
                      >
                        <MessageCircle size={14} /> Or post it by text
                      </button>
                    </div>
                    <div className="aside-panel">
                      <div className="aside-title">
                        <h3>Your circle</h3>
                        <span>{state.people.length}</span>
                      </div>
                      <div className="circle-avatars">
                        {state.people.map((p) => (
                          <Avatar person={p} key={p.id} small />
                        ))}
                      </div>
                      <p>Every plan goes to everyone here.</p>
                      <button
                        className="text-button"
                        onClick={() => setView("people")}
                      >
                        See everyone <ArrowRight size={14} />
                      </button>
                    </div>
                  </aside>
                </div>
              </>
            )}

            {view === "people" && (
              <>
                <div className="section-banner">
                  <Users size={18} />
                  <p>
                    One shared circle. Every plan is visible to everyone here.
                  </p>
                  <span>Sample contacts · fictional numbers</span>
                </div>
                <div className="people-grid">
                  {state.people.map((person) => (
                    <article className="person-card" key={person.id}>
                      <Avatar person={person} />
                      <div>
                        <h2>
                          {person.name}
                          {person.id === me.id && <span>you</span>}
                        </h2>
                        <p>
                          {
                            state.plans.filter((p) =>
                              p.participants.includes(person.id),
                            ).length
                          }{" "}
                          upcoming plans
                        </p>
                      </div>
                      <a
                        href={`sms:${person.phone}`}
                        aria-label={`Text ${person.name} at ${person.phone}`}
                      >
                        <MessageCircle size={14} /> {person.phone}
                      </a>
                    </article>
                  ))}
                </div>
                <p className="page-footnote">
                  Questions about a plan? Text each other directly. There&apos;s
                  no group chat in Open Invite.
                </p>
              </>
            )}

            {view === "texts" && (
              <>
                <div
                  className="simulator-modes"
                  role="group"
                  aria-label="Simulator mode"
                >
                  <button
                    aria-pressed={textMode === "conversation"}
                    onClick={() => setTextMode("conversation")}
                  >
                    Conversation
                  </button>
                  <button
                    aria-pressed={textMode === "inspect"}
                    onClick={() => setTextMode("inspect")}
                  >
                    Inspect extraction
                  </button>
                </div>
                {textMode === "inspect" ? (
                  <ExtractionInspector key={me.id} personName={me.name} />
                ) : (
                  <div className="text-layout">
                    <section className="text-simulator">
                      <div className="thread-header">
                        <span className="bot-avatar">
                          <ArrowUpRight size={20} />
                        </span>
                        <div>
                          <h2>Open Invite</h2>
                          <p>Local simulator · no SMS sent</p>
                        </div>
                        <span className="parser-badge">
                          {state.parser === "openai"
                            ? "AI extraction"
                            : "Example parser"}
                        </span>
                      </div>
                      <div className="thread" ref={threadRef}>
                        <div className="thread-date">Texting as {me.name}</div>
                        <div className="message outgoing">
                          Going somewhere? Tell me what, which age groups are
                          coming, where, and when. I&apos;ll share it with the
                          circle.
                        </div>
                        {state.messages.map((message) => (
                          <div
                            className={`message ${message.direction}`}
                            key={message.id}
                          >
                            <p>{message.body}</p>
                            {message.planId && (
                              <button
                                onClick={() => {
                                  setView("plans");
                                  openPlan(message.planId!);
                                }}
                              >
                                View plan <ArrowUpRight size={13} />
                              </button>
                            )}
                            <time>
                              {DateTime.fromISO(message.createdAt)
                                .setZone(state.timezone)
                                .toFormat("h:mm a")}
                            </time>
                          </div>
                        ))}
                        {busy && (
                          <div className="message outgoing typing">
                            <span />
                            <span />
                            <span />
                          </div>
                        )}
                      </div>
                      <form className="message-compose" onSubmit={sendText}>
                        <label className="sr-only" htmlFor="message">
                          Your text to the service
                        </label>
                        <textarea
                          id="message"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder="Going for a ride at…"
                          maxLength={1500}
                          rows={2}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                        />
                        <button
                          type="submit"
                          className="send-button"
                          disabled={!text.trim() || busy}
                          aria-label="Send text"
                        >
                          {busy ? (
                            <LoaderCircle size={18} className="spin" />
                          ) : (
                            <ArrowUpRight size={18} />
                          )}
                        </button>
                      </form>
                      {messageError && (
                        <p role="alert" className="error message-error">
                          {messageError}
                        </p>
                      )}
                    </section>
                    <aside className="text-help">
                      <span className="eyebrow">Examples</span>
                      <p>
                        Tap one to load it, or leave out a detail and answer the
                        follow-up.
                      </p>
                      {examples.map((example) => (
                        <button
                          key={example}
                          onClick={() => {
                            setText(example);
                            document.getElementById("message")?.focus();
                          }}
                        >
                          <span>&quot;{example}&quot;</span>
                          <ArrowDownLeft size={15} />
                        </button>
                      ))}
                      <div className="parser-note">
                        <Info size={16} />
                        <p>
                          {state.parser === "examples"
                            ? "This preview uses a small example parser. It understands the phrases above, with kids / no kids, and times like tomorrow at noon or in 30 minutes. It won't understand every sentence yet."
                            : "Messages use AI extraction. Missing required details stay in a draft until you answer."}
                        </p>
                      </div>
                      <p className="field-note">
                        Type &quot;cancel&quot; to discard an unfinished draft.
                        Notifications are previews only. This conversation is
                        with the service, not with your friends.
                      </p>
                    </aside>
                  </div>
                )}
              </>
            )}

            {view === "notifications" && (
              <section className="notification-list">
                <div className="notification-settings">
                  <div>
                    <h2>Text notifications</h2>
                    <p id="notification-setting-description">
                      New plans and updates to plans you&apos;ve joined. You can
                      still browse, share, and join plans when texts are off.
                      This preview does not send real texts.
                    </p>
                  </div>
                  <label className="notification-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Text notifications"
                      aria-describedby="notification-setting-description"
                      checked={state.notificationPreferences.enabled}
                      disabled={busy}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        void action(
                          "/api/notification-preferences",
                          { enabled },
                          enabled
                            ? "Text notifications turned on."
                            : "Text notifications turned off.",
                        );
                      }}
                    />
                    {state.notificationPreferences.enabled ? "On" : "Off"}
                  </label>
                </div>
                {!state.notices.length ? (
                  <div className="empty-state">
                    <Bell size={32} strokeWidth={1.2} />
                    <h2>Nothing for you just yet.</h2>
                    <p>
                      Share a plan as another friend to see the notification
                      here.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setView("texts")}
                    >
                      Try a text <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  [...state.notices].reverse().map((notice) => (
                    <article className="notification-card" key={notice.id}>
                      <span className="notice-icon">
                        <Bell size={17} />
                      </span>
                      <div>
                        <span className="eyebrow">
                          {notice.kind === "new" ? "New plan" : "Plan update"} ·
                          Preview
                        </span>
                        <p>{notice.body.replace(/ \/plans\/.*$/, "")}</p>
                        <button
                          className="text-button"
                          onClick={() => openPlan(notice.planId)}
                        >
                          Open plan <ArrowRight size={14} />
                        </button>
                      </div>
                      <time>
                        {DateTime.fromISO(notice.createdAt)
                          .setZone(state.timezone)
                          .toFormat("LLL d, h:mm a")}
                      </time>
                    </article>
                  ))
                )}
              </section>
            )}
          </main>
          <footer className="site-footer">
            <span>open invite.</span>
            <small>
              Local preview · Sample data ·{" "}
              {state.timezone.replaceAll("_", " ")}
            </small>
          </footer>
        </div>

        {selectedId && !selected && !form && (
          <Dialog title="Plan unavailable" onClose={closePlan}>
            <div className="unavailable">
              <CalendarDays size={32} />
              <h2>This plan isn&apos;t on the board.</h2>
              <p>It may have ended, or everyone may have left.</p>
              <button className="button primary" onClick={closePlan}>
                Back to the plans
              </button>
            </div>
          </Dialog>
        )}
        {selected && !form && (
          <Dialog title={selected.activity} onClose={closePlan}>
            <div className="detail-heading">
              <span className={`activity-icon large ${selected.category}`}>
                {(() => {
                  const Icon = icons[selected.category];
                  return <Icon size={22} strokeWidth={1.6} />;
                })()}
              </span>
              <span
                className={`company-tag ${selected.ageGroups.includes("kids") ? "with_kids" : ""}`}
              >
                {ageGroupsDescription(selected.ageGroups)}
              </span>
            </div>
            <h2 className="detail-title">{selected.activity}</h2>
            <dl className="detail-facts">
              <div>
                <dt>
                  <CalendarDays size={15} /> Date
                </dt>
                <dd>
                  {DateTime.fromISO(selected.startsAt)
                    .setZone(selected.timezone)
                    .toFormat("cccc, LLLL d")}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={15} /> Time
                </dt>
                <dd>
                  {clock(selected.startsAt, selected.timezone)}
                  {selected.endWasDefault
                    ? " · until the end of the day"
                    : ` – ${clock(selected.endsAt, selected.timezone)}`}
                  <small>{selected.timezone.replaceAll("_", " ")}</small>
                </dd>
              </div>
              <div>
                <dt>
                  <MapPin size={15} /> Where
                </dt>
                <dd>{selected.place}</dd>
              </div>
              <div>
                <dt>
                  <Users size={15} /> Who&apos;s coming?
                </dt>
                <dd>
                  {ageGroupsDescription(selected.ageGroups)}
                  {selected.attendeeDetail
                    ? ` · ${selected.attendeeDetail}`
                    : ""}
                  <small>Everyone is welcome, with or without children.</small>
                </dd>
              </div>
            </dl>
            {selected.note && <p className="detail-note">{selected.note}</p>}
            <div className="detail-people">
              <div className="aside-title">
                <h3>Who&apos;s going</h3>
                <span>
                  {selected.participants.length}{" "}
                  {selected.participants.length === 1 ? "person" : "people"}
                </span>
              </div>
              {[...selected.participants]
                .sort((a, b) =>
                  (
                    state.people.find((p) => p.id === a)?.name || ""
                  ).localeCompare(
                    state.people.find((p) => p.id === b)?.name || "",
                  ),
                )
                .map((id) => {
                  const person = state.people.find((p) => p.id === id)!;
                  return (
                    <div className="detail-person" key={id}>
                      <Avatar person={person} small />
                      <span>
                        {person.name}
                        {person.id === me.id ? " (you)" : ""}
                      </span>
                      <a
                        href={`sms:${person.phone}`}
                        aria-label={`Text ${person.name}`}
                      >
                        <MessageCircle size={16} />
                      </a>
                    </div>
                  );
                })}
              <p>Questions? Text each other directly. Numbers are samples.</p>
            </div>
            <div className="detail-actions">
              {selected.participants.includes(me.id) ? (
                <>
                  <div className="youre-in">
                    <Check size={16} /> You&apos;re going. See you there.
                  </div>
                  <div className="detail-action-row">
                    <button
                      disabled={busy}
                      className="button secondary"
                      onClick={() => setForm("edit")}
                    >
                      Edit plan
                    </button>
                    <button
                      disabled={busy}
                      className="button text-danger"
                      onClick={async () => {
                        await action(
                          `/api/plans/${selected.id}`,
                          { action: "leave" },
                          "You've left the plan.",
                        );
                      }}
                    >
                      I can&apos;t make it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  disabled={busy}
                  className="button primary full"
                  onClick={() =>
                    void action(
                      `/api/plans/${selected.id}`,
                      { action: "join" },
                      "You're going. The other participants have a notification preview.",
                    )
                  }
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Plus size={17} />
                  )}{" "}
                  I&apos;m coming
                </button>
              )}
              <button
                className="copy-link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${location.origin}/plans/${selected.id}`,
                    );
                    setCopyDone(true);
                    setTimeout(() => setCopyDone(false), 2000);
                  } catch {
                    setToast("Copy the plan's address from your browser.");
                  }
                }}
              >
                {copyDone ? <Check size={12} /> : <Copy size={12} />}
                {copyDone ? "Link copied" : "Copy plan link"}
              </button>
            </div>
          </Dialog>
        )}
        {form && (
          <PlanForm
            plan={form === "edit" ? selected : undefined}
            timezone={
              selected && form === "edit" ? selected.timezone : state.timezone
            }
            onSave={save}
            onClose={() => setForm(null)}
            saving={busy}
          />
        )}
        {resetConfirm && (
          <Dialog
            title="Reset sample data"
            onClose={() => setResetConfirm(false)}
          >
            <h2>Start fresh?</h2>
            <p className="dialog-intro">
              This removes the plans, texts, and notification previews
              you&apos;ve added locally, then restores the sample circle.
            </p>
            <div className="dialog-footer">
              <button
                className="button secondary"
                onClick={() => setResetConfirm(false)}
              >
                Keep my changes
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  await action(
                    "/api/demo/reset",
                    {},
                    "Sample circle restored.",
                  );
                  setResetConfirm(false);
                  closePlan();
                }}
              >
                Reset preview
              </button>
            </div>
          </Dialog>
        )}
        {!selectedId && !form && !resetConfirm && <ToastNotice />}
      </div>
    </ToastContext.Provider>
  );
}
