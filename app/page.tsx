import { HubClient } from "./HubClient";

/**
 * The hub — DESIGN-BRIEF §10. Five catalogue cells (SPEC v2 §0, ruling T11)
 * with live counts from a single polled /api/events feed (ruling T1); see
 * ./HubClient.tsx for the ticker + catalogue island.
 */
export default function Home() {
  return <HubClient />;
}
