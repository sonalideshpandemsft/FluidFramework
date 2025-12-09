/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { checkoutWithInitialTree } from "../../utils.js";
import { TreeViewOracle } from "./treeOracle.js";
import { SchematizingSimpleTreeView } from "../../../shared-tree/index.js";
import { MockNodeIdentifierManager } from "../../mockNodeKeyManager.js";

const schema = new SchemaFactory("test");

describe("TreeView Events Oracle", () => {
	describe("rootChanged event tracking", () => {
		it("tracks rootChanged when root is replaced", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Initial state should have 0 events
			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 0);
			assert.equal(diagnostics.rootChangedHistory.length, 0);

			// Change the root
			view.root = 10;

			// Validate that rootChanged was fired
			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 1);
			assert.equal(diagnostics.rootChangedHistory.length, 1);
			assert.equal(diagnostics.rootChangedHistory[0].isNewRoot, true);

			// Change root again
			view.root = 15;

			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 2);
			assert.equal(diagnostics.rootChangedHistory.length, 2);

			oracle.validate();
			oracle.dispose();
		});

		it("tracks rootChanged when root is set to undefined", () => {
			const config = new TreeViewConfiguration({
				schema: SchemaFactory.optional(schema.number),
			});
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 0);

			// Set root to undefined
			view.root = undefined;

			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 1);
			assert.equal(diagnostics.rootChangedHistory[0].isNewRoot, true);

			oracle.validate();
			oracle.dispose();
		});

		it("does not track rootChanged for changes to root node content", () => {
			class TestNode extends schema.object("TestNode", {
				value: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: TestNode });
			const checkout = checkoutWithInitialTree(config, { value: 5 });
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 0);

			// Modify a property of the root node (not the root itself)
			view.root.value = 10;

			// rootChanged should NOT fire for changes to node content
			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 0);

			oracle.validate();
			oracle.dispose();
		});
	});

	describe("commitApplied event tracking", () => {
		it("tracks commitApplied for non-transactional changes", () => {
			class TestNode extends schema.object("TestNode", {
				value: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: TestNode });
			const checkout = checkoutWithInitialTree(config, { value: 5 });
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 0);
			assert.equal(diagnostics.commitAppliedHistory.length, 0);

			// Make a change outside of a transaction
			view.root.value = 10;

			// commitApplied should fire
			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 1);
			assert.equal(diagnostics.commitAppliedHistory.length, 1);
			// Local edits should have revertibles
			assert.equal(diagnostics.commitAppliedHistory[0].hasRevertible, true);

			oracle.validate();
			oracle.dispose();
		});

		it("tracks commitApplied for transaction commits", () => {
			class TestNode extends schema.object("TestNode", {
				value: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: TestNode });
			const checkout = checkoutWithInitialTree(config, { value: 5 });
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 0);

			// Make changes within a transaction
			checkout.transaction.start();
			view.root.value = 10;
			view.root.value = 15;

			// commitApplied should NOT fire yet (changes are in transaction)
			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 0);

			// Commit the transaction
			checkout.transaction.commit();

			// commitApplied should fire once for the transaction commit
			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 1);
			assert.equal(diagnostics.commitAppliedHistory[0].hasRevertible, true);

			oracle.validate();
			oracle.dispose();
		});

		it("does not track commitApplied when transaction is aborted", () => {
			class TestNode extends schema.object("TestNode", {
				value: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: TestNode });
			const checkout = checkoutWithInitialTree(config, { value: 5 });
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Make changes within a transaction
			checkout.transaction.start();
			view.root.value = 10;

			// Abort the transaction
			checkout.transaction.abort();

			// commitApplied should NOT fire
			const diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 0);

			oracle.validate();
			oracle.dispose();
		});
	});

	describe("combined event tracking", () => {
		it("tracks both rootChanged and commitApplied together", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Change root (should fire both rootChanged and commitApplied)
			view.root = 10;

			const diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 1);
			assert.equal(diagnostics.commitAppliedCount, 1);

			// Both events should have been captured
			assert.equal(diagnostics.rootChangedHistory.length, 1);
			assert.equal(diagnostics.commitAppliedHistory.length, 1);

			oracle.validate();
			oracle.dispose();
		});

		it("validates state consistency after multiple changes", () => {
			class TestNode extends schema.object("TestNode", {
				value: schema.number,
			}) {}

			const config = new TreeViewConfiguration({ schema: TestNode });
			const checkout = checkoutWithInitialTree(config, { value: 5 });
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Make multiple changes
			view.root.value = 10;
			view.root.value = 15;
			view.root.value = 20;

			// Validate state is consistent
			oracle.validate();

			const diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.commitAppliedCount, 3);

			oracle.dispose();
		});
	});

	describe("oracle lifecycle", () => {
		it("resets counters correctly", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Make some changes
			view.root = 10;
			view.root = 15;

			let diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 2);
			assert.equal(diagnostics.commitAppliedCount, 2);

			// Reset counters
			oracle.resetCounters();

			diagnostics = oracle.getDiagnostics();
			assert.equal(diagnostics.rootChangedCount, 0);
			assert.equal(diagnostics.commitAppliedCount, 0);
			assert.equal(diagnostics.rootChangedHistory.length, 0);
			assert.equal(diagnostics.commitAppliedHistory.length, 0);

			oracle.dispose();
		});

		it("disposes cleanly without errors", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Dispose should not throw
			assert.doesNotThrow(() => oracle.dispose());

			// Disposing again should be safe
			assert.doesNotThrow(() => oracle.dispose());
		});
	});

	describe("event semantic validation", () => {
		it("validates that rootChanged events correspond to root reference changes", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Make root changes
			view.root = 10;
			view.root = 15;

			// Validate semantics - should not throw
			assert.doesNotThrow(() => oracle.validateEventSemantics());

			oracle.dispose();
		});

		it("provides event history for debugging", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const checkout = checkoutWithInitialTree(config, 5);
			const view = new SchematizingSimpleTreeView(
				checkout,
				config,
				new MockNodeIdentifierManager(),
			);

			const oracle = new TreeViewOracle(view);

			// Make changes
			view.root = 10;
			view.root = 15;

			const diagnostics = oracle.getDiagnostics();

			// Verify history is tracked with timestamps
			assert.equal(diagnostics.rootChangedHistory.length, 2);
			for (const event of diagnostics.rootChangedHistory) {
				assert(event.timestamp > 0, "Event should have a valid timestamp");
				assert(typeof event.isNewRoot === "boolean", "Event should track if root changed");
			}

			assert.equal(diagnostics.commitAppliedHistory.length, 2);
			for (const event of diagnostics.commitAppliedHistory) {
				assert(event.timestamp > 0, "Event should have a valid timestamp");
				assert(
					typeof event.hasRevertible === "boolean",
					"Event should track revertible availability",
				);
			}

			oracle.dispose();
		});
	});
});
