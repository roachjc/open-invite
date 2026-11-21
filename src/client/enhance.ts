// Progressive enhancement for the server-rendered app. Every page works
// without this script. With it, links and forms fetch the server's HTML and
// swap it in, pages refresh in the background, and dialogs are modal.

type Page = { url: string; html: string; etag: string | null };
type Mode = "push" | "replace" | "pop" | "refresh";
type State = { from?: string; scroll?: number } | null;

const PARTIAL = { "x-open-invite-partial": "1" };
const BACKGROUND = { ...PARTIAL, "x-open-invite-background": "1" };
const ENHANCED = { ...PARTIAL, "x-open-invite-enhanced": "1" };
const LOCATION = "x-open-invite-location";
const PREFETCH_MS = 10_000;
const REFRESH_MS = 15_000;

const app = () => document.getElementById("app") as HTMLElement;
const here = () => location.pathname + location.search;
const pathOf = (url: string) => {
  const parsed = new URL(url, location.href);
  return parsed.pathname + parsed.search;
};
const state = () => history.state as State;

// Elements the script adds or that only matter without script. A refresh
// ignores them when deciding whether the page changed.
const TRANSIENT = "[data-toast], .message.pending, noscript";
function markupOf(element: Element) {
  const copy = element.cloneNode(true) as Element;
  for (const extra of copy.querySelectorAll(TRANSIENT)) extra.remove();
  return copy.outerHTML;
}

const prefetched = new Map<string, { at: number; page: Promise<Page> }>();
const scheduled = new WeakSet<Element>();
let busy = false;
let latest = 0;
let poppedPage: Page | null = null;
// The server markup on screen. A refresh that matches it changes nothing.
let shown = { path: here(), etag: null as string | null, markup: "" };
// The server markup of the open dialog, so unchanged contents are left alone.
let shownDialog = "";

async function read(response: Response): Promise<Page> {
  if (!response.headers.get("content-type")?.includes("text/html"))
    throw new Error("Unexpected response");
  return {
    url: response.headers.get(LOCATION) ?? response.url,
    html: await response.text(),
    etag: response.headers.get("etag"),
  };
}
const load = async (url: string, background = false) =>
  read(
    await fetch(url, {
      headers: background ? BACKGROUND : PARTIAL,
      cache: "no-store",
    }),
  );

function prefetch(url: string) {
  const path = pathOf(url);
  const hit = prefetched.get(path);
  if (hit && Date.now() - hit.at < PREFETCH_MS) return hit.page;
  const page = load(path, true);
  page.catch(() => prefetched.delete(path));
  prefetched.set(path, { at: Date.now(), page });
  return page;
}

function parse(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const next = doc.getElementById("app");
  // DOMParser runs without script, so no-script fallbacks would be live.
  for (const fallback of doc.querySelectorAll("noscript")) fallback.remove();
  return next ? { next, title: doc.title } : null;
}

// Replaces the app's contents with the server's, with two exceptions. An open
// dialog stays open when the new page shows the same one; only its contents
// change, because reopening it would move focus and re-announce it. And a
// refresh keeps any text being typed into a [data-persist] field.
function apply(next: HTMLElement, title: string, keepDrafts: boolean) {
  const root = app();
  const sameView = root.dataset.view === next.dataset.view;
  const focused = document.activeElement;
  const drafts = keepDrafts
    ? [...root.querySelectorAll<HTMLTextAreaElement>("[data-persist][id]")]
    : [];
  const caret = drafts.includes(focused as HTMLTextAreaElement)
    ? [
        (focused as HTMLTextAreaElement).selectionStart,
        (focused as HTMLTextAreaElement).selectionEnd,
      ]
    : null;

  const open = root.querySelector<HTMLDialogElement>("dialog[open]");
  const incoming = next.querySelector<HTMLDialogElement>("dialog[data-modal]");
  const kept =
    open && incoming && open.dataset.modal === incoming.dataset.modal
      ? open
      : null;

  // The kept dialog is never detached: removing a modal dialog closes it.
  for (const child of [...root.children]) if (child !== kept) child.remove();
  for (const { name } of [...root.attributes])
    if (!next.hasAttribute(name)) root.removeAttribute(name);
  for (const { name, value } of [...next.attributes])
    root.setAttribute(name, value);
  let afterKept = false;
  for (const child of [...next.children]) {
    if (kept && child === incoming) {
      if (markupOf(incoming) !== shownDialog)
        kept.replaceChildren(
          ...[...incoming.childNodes].map((node) =>
            document.importNode(node, true),
          ),
        );
      else {
        // Same contents, so keep focus and anything revealed. Show any message.
        const message = incoming.querySelector("[data-toast]");
        if (message) {
          kept.querySelector("[data-toast]")?.remove();
          kept.append(document.importNode(message, true));
        }
      }
      afterKept = true;
    } else if (kept && !afterKept)
      kept.before(document.importNode(child, true));
    else root.append(document.importNode(child, true));
  }

  for (const draft of drafts) {
    const replacement = document.getElementById(draft.id);
    if (!replacement || replacement === draft) continue;
    replacement.replaceWith(draft);
    if (caret) {
      draft.focus({ preventScroll: true });
      draft.setSelectionRange(caret[0], caret[1]);
    }
  }
  shown.markup = markupOf(next);
  shownDialog = incoming ? markupOf(incoming) : "";
  document.title = title;
  enhance(root);
  return sameView;
}

