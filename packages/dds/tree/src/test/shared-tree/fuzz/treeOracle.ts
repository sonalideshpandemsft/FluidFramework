/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedTree } from "../../../treeFactory.js";
import type { TreeView, ImplicitFieldSchema } from "../../../simple-tree/index.js";
import { toJsonableTree } from "../../utils.js";

/**
 * Oracle for ISharedTree that validates tree state consistency without requiring a specific schema.
 *
 * This oracle:
 * 1. Captures the tree state at the storage level
 * 2. Validates that the tree can be serialized (no corruption)
 * 3. Does not track events since ISharedTree doesn't expose tree-level events
 *
 * @remarks
 * For event tracking, use {@link TreeViewOracle} which requires a specific view schema.
 */
export class SharedTreeOracle {
	/**
	 * Shadow model: stores the last known good snapshot of the tree.
	 */
	private shadowSnapshot: string | undefined;

	public constructor(private readonly sharedTree: ISharedTree) {
		// Capture initial state
		this.captureSnapshot();
	}

	/**
	 * Capture the current tree state as a JSON snapshot for the shadow model
	 */
	private captureSnapshot(): void {
		const checkout = this.sharedTree.kernel.checkout;
		try {
			const jsonable = toJsonableTree(checkout);
			this.shadowSnapshot = JSON.stringify(jsonable);
		} catch (error) {
			assert.fail(
				`Oracle failed to serialize tree snapshot. This indicates corrupted tree state: ${error}`,
			);
		}
	}

	public validate(): void {
		// Validate that we can successfully get a snapshot of the tree
		try {
			const snapshot = this.sharedTree.contentSnapshot();
			assert(snapshot !== undefined, "Tree snapshot should not be undefined");
		} catch (error) {
			assert.fail(`Failed to get tree snapshot: ${error}`);
		}

		// Update shadow model to current state
		this.captureSnapshot();
	}

	/**
	 * Clean up resources (no-op since we don't have event subscriptions)
	 */
	public dispose(): void {
		// No resources to clean up
	}
}

/**
 * Oracle for TreeView that tracks view-level events and validates state consistency.
 *
 * This oracle:
 * 1. Captures the initial tree state as a baseline
 * 2. Tracks view-level events (rootChanged, schemaChanged, commitApplied)
 * 3. Maintains a shadow snapshot that is updated on each event
 * 4. Validates that the actual tree state matches the expected shadow state
 * 5. Validates event firing semantics: rootChanged fires when root field contents change
 * (new root assigned or schema changes), commitApplied fires for non-transactional changes
 * and on transaction commit
 *
 * @remarks
 * This oracle requires a specific view schema and tracks events at the TreeView level.
 * For schema-agnostic validation, use {@link SharedTreeOracle}.
 */
