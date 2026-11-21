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
  TreePine,
  Users,
  X,
} from "lucide";
import type { Category } from "@/lib/types";

// Every icon the app uses. Each is sent once per page as a sprite symbol.
const used = {
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
  TreePine,
  Users,
  X,
};
export type IconNode = (typeof used)[keyof typeof used];
export const sprite = Object.entries(used).map(([name, node]) => ({
  id: `i-${name}`,
  node,
}));
export const spriteId = new Map(sprite.map(({ id, node }) => [node, id]));

export const categoryIcons = {
  bike: Bike,
  library: BookOpen,
  park: TreePine,
  walk: Footprints,
  coffee: Coffee,
  other: Compass,
} satisfies Record<Category, IconNode>;