function render(page: Page, mode: Mode) {
  const parsed = parse(page.html);
  if (!parsed) return location.assign(page.url);
  const path = pathOf(page.url);
  if (mode === "refresh" && markupOf(parsed.next) === shown.markup) {
    shown.etag = page.etag;
    return;
  }
  if (mode === "push") history.pushState({ from: here() }, "", path);
  if (mode === "replace") history.replaceState(state(), "", path);
  shown = { path, etag: page.etag, markup: shown.markup };
  const sameView = apply(parsed.next, parsed.title, mode === "refresh");
  if (mode === "pop") scrollTo(0, state()?.scroll ?? 0);
  else if (mode === "push" && !sameView) {
    scrollTo(0, 0);
    if (!app().querySelector("dialog[open]"))
      document.getElementById("main")?.focus({ preventScroll: true });
  }
}

// Puts back the last server markup, undoing optimistic changes.
function revert() {
  const template = document.createElement("template");
  template.innerHTML = shown.markup;
  const markup = template.content.firstElementChild as HTMLElement | null;
  if (markup) apply(markup, document.title, true);
}

async function navigate(url: string, mode: Mode = "push") {
  const path = pathOf(url);
  const ticket = ++latest;
  history.replaceState({ ...state(), scroll: scrollY }, "");
  try {
    const hit = prefetched.get(path);
    const page =
      hit && Date.now() - hit.at < PREFETCH_MS
        ? await hit.page
        : await load(path);
    prefetched.delete(path);
    if (ticket !== latest) return;
    render(page, mode === "push" && path === here() ? "replace" : mode);
  } catch {
    location.assign(path);
  }
}

// Shows a plan's pre-rendered dialog at once, then swaps in the server's page.
function openInstantly(path: string) {
  const template = app().querySelector<HTMLTemplateElement>(
    `template[data-dialog="${CSS.escape(path)}"]`,
  );
  if (!template || app().querySelector("dialog")) return false;
  const ticket = ++latest;
  history.replaceState({ ...state(), scroll: scrollY }, "");
  history.pushState({ from: here() }, "", path);
  app().append(document.importNode(template.content, true));
  // The template matches the server's dialog, so confirming it keeps focus.
  shownDialog = markupOf(template.content.firstElementChild!);
  // Not the server's markup for this address, so the confirmation always applies.
  shown = { path, etag: null, markup: "" };
  document.title = template.dataset.title!;
  enhance(app());
  prefetch(path)
    .then((page) => {
      prefetched.delete(path);
      if (ticket === latest && here() === path) render(page, "refresh");
    })
    .catch(() => {});
  return true;
}

// Dialogs return to the page they were opened from when there is one.
function close(fallback: string) {
  if (state()?.from) history.back();
  else void navigate(fallback, "replace");
}

function requestId() {
  if (crypto.randomUUID && isSecureContext) return crypto.randomUUID();
  // randomUUID needs a secure context, which excludes a phone on a private
  // HTTP address.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toast(message: string) {
  const template = document.getElementById(
    "toast-template",
  ) as HTMLTemplateElement;
  const element = template.content.firstElementChild!.cloneNode(
    true,
  ) as HTMLElement;
  element.querySelector("span")!.textContent = message;
  app().querySelector("[data-toast]")?.remove();
  (app().querySelector("dialog[open]") ?? app()).append(element);
  enhance(app());
}