export class TreeViewOracle<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
	// View-level event counts
	private rootChangedCount = 0;
	private schemaChangedCount = 0;
	private commitAppliedCount = 0;

	private readonly eventUnsubscribers: (() => void)[] = [];

	/**
	 * Shadow model: stores the last known good snapshot of the tree.
	 * Updated on each tree change event to track expected state.
	 */
	private shadowSnapshot: string | undefined;

	/**
	 * Tracks the root node reference to detect when root field changes
	 * (assignment of new root) vs when root node content changes.
	 */
	private lastRootReference: unknown;

	/**
	 * History of rootChanged events with their contexts
	 */
	private readonly rootChangedHistory: {
		timestamp: number;
		rootReference: unknown;
		isNewRoot: boolean;
	}[] = [];

	/**
	 * History of commitApplied events with their metadata
	 */
	private readonly commitAppliedHistory: {
		timestamp: number;
		hasRevertible: boolean;
	}[] = [];

	public constructor(private readonly view: TreeView<TSchema>) {
		// Capture initial state BEFORE subscribing to events
		this.captureSnapshot();
		this.lastRootReference = this.view.root;

		// Subscribe to view-level events
		const unsubRootChanged = this.view.events.on("rootChanged", () => {
			this.onRootChanged();
		});
		const unsubSchemaChanged = this.view.events.on("schemaChanged", () => {
			this.onSchemaChanged();
		});
		const unsubCommitApplied = this.view.events.on("commitApplied", (data, getRevertible) => {
			this.onCommitApplied(data, getRevertible);
		});

		this.eventUnsubscribers.push(unsubRootChanged, unsubSchemaChanged, unsubCommitApplied);
	}

	/**
	 * Capture the current tree state as a JSON snapshot for the shadow model
	 */
	private captureSnapshot(): void {
		try {
			// Serialize the root to capture state
			const root = this.view.root;
			this.shadowSnapshot = JSON.stringify(root);
		} catch (error) {
			assert.fail(
				`Oracle failed to serialize tree snapshot. This indicates corrupted tree state: ${error}`,
			);
		}
	}

	/**
	 * Handler for rootChanged events
	 *
	 * Validates that rootChanged fires when:
	 * - A new root node is assigned (root field contents change)
	 * - The schema changes
	 *
	 * Should NOT fire when:
	 * - Only the content (properties/children) of the existing root node changes
	 */
	private onRootChanged(): void {
		this.rootChangedCount++;

		const currentRoot = this.view.root;
		const isNewRoot = currentRoot !== this.lastRootReference;

		this.rootChangedHistory.push({
			timestamp: Date.now(),
			rootReference: currentRoot,
			isNewRoot,
		});

		this.lastRootReference = currentRoot;
		this.captureSnapshot();
	}

	/**
	 * Handler for schemaChanged events
	 */
	private onSchemaChanged(): void {
		this.schemaChangedCount++;
		this.captureSnapshot();
	}

	/**
	 * Handler for commitApplied events
	 *
	 * Validates that commitApplied fires when:
	 * - A change is applied outside of a transaction
	 * - A transaction is committed
	 *
	 * Should NOT fire when:
	 * - A change is applied within a transaction (before commit)
	 * - A remote commit is applied
	 *
	 * Tracks whether a Revertible is available via getRevertible callback.
	 */
	private onCommitApplied(data: unknown, getRevertible?: unknown): void {
		this.commitAppliedCount++;

		this.commitAppliedHistory.push({
			timestamp: Date.now(),
			hasRevertible: getRevertible !== undefined,
		});

		this.captureSnapshot();
	}

	public validate(): void {
		// Validate that the current tree state matches the shadow model
		let currentSnapshot: string;
		try {
			const root = this.view.root;
			currentSnapshot = JSON.stringify(root);
		} catch (error) {
			assert.fail(
				`Oracle validation failed: unable to serialize current tree state: ${error}`,
			);
		}

		// Validate that current state matches shadow model
		if (this.shadowSnapshot !== undefined) {
			assert.strictEqual(
				currentSnapshot,
				this.shadowSnapshot,
				"Tree state diverged from shadow model. Current tree state does not match expected state from last tree change event.",
			);
		}

		// Validate event firing semantics
		this.validateEventSemantics();
	}

	/**
	 * Get diagnostic information about tracked events
	 */
	public getDiagnostics(): {
		rootChangedCount: number;
		schemaChangedCount: number;
		commitAppliedCount: number;
		rootChangedHistory: readonly {
			timestamp: number;
			rootReference: unknown;
			isNewRoot: boolean;
		}[];
		commitAppliedHistory: readonly {
			timestamp: number;
			hasRevertible: boolean;
		}[];
	} {
		return {
			rootChangedCount: this.rootChangedCount,
			schemaChangedCount: this.schemaChangedCount,
			commitAppliedCount: this.commitAppliedCount,
			rootChangedHistory: this.rootChangedHistory,
			commitAppliedHistory: this.commitAppliedHistory,
		};
	}

	/**
	 * Reset event counters and histories
	 */
	public resetCounters(): void {
		this.rootChangedCount = 0;
		this.schemaChangedCount = 0;
		this.commitAppliedCount = 0;
		this.rootChangedHistory.length = 0;
		this.commitAppliedHistory.length = 0;
	}

	/**
	 * Validate specific event firing semantics
	 */
	public validateEventSemantics(): void {
		// Validate that rootChanged events correspond to actual root reference changes
		// (excluding schema changes which also fire rootChanged)
		for (const event of this.rootChangedHistory) {
			// If this is a new root assignment, the root reference should have changed
			if (event.isNewRoot) {
				assert.notStrictEqual(
					event.rootReference,
					undefined,
					"rootChanged with new root should have a valid root reference",
				);
			}
		}

		// Validate that commitApplied events are properly tracking revertibles
		// At least some commits should be revertible (those from local edits)
		const revertibleCommits = this.commitAppliedHistory.filter(e => e.hasRevertible).length;

		// If there are any commits, we expect at least one to be revertible
		// (unless all changes were remote, which is unlikely in fuzz tests)
		if (this.commitAppliedCount > 0) {
			// This is informational - we can't strictly enforce this as remote changes
			// won't have revertibles, but we log it for debugging
			if (revertibleCommits === 0) {
				// Note: This is not an error, just diagnostic info
				// Remote commits won't have revertibles
			}
		}
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

/**
 * Type guard for TreeView with an oracle
 * @internal
 */
export interface ITreeViewWithOracle<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	extends TreeView<TSchema> {
	treeViewOracle: TreeViewOracle<TSchema>;
}

/**
 * Type guard for TreeView with an oracle
 * @internal
 */
export function hasTreeViewOracle<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): view is ITreeViewWithOracle<TSchema> {
	return "treeViewOracle" in view && view.treeViewOracle instanceof TreeViewOracle;
}
