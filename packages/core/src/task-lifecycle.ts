import type { ModelSelection, TaskEnvelope, TaskSubmission, TaskVerification } from "@omniroute/contracts";
import { PersistentTaskStore, isTerminalTaskState } from "./task-state.js";

export class TaskLifecycle {
  constructor(private readonly store: PersistentTaskStore) {}

  submit(input: TaskSubmission): Promise<TaskEnvelope> { return this.store.submit(input); }

  async status(id: string): Promise<TaskEnvelope> {
    const task = await this.store.get(id);
    if (!task) throw new Error("TASK_NOT_FOUND");
    return task;
  }

  async inspectPlan(id: string): Promise<Pick<TaskEnvelope, "id" | "state" | "selectedRoute" | "requiredCapabilities" | "approvedTools" | "budget" | "stopConditions" | "acceptanceCriteria">> {
    const task = await this.status(id);
    return { id: task.id, state: task.state, selectedRoute: task.selectedRoute, requiredCapabilities: task.requiredCapabilities, approvedTools: task.approvedTools, budget: task.budget, stopConditions: task.stopConditions, acceptanceCriteria: task.acceptanceCriteria };
  }

  async pause(id: string, reason = "paused by user"): Promise<TaskEnvelope> {
    const task = await this.status(id);
    return task.state === "paused-for-approval" ? task : this.store.transition(id, "paused-for-approval", { reason });
  }

  async approve(id: string, approvalId: string): Promise<TaskEnvelope> {
    if (!approvalId?.trim()) throw new Error("TASK_APPROVAL_REQUIRED");
    const task = await this.status(id);
    if (task.state !== "paused-for-approval") throw new Error("TASK_APPROVAL_NOT_PENDING");
    return this.store.transition(id, "planning", { reason: "approved" });
  }

  async resume(id: string): Promise<TaskEnvelope> {
    const task = await this.status(id);
    if (task.state !== "paused-for-approval") throw new Error("TASK_RESUME_NOT_PAUSED");
    return this.store.transition(id, "planning", { reason: "resumed" });
  }

  async start(id: string, route: ModelSelection): Promise<TaskEnvelope> {
    const task = await this.status(id);
    if (task.state !== "planning" && task.state !== "repair") throw new Error("TASK_START_NOT_PLANNED");
    return this.store.transition(id, "executing", { route, reason: "executor started" });
  }

  async verify(id: string, verification: Omit<TaskVerification, "at"> & { at?: string }): Promise<TaskEnvelope> {
    const task = await this.status(id);
    const at = verification.at ?? new Date().toISOString();
    const checked = task.state === "executing" ? await this.store.transition(id, "verifying", { reason: "verification started" }) : task;
    if (checked.state !== "verifying") throw new Error("TASK_VERIFY_NOT_EXECUTING");
    return this.store.recordVerification(id, { ...verification, at });
  }

  async cancel(id: string, reason = "cancelled by user"): Promise<TaskEnvelope> {
    const task = await this.status(id);
    return isTerminalTaskState(task.state) ? task : this.store.transition(id, "cancelled", { reason });
  }

  async inspectDiff(id: string): Promise<TaskEnvelope["artifacts"]> {
    return (await this.status(id)).artifacts.filter((artifact) => artifact.kind === "diff");
  }

  report(id: string): Promise<TaskEnvelope> { return this.status(id); }
}
