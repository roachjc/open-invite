export type AgeGroup = "kids" | "adults";
export type Category =
  "bike" | "library" | "walk" | "park" | "coffee" | "other";
export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
  phone: string;
  timezone: string;
};
export type PlanInput = {
  activity: string;
  category: Category;
  ageGroups: AgeGroup[];
  attendeeDetail: string;
  place: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  note: string;
};
export type PlanDraft = Partial<PlanInput> & { durationMinutes?: number };
export type Plan = Omit<PlanInput, "endsAt"> & {
  id: string;
  endsAt: string;
  endWasDefault: boolean;
  version: number;
  participants: string[];
  status: "shared" | "withdrawn";
};
export type Message = {
  id: string;
  personId: string;
  direction: "incoming" | "outgoing";
  body: string;
  createdAt: string;
  planId: string | null;
};
export type Notice = {
  id: string;
  recipientId: string;
  body: string;
  planId: string;
  createdAt: string;
  kind: "new" | "change" | "joined" | "left";
  status: "preview";
};
export type NotificationPreferences = {
  enabled: boolean;
};
export type AppState = {
  notificationPreferences: NotificationPreferences;
  people: Person[];
  plans: Plan[];
  messages: Message[];
  notices: Notice[];
  currentPersonId: string;
  circleName: string;
  timezone: string;
  parser: "examples" | "openai";
};
