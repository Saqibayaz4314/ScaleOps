import { redirect } from "next/navigation";

// The docs name this route /events; the canonical page is /scaling-events.
export default function EventsAlias() {
  redirect("/scaling-events");
}
