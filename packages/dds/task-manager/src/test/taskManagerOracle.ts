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
	private readonly assigned = new Set<string>();
	private readonly queued = new Set<string>();
	private readonly subscribed = new Set<string>();

	public constructor(private readonly taskManager: ITaskManager) {
		this.taskManager.on("assigned", this.onEvent);
		this.taskManager.on("lost", this.onEvent);
		this.taskManager.on("completed", this.onEvent);
	}

	private readonly onEvent: TaskEventListener = (taskId) => {
		// Always sync with live taskManager state
		if (this.taskManager.assigned(taskId)) {
			this.assigned.add(taskId);
		} else {
			this.assigned.delete(taskId);
		}

		if (this.taskManager.queued(taskId)) {
			this.queued.add(taskId);
		} else {
			this.queued.delete(taskId);
		}

		if (this.taskManager.subscribed(taskId)) {
			this.subscribed.add(taskId);
		} else {
			this.subscribed.delete(taskId);
		}
	};

	public validate(): void {
		for (const taskId of this.assigned) {
			assert.strictEqual(
				this.taskManager.assigned(taskId), // incorrect this.clientId returned; this.clientId = placeholder and currentAssignee = A
				true,
				`Mismatch on assigned for task="${taskId}"`,
			);
		}
		for (const taskId of this.queued) {
			assert.strictEqual(
				this.taskManager.queued(taskId),
				true,
				`Mismatch on queued for task="${taskId}"`,
			);
		}
		for (const taskId of this.subscribed) {
			assert.strictEqual(
				this.taskManager.subscribed(taskId),
				true,
				`Mismatch on subscribed for task="${taskId}"`,
			);
		}
	}

	public dispose(): void {
		this.taskManager.off("assigned", this.onEvent);
		this.taskManager.off("lost", this.onEvent);
		this.taskManager.off("completed", this.onEvent);
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