function updateRequirements(root: ParentNode) {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-requires]",
  )) {
    const field = document.getElementById(
      button.dataset.requires!,
    ) as HTMLTextAreaElement | null;
    button.disabled = busy || !field?.value.trim();
  }
}

function optimisticMessage(form: HTMLFormElement) {
  const field = form.querySelector<HTMLTextAreaElement>("#message");
  const thread = app().querySelector("[data-thread]");
  if (!field || !thread) return;
  const bubble = document.createElement("div");
  bubble.className = "message incoming pending";
  const body = document.createElement("p");
  body.textContent = field.value.trim();
  bubble.append(body);
  thread.querySelector(".typing")?.before(bubble);
}

async function submit(form: HTMLFormElement, submitter: HTMLElement | null) {
  if (busy) return;
  busy = true;
  const data = new FormData(form, submitter);
  for (const input of form.querySelectorAll<HTMLInputElement>(
    "[data-request-id]",
  ))
    data.set(input.name, requestId());
  const buttons = [
    ...form.querySelectorAll<HTMLButtonElement>("button"),
  ].filter((button) => !button.disabled);
  form.setAttribute("aria-busy", "true");
  for (const button of buttons) button.disabled = true;
  optimisticMessage(form);
  const ticket = ++latest;
  const transient = app().hasAttribute("data-transient");
  const restore = () => {
    form.removeAttribute("aria-busy");
    for (const button of buttons) button.disabled = false;
  };
  try {
    const page = await read(
      await fetch(form.action, {
        method: "POST",
        headers: ENHANCED,
        body: new URLSearchParams(data as unknown as Record<string, string>),
      }),
    );
    prefetched.clear();
    if (ticket !== latest) return;
    // Unchanged parts of the page, possibly this form, are kept as they are.
    restore();
    busy = false;
    const result = pathOf(page.url);
    if (result === here()) render(page, "replace");
    else if (transient && state()?.from === result) {
      // Saving a form dialog returns to where it was opened.
      poppedPage = page;
      history.back();
    } else render(page, transient ? "replace" : "push");
  } catch {
    restore();
    revert();
    toast("Couldn't reach Open Invite. Check your connection and try again.");
  } finally {
    busy = false;
    restore();
    updateRequirements(app());
  }
}

async function refresh() {
  if (busy || document.visibilityState !== "visible") return;
  if (!app().hasAttribute("data-live") || app().querySelector("[aria-busy]"))
    return;
  const path = here();
  const ticket = latest;
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: {
        ...BACKGROUND,
        ...(shown.path === path && shown.etag
          ? { "if-none-match": shown.etag }
          : {}),
      },
    });
    if (response.status !== 200 || busy || ticket !== latest || path !== here())
      return;
    render(await read(response), "refresh");
  } catch {
    // Offline or restarting. The next refresh will try again.
  }
}

function enhance(root: HTMLElement) {
  for (const dialog of root.querySelectorAll<HTMLDialogElement>(
    "dialog[data-modal][open]",
  ))
    if (!dialog.matches(":modal")) {
      dialog.removeAttribute("open");
      dialog.showModal();
    }
  for (const element of root.querySelectorAll("[data-toast]"))
    if (!scheduled.has(element)) {
      scheduled.add(element);
      setTimeout(() => element.remove(), 4500);
    }
  updateRequirements(root);
}

function isInternal(link: HTMLAnchorElement) {
  return (
    link.origin === location.origin &&
    !link.target &&
    !link.hasAttribute("download") &&
    !link.pathname.startsWith("/api/") &&
    !(
      link.pathname === location.pathname &&
      link.search === location.search &&
      link.hash
    )
  );
}

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

async function copyNumbers(button: HTMLElement) {
  const container = button.closest<HTMLElement>("[data-numbers]")!;
  const numbers = container.dataset.numbers!;
  const status = container.querySelector("[data-copy-status]")!;
  if (!container.querySelector(".recipient-numbers")) {
    const label = document.createElement("label");
    label.className = "recipient-numbers";
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = numbers;
    input.dataset.selectAll = "";
    label.append("Participant numbers", input);
    container.append(label);
  }
  try {
    await navigator.clipboard.writeText(numbers);
    status.textContent =
      "Numbers copied. Paste them into the To field in Messages.";
  } catch {
    status.textContent =
      "Select and copy the numbers below, then paste them into the To field in Messages.";
  }
}

