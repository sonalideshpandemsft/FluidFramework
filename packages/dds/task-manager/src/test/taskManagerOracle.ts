/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITaskManager, TaskEventListener } from "../interfaces.js";
import type { TaskManager } from "../taskManagerFactory.js";

/**
 * @internal
 */
export class TaskManagerOracle {
	// Tracks local-client task state
	private readonly assigned = new Set<string>();
	private readonly queued = new Set<string>();
	private readonly subscribed = new Set<string>();

	public constructor(private readonly taskManager: ITaskManager) {
		// Snapshot initial state
		// (TaskManager APIs are local, so we just ask it directly)
		// In practice, most tasks will be empty at construction
		// but we still support snapshotting for symmetry
		this.refreshSnapshot();

		// Hook up listeners
		this.taskManager.on("assigned", this.onAssigned);
		this.taskManager.on("lost", this.onLost);
		this.taskManager.on("completed", this.onCompleted);
	}

	// === Event listeners ===

	private readonly onAssigned: TaskEventListener = (taskId) => {
		assert(
			this.queued.has(taskId) || this.subscribed.has(taskId),
			`"assigned" fired for task="${taskId}" but oracle did not consider it queued/subscribed`,
		);

		assert(
			!this.assigned.has(taskId),
			`"assigned" fired for task="${taskId}" but oracle already had it assigned`,
		);

		this.assigned.add(taskId);
	};

	private readonly onLost: TaskEventListener = (taskId) => {
		assert(
			this.assigned.has(taskId) || this.queued.has(taskId),
			`"lost" fired for task="${taskId}" but oracle did not consider it assigned/queued`,
		);

		this.assigned.delete(taskId);
		this.queued.delete(taskId);
	};

	private readonly onCompleted: TaskEventListener = (taskId) => {
		assert(
			this.assigned.has(taskId) || this.queued.has(taskId),
			`"completed" fired for task="${taskId}" but oracle did not consider it assigned/queued`,
		);

		this.assigned.delete(taskId);
		this.queued.delete(taskId);
		this.subscribed.delete(taskId);
	};

	// === Validation ===

	public validate(): void {
		// Compare oracle vs. live TaskManager
		for (const taskId of this.allKnownTasks()) {
			const actualAssigned = this.taskManager.assigned(taskId);
			const actualQueued = this.taskManager.queued(taskId);
			const actualSubscribed = this.taskManager.subscribed(taskId);

			assert.strictEqual(
				actualAssigned,
				this.assigned.has(taskId),
				`Mismatch on assigned for task="${taskId}"`,
			);

			assert.strictEqual(
				actualQueued,
				this.queued.has(taskId),
				`Mismatch on queued for task="${taskId}"`,
			);

			assert.strictEqual(
				actualSubscribed,
				this.subscribed.has(taskId),
				`Mismatch on subscribed for task="${taskId}"`,
			);
		}
	}

	// === Helpers ===

	private allKnownTasks(): string[] {
		// union of all sets
		return [...new Set([...this.assigned, ...this.queued, ...this.subscribed])];
	}

	private refreshSnapshot(): void {
		// In practice you’d need a source of “known taskIds” (fuzzer, driver, etc.)
		// Here we just clear and rebuild from current ITaskManager queries
		this.assigned.clear();
		this.queued.clear();
		this.subscribed.clear();
		// Example: if you track taskIds from fuzz ops, populate sets here
	}

	public dispose(): void {
		this.taskManager.off("assigned", this.onAssigned);
		this.taskManager.off("lost", this.onLost);
		this.taskManager.off("completed", this.onCompleted);
	}
}

/**
 * @internal
 */
export interface ITaskManagerOracle extends ITaskManager {
	taskManagerOracle: TaskManagerOracle;
}

/**
 * Type guard for map
 * @internal
 */
export function hasTaskManagerOracle(s: TaskManager): s is ITaskManagerOracle {
	return "taskManagerOracle" in s && s.taskManagerOracle instanceof TaskManagerOracle;
}
