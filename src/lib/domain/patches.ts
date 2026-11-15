import type { Alert, Job, Lead, OutboundMessage, Patch } from "./types";

/** Everything a patch can touch. The client store is a superset of this. */
export interface PatchableState {
  jobs: Job[];
  lead: Lead;
  outbox: OutboundMessage[];
  alerts: Alert[];
}

/**
 * Pure reducer shared by the server (so later tool calls in the same turn see
 * earlier ones) and the client (so both panes update from one event).
 */
export function applyPatch<S extends PatchableState>(state: S, patch: Patch): S {
  switch (patch.op) {
    case "job.add": {
      if (state.jobs.some((job) => job.code === patch.job.code)) return state;
      return { ...state, jobs: [...state.jobs, patch.job] };
    }
    case "job.update": {
      return {
        ...state,
        jobs: state.jobs.map((job) => (job.code === patch.code ? { ...job, ...patch.changes } : job)),
      };
    }
    case "lead.update": {
      return { ...state, lead: { ...state.lead, ...patch.changes } };
    }
    case "message.log": {
      if (state.outbox.some((m) => m.id === patch.message.id)) return state;
      return { ...state, outbox: [patch.message, ...state.outbox] };
    }
    case "alert.raise": {
      const existing = state.alerts.find((a) => a.leadId === patch.alert.leadId && !a.acknowledged);
      if (existing) {
        return {
          ...state,
          alerts: state.alerts.map((a) =>
            a.id === existing.id
              ? { ...a, headline: patch.alert.headline, detail: patch.alert.detail, emergencyKind: patch.alert.emergencyKind }
              : a,
          ),
        };
      }
      return { ...state, alerts: [patch.alert, ...state.alerts] };
    }
    case "alert.update": {
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.leadId === patch.leadId ? { ...a, ...patch.changes } : a)),
      };
    }
  }
}

export function applyPatches<S extends PatchableState>(state: S, patches: Patch[]): S {
  return patches.reduce((acc, patch) => applyPatch(acc, patch), state);
}
