/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedTree } from "../../../treeFactory.js";
import { treeNodeApi, type TreeNode } from "../../../simple-tree/index.js";
import { toJsonableTree } from "../../utils.js";

/**
 * Oracle for SharedTree that validates tree state consistency by maintaining a shadow model.
 *
 * This oracle:
 * 1. Captures the initial tree state as a baseline
 * 2. Tracks tree change events (nodeChanged/treeChanged) on the root node
 * 3. Maintains a shadow snapshot that is updated on each event
 * 4. Validates that the actual tree state matches the expected shadow state
 *
 * @remarks
 * SharedTree's event model is fundamentally different from other DDSs:
 * - Events fire on individual tree nodes (semantic) rather than operation-specific events
 * - Changes are tracked via snapshots rather than individual operation replay
 * - The oracle subscribes to the root node to capture all tree modifications
 *
 * The validation strategy:
 * - On each tree change event, capture a new snapshot as the "expected" state
 * - During validation, compare the current tree state against the last known shadow state
 * - Ensures the tree remains serializable and consistent across all operations
 *
 * @internal
 */
export class SharedTreeOracle {
	private nodeChangedCount = 0;
	private treeChangedCount = 0;
	private readonly eventUnsubscribers: (() => void)[] = [];
	/**
	 * Shadow model: stores the last known good snapshot of the tree.
	 * Updated on each tree change event to track expected state.
	 */
	private shadowSnapshot: string | undefined;

	public constructor(private readonly sharedTree: ISharedTree) {
		// Capture initial state BEFORE subscribing to events
		// to avoid double-counting any events that might fire during initialization
		this.captureSnapshot();

		// Subscribe to root-level events if the tree has content
		const root = this.getRootNode();
		if (root !== undefined) {
			this.subscribeToNodeEvents(root);
		}
	}

	/**
	 * Get the root node of the tree, if it exists
	 */
	private getRootNode(): TreeNode | undefined {
		// Access the root through the tree's view
		// This is type-unsafe but necessary for oracle to work generically
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const view = (this.sharedTree as any).view;
		if (view?.root !== undefined) {
			return view.root as TreeNode;
		}
		return undefined;
	}

	/**
	 * Subscribe to events on a tree node
	 */
	private subscribeToNodeEvents(node: TreeNode): void {
		const unsubNodeChanged = treeNodeApi.on(node, "nodeChanged", () => {
			this.onNodeChanged();
		});
		const unsubTreeChanged = treeNodeApi.on(node, "treeChanged", () => {
			this.onTreeChanged();
		});

		this.eventUnsubscribers.push(unsubNodeChanged, unsubTreeChanged);
	}

	/**
	 * Capture the current tree state as a JSON snapshot for the shadow model
	 */
	private captureSnapshot(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const checkout = (this.sharedTree as any).checkout;
		if (checkout !== undefined) {
			try {
				const jsonable = toJsonableTree(checkout);
				this.shadowSnapshot = JSON.stringify(jsonable);
			} catch (error) {
				// If serialization fails, this indicates a real problem with the tree state
				assert.fail(
					`Oracle failed to serialize tree snapshot. This indicates corrupted tree state: ${error}`,
				);
			}
		}
		// If checkout is undefined, keep previous shadow snapshot or remain undefined
	}

	/**
	 * Handler for nodeChanged events
	 */
	private onNodeChanged(): void {
		this.nodeChangedCount++;
		// Update shadow model to reflect the change
		this.captureSnapshot();
	}

	/**
	 * Handler for treeChanged events
	 */
	private onTreeChanged(): void {
		this.treeChangedCount++;
		// Update shadow model to reflect the change
		this.captureSnapshot();
	}

	/**
	 * Validate the tree state against the shadow model
	 *
	 * @remarks
	 * This oracle validates:
	 * 1. The tree can be successfully serialized (no corrupt state)
	 * 2. The current tree state matches the shadow model's expected state
	 * 3. Snapshots remain consistent across validation calls
	 *
	 * The shadow model is updated on each tree change event, so validation
	 * checks that the tree's current state matches the last observed change.
	 */
	public validate(): void {
		// Validate that we can successfully get a snapshot of the tree
		// This ensures the tree is in a valid, serializable state
		try {
			const snapshot = this.sharedTree.contentSnapshot();
			assert(snapshot !== undefined, "Tree snapshot should not be undefined");
		} catch (error) {
			assert.fail(`Failed to get tree snapshot: ${error}`);
		}

		// Validate that the current tree state matches the shadow model
		let currentSnapshot: string | undefined;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const checkout = (this.sharedTree as any).checkout;
		if (checkout !== undefined) {
			try {
				const jsonable = toJsonableTree(checkout);
				currentSnapshot = JSON.stringify(jsonable);
			} catch (error) {
				// If we can't serialize during validation, that's a validation failure
				assert.fail(
					`Oracle validation failed: unable to serialize current tree state: ${error}`,
				);
			}
		}

		// If we have both a shadow snapshot and current snapshot, they should match
		if (this.shadowSnapshot !== undefined && currentSnapshot !== undefined) {
			assert.strictEqual(
				currentSnapshot,
				this.shadowSnapshot,
				"Tree state diverged from shadow model. Current tree state does not match expected state from last tree change event.",
			);
		}

		// Note: Event counts are tracked but not asserted, as the number of events
		// depends on the specific operations performed and can vary between clients
		// due to how changes are batched and propagated
	}

	/**
	 * Get diagnostic information about tracked events
	 *
	 * @returns Object containing event counts
	 */
	public getDiagnostics(): { nodeChangedCount: number; treeChangedCount: number } {
		return {
			nodeChangedCount: this.nodeChangedCount,
			treeChangedCount: this.treeChangedCount,
		};
	}

	/**
	 * Reset event counters
	 *
	 * @remarks
	 * Useful for testing specific scenarios or resetting between test phases
	 */
	public resetCounters(): void {
		this.nodeChangedCount = 0;
		this.treeChangedCount = 0;
	}

	/**
	 * Clean up event subscriptions
	 */
	public dispose(): void {
		for (const unsubscribe of this.eventUnsubscribers) {
			unsubscribe();
		}
		this.eventUnsubscribers.length = 0;
	}
}

/**
 * Type guard for SharedTree with an oracle
 * @internal
 */
export interface ISharedTreeWithOracle extends ISharedTree {
	sharedTreeOracle: SharedTreeOracle;
}

/**
 * Type guard for SharedTree with an oracle
 * @internal
 */
export function hasSharedTreeOracle(tree: ISharedTree): tree is ISharedTreeWithOracle {
	return "sharedTreeOracle" in tree && tree.sharedTreeOracle instanceof SharedTreeOracle;
}
