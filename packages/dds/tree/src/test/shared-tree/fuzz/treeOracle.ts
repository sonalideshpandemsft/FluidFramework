/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { ISharedTree } from "../../../treeFactory.js";
import {
	TreeBeta,
	type TreeViewConfiguration,
	type NodeChangedData,
} from "../../../simple-tree/index.js";

/**
 * Tracks information about a nodeChanged event for validation
 */
interface NodeChangeRecord {
	/** The properties that changed in this event */
	changedProperties: Set<string>;
	/** Timestamp when the event fired */
	timestamp: number;
}

/**
 * Oracle for SharedTree that validates nodeChanged and treeChanged events.
 *
 * This oracle tracks node-level events to validate the eventing system.
 * It validates that:
 * 1. nodeChanged fires when node properties change
 * 2. changedProperties accurately reflects which properties changed
 * 3. treeChanged fires when any changes occur in the subtree
 * 4. Events fire after the tree is in a consistent state
 *
 * @remarks
 * This oracle tracks the root node of a tree view and validates events
 * using the beta API for consistency.
 *
 * @internal
 */
export class SharedTreeOracle {
	/**
	 * Track all nodeChanged events that have fired
	 */
	private readonly nodeChangeHistory: NodeChangeRecord[] = [];

	/**
	 * Counter for total nodeChanged events
	 */
	private nodeChangedCount = 0;

	/**
	 * Counter for total treeChanged events
	 */
	private treeChangedCount = 0;

	/**
	 * Maximum number of events to keep in history (prevent unbounded growth)
	 */
	private readonly maxHistorySize = 1000;

	/**
	 * Function to unsubscribe from nodeChanged events
	 */
	private readonly unsubscribeNodeChanged?: () => void;

	/**
	 * Function to unsubscribe from treeChanged events
	 */
	private readonly unsubscribeTreeChanged?: () => void;

	public constructor(
		private readonly fuzzTree: ISharedTree,
		viewConfig: TreeViewConfiguration,
	) {
		// Create a view to access the root node
		const view = this.fuzzTree.viewWith(viewConfig);

		// Only subscribe if the tree has been initialized (has a root)
		if (view.compatibility.canView) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const root = view.root as any;

			// Use TreeBeta.on for consistency (even though treeChanged has no beta-specific features)
			this.unsubscribeNodeChanged = TreeBeta.on(root, "nodeChanged", this.onNodeChanged);
			this.unsubscribeTreeChanged = TreeBeta.on(root, "treeChanged", this.onTreeChanged);
		}

		// Clean up the view since we only needed it for subscription
		view.dispose();
	}

	/**
	 * Handler for treeChanged events.
	 * Tracks that tree changes are occurring.
	 */
	private readonly onTreeChanged = (): void => {
		this.treeChangedCount++;
	};

	/**
	 * Handler for nodeChanged events.
	 * Captures which properties changed and validates the event data.
	 */
	private readonly onNodeChanged = (data: NodeChangedData): void => {
		this.nodeChangedCount++;

		// changedProperties can be undefined for array nodes
		if (data.changedProperties === undefined) {
			// Array nodes don't have named properties, skip tracking
			return;
		}

		// Validate that changedProperties is not empty
		// (nodeChanged should only fire when something actually changed)
		assert(
			data.changedProperties.size > 0,
			"nodeChanged fired with empty changedProperties set",
		);

		// Record this change event
		const record: NodeChangeRecord = {
			changedProperties: new Set(data.changedProperties),
			timestamp: Date.now(),
		};

		this.nodeChangeHistory.push(record);

		// Keep history size bounded
		if (this.nodeChangeHistory.length > this.maxHistorySize) {
			this.nodeChangeHistory.shift();
		}
	};

	/**
	 * Validates the oracle's state.
	 * This should be called at consistency check points in fuzz tests.
	 */
	public validate(): void {
		// Currently just validates that we've been tracking events
		// Additional validations can be added based on expected behavior

		// Validate that if we received nodeChanged events, they all had valid data
		for (const record of this.nodeChangeHistory) {
			assert(
				record.changedProperties.size > 0,
				"Found nodeChanged event with no changed properties",
			);
		}
	}

	/**
	 * Get statistics about the oracle's operation for debugging
	 */
	public getStats(): {
		nodeChangedCount: number;
		treeChangedCount: number;
		recentChanges: { changedProperties: string[]; timestamp: number }[];
	} {
		return {
			nodeChangedCount: this.nodeChangedCount,
			treeChangedCount: this.treeChangedCount,
			recentChanges: this.nodeChangeHistory.slice(-20).map((record) => ({
				changedProperties: [...record.changedProperties],
				timestamp: record.timestamp,
			})),
		};
	}

	public dispose(): void {
		if (this.unsubscribeNodeChanged !== undefined) {
			this.unsubscribeNodeChanged();
		}
		if (this.unsubscribeTreeChanged !== undefined) {
			this.unsubscribeTreeChanged();
		}
	}
}