async function copyLink(button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(
      location.origin + button.dataset.copyLink,
    );
    const label = button.querySelector("[data-label]")!;
    button.classList.add("done");
    label.textContent = "Link copied";
    setTimeout(() => {
      button.classList.remove("done");
      label.textContent = "Copy plan link";
    }, 2000);
  } catch {
    toast("Copy the plan's address from your browser.");
  }
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  const target = event.target as Element;
  const button = target.closest<HTMLButtonElement>("button[type=button]");
  if (button) {
    if (button.hasAttribute("data-dismiss"))
      button.closest("[data-toast]")?.remove();
    else if (button.dataset.fill) {
      const field = document.getElementById(
        button.dataset.fill,
      ) as HTMLTextAreaElement;
      field.value = button.value;
      field.focus();
      updateRequirements(app());
    } else if (button.hasAttribute("data-copy-numbers"))
      void copyNumbers(button);
    else if (button.dataset.copyLink) void copyLink(button);
    return;
  }
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  if (link.dataset.smsApple && isAppleMobile()) {
    event.preventDefault();
    location.href = link.dataset.smsApple;
    return;
  }
  if (!isInternal(link)) return;
  event.preventDefault();
  if (link.hasAttribute("data-close")) close(link.href);
  else if (!openInstantly(pathOf(link.href))) void navigate(link.href);
});

document.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (event.defaultPrevented || form.target) return;
  if (new URL(form.action).origin !== location.origin) return;
  event.preventDefault();
  if (form.hasAttribute("data-close")) close(form.action);
  else if (form.method === "get") {
    const url = new URL(form.action);
    url.search = new URLSearchParams(
      new FormData(form) as unknown as Record<string, string>,
    ).toString();
    void navigate(url.href);
  } else void submit(form, event.submitter);
});

document.addEventListener("change", (event) => {
  const field = event.target as HTMLInputElement;
  if (!field.hasAttribute("data-autosubmit")) return;
  const label = field.parentElement?.querySelector("[data-switch-label]");
  if (label) label.textContent = field.checked ? "On" : "Off";
  field.form?.requestSubmit();
});

document.addEventListener("input", (event) => {
  if ((event.target as Element).matches("textarea, input"))
    updateRequirements(app());
});

document.addEventListener("keydown", (event) => {
  const field = event.target as HTMLTextAreaElement;
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    field.matches?.("[data-enter-submits]") &&
    field.value.trim()
  ) {
    event.preventDefault();
    field.form?.requestSubmit();
  }
});

function prefetchFrom(event: Event) {
  const link = (event.target as Element).closest?.(
    "a[href]",
  ) as HTMLAnchorElement | null;
  if (link && isInternal(link) && !link.hasAttribute("data-close"))
    void prefetch(link.href).catch(() => {});
}
document.addEventListener("focusin", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.matches("[data-select-all]")) target.select();
  prefetchFrom(event);
});
document.addEventListener("pointerover", prefetchFrom, { passive: true });
document.addEventListener("touchstart", prefetchFrom, { passive: true });

// Escape closes a dialog the same way its close button does.
document.addEventListener(
  "cancel",
  (event) => {
    const control = (event.target as Element).querySelector<
      HTMLFormElement | HTMLAnchorElement
    >("[data-close]");
    if (!control) return;
    event.preventDefault();
    close(control instanceof HTMLFormElement ? control.action : control.href);
  },
  true,
);

addEventListener("popstate", async () => {
  const page = poppedPage;
  poppedPage = null;
  if (page) return render(page, "pop");
  const ticket = ++latest;
  try {
    const loaded = await load(here());
    if (ticket === latest) render(loaded, "pop");
  } catch {
    location.reload();
  }
});

if (app()) {
  // No-script fallbacks are inert here, and comparisons ignore them.
  for (const fallback of document.querySelectorAll("noscript"))
    fallback.remove();
  shown.markup = markupOf(app());
  const dialog = app().querySelector("dialog[data-modal]");
  shownDialog = dialog ? markupOf(dialog) : "";
  history.scrollRestoration = "manual";
  history.replaceState(state() ?? {}, "");
  setInterval(refresh, REFRESH_MS);
  addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  enhance(app());
}
