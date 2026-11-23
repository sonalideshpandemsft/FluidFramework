/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	createSessionId,
	deserializeIdCompressor,
	SerializationVersion,
	serializeIdCompressor,
} from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import * as previousTree from "@fluidframework/tree-previous/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import {
	RebaseValidation,
	flattenCustomMetadata,
	type ChangeRebaser,
	type RevertibleAlpha,
	type RevisionTag,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import type { SharedTreeChange } from "../../shared-tree/index.js";
import {
	createHistoryCompactionStats,
	type HistoryCompactionPolicy,
} from "../../shared-tree-core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeBranchHistory,
} from "../../simple-tree/index.js";
import { configuredSharedTree, type ISharedTree } from "../../treeFactory.js";
import { TestAnchor } from "../testAnchor.js";
import { StringArray, TestTreeProviderLite } from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

function makeFactory(retainHistory: boolean | number = true) {
	return configuredSharedTree({
		retainHistory,
		minVersionForCollab: "3.14.0",
		jsonValidator: FormatValidatorBasic,
	}).getFactory();
}

const sameGroup: HistoryCompactionPolicy<SharedTreeChange> = (current, target) => {
	const older = flattenCustomMetadata(current.customMetadata);
	const newer = flattenCustomMetadata(target.customMetadata);
	return older?.group !== undefined && older.group === newer?.group;
};

function revisions(history: TreeBranchHistory): string[] {
	const result: string[] = [];
	for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
		result.unshift(commit.revision);
	}
	return result;
}

async function summarize(tree: ISharedTree): Promise<ISummaryTree> {
	const { summary } = await (tree as unknown as IChannel).summarize();
	return summary;
}

async function loadFromSummary(
	summary: ISummaryTree,
	idCompressor: IIdCompressor,
): Promise<ISharedTree> {
	const runtime = new MockFluidDataStoreRuntime({
		idCompressor: deserializeIdCompressor(
			serializeIdCompressor(idCompressor, false),
			createSessionId(),
			SerializationVersion.V3,
		),
	});
	const factory = makeFactory();
	return (await factory.load(
		runtime,
		"loaded",
		{
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary(summary),
		},
		factory.attributes,
	)) as ISharedTree;
}

function generateHistory(count = 5) {
	const provider = new TestTreeProviderLite(2, makeFactory());
	const [tree, peer] = provider.trees;
	const view = asAlpha(tree.viewWith(config));
	view.initialize([]);
	provider.synchronizeMessages();
	const other = peer.viewWith(config);
	for (let index = 0; index < count; index++) {
		view.runTransaction(() => view.root.insertAtEnd(`edit ${index}`), {
			customMetadata: { group: "edits" },
		});
	}
	provider.synchronizeMessages();
	view.root.insertAtEnd("author barrier");
	other.root.insertAtEnd("peer barrier");
	provider.synchronizeMessages();
	return { provider, tree, peer, view, other };
}

describe("Internal history compaction", () => {
	describe("basic edit pairs", () => {
		const scenarios: {
			name: string;
			first: (root: InstanceType<typeof StringArray>) => void;
			second: (root: InstanceType<typeof StringArray>) => void;
			expected: string[];
		}[] = [
			{
				name: "insert then insert",
				first: (root) => root.insertAtEnd("d"),
				second: (root) => root.insertAtEnd("e"),
				expected: ["a", "b", "c", "d", "e"],
			},
			{
				name: "insert then delete the inserted node",
				first: (root) => root.insertAtEnd("d"),
				second: (root) => root.removeAt(3),
				expected: ["a", "b", "c"],
			},
			{
				name: "delete then insert at the same position",
				first: (root) => root.removeAt(0),
				second: (root) => root.insertAtStart("replacement"),
				expected: ["replacement", "b", "c"],
			},
			{
				name: "delete then delete",
				first: (root) => root.removeAt(0),
				second: (root) => root.removeAt(0),
				expected: ["c"],
			},
			{
				name: "move then move",
				first: (root) => root.moveToEnd(0),
				second: (root) => root.moveToStart(1),
				expected: ["c", "b", "a"],
			},
			{
				name: "move then delete the moved node",
				first: (root) => root.moveToEnd(0),
				second: (root) => root.removeAt(2),
				expected: ["b", "c"],
			},
		];

		for (const { name, first, second, expected } of scenarios) {
			for (const mode of ["manual", "summary"] as const) {
				it(`${name}: preserves current and retained states (${mode})`, async () => {
					const provider = new TestTreeProviderLite(2, makeFactory());
					const [tree, peer] = provider.trees;
					const view = asAlpha(tree.viewWith(config));
					view.initialize(["a", "b", "c"]);
					provider.synchronizeMessages();
					const other = peer.viewWith(config);
					const initial = view.branchHistory.getHead()?.revision ?? assert.fail();
					view.runTransaction(() => first(view.root), { customMetadata: { group: "pair" } });
					const removed = view.branchHistory.getHead()?.revision ?? assert.fail();
					view.runTransaction(() => second(view.root), { customMetadata: { group: "pair" } });
					const survivor = view.branchHistory.getHead()?.revision ?? assert.fail();
					assert.deepEqual([...view.root], expected);
					provider.synchronizeMessages();
					view.root.insertAtEnd("author barrier");
					other.root.insertAtEnd("peer barrier");
					provider.synchronizeMessages();
					const before = revisions(view.branchHistory);
					const roots = tree.kernel.checkout.getRemovedRoots();

					if (mode === "manual") {
						assert.equal(tree.kernel.compactHistory(sameGroup), 1);
					} else {
						tree.kernel.setSummaryCompactionPolicy(sameGroup);
					}
					const summary = await summarize(tree);
					assert.deepEqual(
						revisions(view.branchHistory),
						before.filter((r) => r !== removed),
					);
					assert.equal(view.branchHistory.length, before.length - 1);
					assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), roots);
					assert.equal(tree.kernel.compactHistory(sameGroup), 0);

					const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
					const loadedView = asAlpha(loaded.viewWith(config));
					for (const target of [view, loadedView]) {
						assert.deepEqual([...target.root], [...other.root]);
						const reader = target.fork();
						reader.rewindTo(survivor);
						assert.deepEqual([...reader.root], expected);
						reader.dispose();
						const restored = target.fork();
						restored.revertTo(initial);
						assert.deepEqual([...restored.root], ["a", "b", "c"]);
						restored.dispose();
					}
				});
			}
		}
	});

	describe("reader compatibility", () => {
		it("rejects manual and summary compaction before mutation in older-compatible configurations", async () => {
			const factory = configuredSharedTree({
				retainHistory: true,
				minVersionForCollab: FluidClientVersion.v2_117,
			}).getFactory();
			const provider = new TestTreeProviderLite(1, factory);
			const tree = provider.trees[0];
			const view = asAlpha(tree.viewWith(config));
			view.initialize(["a"]);
			view.root.insertAtEnd("b");
			provider.synchronizeMessages();
			const before = revisions(view.branchHistory);
			const policy = () => assert.fail("The incompatible policy must not run");

			assert.throws(() => tree.kernel.compactHistory(policy), /requires minVersionForCollab/);
			assert.throws(
				() => tree.kernel.setSummaryCompactionPolicy(policy),
				/requires minVersionForCollab/,
			);
			assert.deepEqual(revisions(view.branchHistory), before);
			view.root.insertAtEnd("still usable");
			provider.synchronizeMessages();
			await summarize(tree);
			assert.deepEqual([...view.root], ["a", "b", "still usable"]);
		});

		for (const compact of [false, true]) {
			it(`${compact ? "rejects guarded" : "restores older-compatible"} history with the previous reader`, async () => {
				const factory = configuredSharedTree({
					retainHistory: true,
					minVersionForCollab: compact ? "3.14.0" : FluidClientVersion.v2_117,
				}).getFactory();
				const provider = new TestTreeProviderLite(2, factory);
				const [tree, peer] = provider.trees;
				const view = asAlpha(tree.viewWith(config));
				view.initialize(["a", "b", "c"]);
				provider.synchronizeMessages();
				const other = peer.viewWith(config);
				const initial = view.branchHistory.getHead()?.revision ?? assert.fail();
				for (let index = 0; index < 2; index++) {
					view.runTransaction(() => view.root.removeAt(0), {
						customMetadata: { group: "deletions" },
					});
				}
				provider.synchronizeMessages();
				view.root.insertAtEnd("author barrier");
				other.root.insertAtEnd("peer barrier");
				provider.synchronizeMessages();
				if (compact) {
					assert.equal(tree.kernel.compactHistory(sameGroup), 1);
				}
				const summary = await summarize(tree);
				const oldFactory = previousTree
					.configuredSharedTree({
						retainHistory: true,
						minVersionForCollab: FluidClientVersion.v2_117,
					})
					.getFactory();
				const runtime = new MockFluidDataStoreRuntime({
					idCompressor: deserializeIdCompressor(
						serializeIdCompressor(provider.getCompressor(tree), false),
						createSessionId(),
						SerializationVersion.V3,
					),
				});
				const load = async () =>
					oldFactory.load(
						runtime as unknown as Parameters<typeof oldFactory.load>[0],
						"previous",
						{
							deltaConnection: runtime.createDeltaConnection(),
							objectStorage: MockStorage.createFromSummary(summary),
						},
						oldFactory.attributes,
					);
				if (compact) {
					await assert.rejects(load, /Cannot read version 3 of shared tree summary/);
				} else {
					const oldTree = await load();
					const oldSchema = new previousTree.SchemaFactory("com.fluidframework.json");
					const oldView = previousTree.asAlpha(
						oldTree.viewWith(
							new previousTree.TreeViewConfiguration({
								schema: oldSchema.array("array", oldSchema.string),
							}),
						),
					);
					const restored = oldView.fork();
					restored.revertTo(initial);
					assert.deepEqual([...restored.root], ["a", "b", "c"]);
					restored.dispose();
				}
			});
		}

		it("prevents a current reader from downgrading the compacted summary guard", async () => {
			const { provider, tree } = generateHistory(2);
			tree.kernel.compactHistory(sameGroup);
			const summary = await summarize(tree);
			const factory = configuredSharedTree({
				retainHistory: true,
				minVersionForCollab: FluidClientVersion.v2_117,
			}).getFactory();
			const runtime = new MockFluidDataStoreRuntime({
				idCompressor: provider.getCompressor(tree),
			});
			await assert.rejects(
				async () =>
					factory.load(
						runtime,
						"downgrade",
						{
							deltaConnection: runtime.createDeltaConnection(),
							objectStorage: MockStorage.createFromSummary(summary),
						},
						factory.attributes,
					),
				/requires minVersionForCollab/,
			);

			const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
			loaded.kernel.setSummaryCompactionPolicy(undefined);
			const reloaded = await loadFromSummary(
				await summarize(loaded),
				provider.getCompressor(tree),
			);
			assert.deepEqual(
				revisions(reloaded.kernel.checkout.branchHistory),
				revisions(tree.kernel.checkout.branchHistory),
			);
		});
	});

	describe("collaboration", () => {
		for (const reconnect of [false, true]) {
			it(`matches uncompacted execution with ${reconnect ? "offline" : "pending"} local edits and a concurrent peer move`, () => {
				const results: string[][] = [];
				for (const compact of [false, true]) {
					const { provider, tree, view, other } = generateHistory(3);
					const barriers = [...view.root].slice(3);
					if (reconnect) {
						tree.containerRuntime.connected = false;
					}
					view.root.removeAt(1);
					const pendingRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
					other.root.moveToStart(2);
					const before = revisions(view.branchHistory);

					if (compact) {
						const stats = createHistoryCompactionStats();
						assert.equal(tree.kernel.compactHistory(sameGroup, undefined, stats), 2);
						assert.equal(stats.unsequencedCommitCount, 1);
						assert.equal(view.branchHistory.getHead()?.revision, pendingRevision);
						assert.equal(view.branchHistory.length, before.length - 2);
					}
					if (reconnect) {
						provider.synchronizeMessages();
						tree.containerRuntime.connected = true;
					}
					provider.synchronizeMessages();
					assert.deepEqual([...view.root], ["edit 2", "edit 0", ...barriers]);
					assert.deepEqual([...view.root], [...other.root]);
					assert(revisions(view.branchHistory).includes(pendingRevision));
					other.root.insertAtEnd("after acknowledgement");
					provider.synchronizeMessages();
					assert.deepEqual([...view.root], [...other.root]);
					results.push([...view.root]);
				}
				assert.deepEqual(results[1], results[0]);
			});
		}
	});

	it("compacts through GC traversal and stops invoking a disabled summary policy", async () => {
		const { provider, tree, view } = generateHistory(3);
		const before = revisions(view.branchHistory);
		let calls = 0;
		tree.kernel.setSummaryCompactionPolicy((...args) => {
			calls++;
			return sameGroup(...args);
		});

		tree.getGCData();
		assert(calls > 0);
		assert.equal(view.branchHistory.length, before.length - 2);
		const after = revisions(view.branchHistory);
		tree.kernel.setSummaryCompactionPolicy(undefined);
		const previousCalls = calls;
		tree.getGCData();
		const summary = await summarize(tree);
		assert.equal(calls, previousCalls);
		assert.deepEqual(revisions(view.branchHistory), after);
		const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
		assert.deepEqual([...loaded.viewWith(config).root], [...view.root]);
	});

	describe("seeded differential histories", () => {
		for (const seed of [0, 1, 2, 3, 4, 5]) {
			it(`matches an uncompacted control through repeated edit/compact/reload cycles (seed ${seed})`, async () => {
				const random = makeRandom(seed);
				const fixtures = [false, true].map((compact) => {
					const provider = new TestTreeProviderLite(2, makeFactory());
					const [tree, peer] = provider.trees;
					const view = asAlpha(tree.viewWith(config));
					view.initialize([]);
					provider.synchronizeMessages();
					const other = asAlpha(peer.viewWith(config));
					const initial = view.branchHistory.getHead()?.revision ?? assert.fail();
					return { compact, provider, tree, view, other, initial };
				});
				const expected: string[] = [];
				for (let cycle = 0; cycle < 4; cycle++) {
					for (let step = 0; step < 8; step++) {
						const operation = expected.length < 2 ? 0 : random.integer(0, 2);
						const index = expected.length === 0 ? 0 : random.integer(0, expected.length - 1);
						const value = `${seed}:${cycle}:${step}`;
						for (const { provider, view, other } of fixtures) {
							const author = step % 2 === 0 ? view : other;
							author.runTransaction(
								() => {
									switch (operation) {
										case 0: {
											author.root.insertAtEnd(value);
											break;
										}
										case 1: {
											author.root.removeAt(index);
											break;
										}
										case 2: {
											author.root.moveToEnd(0);
											break;
										}
										default: {
											assert.fail();
										}
									}
								},
								{ customMetadata: { group: `cycle ${cycle}` } },
							);
							provider.synchronizeMessages();
						}
						if (operation === 0) {
							expected.push(value);
						} else if (operation === 1) {
							expected.splice(index, 1);
						} else {
							expected.push(expected.shift() ?? assert.fail());
						}
						for (const { view, other } of fixtures) {
							assert.deepEqual([...view.root], expected);
							assert.deepEqual([...other.root], expected);
						}
					}
					const retainedState = [...expected];
					for (const { compact, provider, tree, view, other, initial } of fixtures) {
						const survivor = view.branchHistory.getHead()?.revision ?? assert.fail();
						view.root.insertAtEnd(`author barrier ${cycle}`);
						provider.synchronizeMessages();
						other.root.insertAtEnd(`peer barrier ${cycle}`);
						provider.synchronizeMessages();
						const before = view.branchHistory.length;
						if (compact) {
							assert.equal(tree.kernel.compactHistory(sameGroup), 7);
							assert.equal(view.branchHistory.length, before - 7);
						}
						const summary = await summarize(tree);
						const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
						const loadedView = asAlpha(loaded.viewWith(config));
						assert.deepEqual([...loadedView.root], [...view.root]);
						assert.deepEqual(
							revisions(loadedView.branchHistory),
							revisions(view.branchHistory),
						);
						const reader = loadedView.fork();
						reader.rewindTo(survivor);
						assert.deepEqual([...reader.root], retainedState);
						reader.dispose();
						const restored = loadedView.fork();
						assert.doesNotThrow(
							() => restored.revertTo(initial),
							`Restore after cycle ${cycle}, compacted: ${compact}`,
						);
						assert.deepEqual([...restored.root], []);
						restored.dispose();
					}
					expected.push(`author barrier ${cycle}`, `peer barrier ${cycle}`);
				}
			});
		}
	});

	for (const compact of [false, true]) {
		it(`${compact ? "rejects a stale" : "accepts a current"} captured revertTo callback`, () => {
			const { provider, tree, view, other } = generateHistory(2);
			let initial = view.branchHistory.getHead();
			while (initial?.getParent() !== undefined) {
				initial = initial.getParent();
			}
			assert(initial !== undefined);
			const revert = initial.revertTo ?? assert.fail();
			if (compact) {
				assert.equal(tree.kernel.compactHistory(sameGroup), 1);
				const content = [...view.root];
				assert.throws(() => revert(), UsageError);
				assert.deepEqual([...view.root], content);
				(initial.revertTo ?? assert.fail())();
			} else {
				revert();
			}
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], []);
			assert.deepEqual([...other.root], []);
			view.root.insertAtEnd("after restore");
			provider.synchronizeMessages();
			assert.deepEqual([...other.root], ["after restore"]);
		});
	}

	for (const mode of ["manual", "summary"] as const) {
		it(`preserves rewind, restore and existing Undo after ${mode} compaction and reload`, async () => {
			const provider = new TestTreeProviderLite(2, makeFactory());
			const [tree, peer] = provider.trees;
			const view = asAlpha(tree.viewWith(config));
			view.initialize(["a", "b", "c"]);
			provider.synchronizeMessages();
			const other = peer.viewWith(config);
			const initialRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
			for (let index = 0; index < 2; index++) {
				view.runTransaction(() => view.root.removeAt(0), {
					customMetadata: { group: "deletions" },
				});
			}
			const survivorRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
			view.root.insertAtEnd("x");
			const preview = view.fork();
			let undo: RevertibleAlpha | undefined;
			const offUndo = view.events.on("changed", (_data, getRevertible) => {
				undo = getRevertible?.();
			});
			view.root.removeAt(0);
			offUndo();
			assert(undo !== undefined);
			view.root.insertAtEnd("y");
			provider.synchronizeMessages();
			view.root.insertAtEnd("author barrier");
			other.root.insertAtEnd("peer barrier");
			provider.synchronizeMessages();
			const content = [...view.root];
			const before = revisions(view.branchHistory).length;
			const roots = tree.kernel.checkout.getRemovedRoots();
			if (mode === "manual") {
				assert.equal(tree.kernel.compactHistory(sameGroup), 1);
			} else {
				tree.kernel.setSummaryCompactionPolicy(sameGroup);
			}
			const summary = await summarize(tree);
			assert.equal(revisions(view.branchHistory).length, before - 1);
			assert.deepEqual([...view.root], content);
			assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), roots);
			const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
			const loadedView = asAlpha(loaded.viewWith(config));
			assert.deepEqual(revisions(loadedView.branchHistory), revisions(view.branchHistory));
			for (const target of [view, loadedView]) {
				for (const [revision, expected] of [
					[initialRevision, ["a", "b", "c"]],
					[survivorRevision, ["c"]],
				] as const) {
					const reader = target.fork();
					reader.rewindTo(revision);
					assert.deepEqual([...reader.root], expected);
					reader.dispose();
				}
				const restored = target.fork();
				restored.revertTo(initialRevision);
				assert.deepEqual([...restored.root], ["a", "b", "c"]);
				restored.dispose();
			}
			assert.deepEqual([...preview.root], ["c", "x"]);
			preview.rewindTo(initialRevision);
			assert.deepEqual([...preview.root], ["a", "b", "c"]);
			preview.dispose();
			let redo: RevertibleAlpha | undefined;
			const offRedo = view.events.on("changed", (_data, getRevertible) => {
				redo = getRevertible?.();
			});
			undo.revert();
			offRedo();
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], ["c", ...content]);
			assert.deepEqual([...other.root], [...view.root]);
			assert(redo !== undefined);
			redo.revert();
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], content);
			assert.deepEqual([...other.root], content);
			view.revertTo(initialRevision);
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], ["a", "b", "c"]);
			assert.deepEqual([...other.root], ["a", "b", "c"]);
		});
	}

	it("releases repair roots from composed-away revisions when the surviving history is trimmed", () => {
		const provider = new TestTreeProviderLite(2, makeFactory(6));
		const [tree, peer] = provider.trees;
		const view = asAlpha(tree.viewWith(config));
		view.initialize(["a", "b", "c"]);
		provider.synchronizeMessages();
		const other = peer.viewWith(config);
		const anchor = TestAnchor.fromValue(tree.kernel.checkout.forest, "a");
		for (let index = 0; index < 2; index++) {
			view.runTransaction(() => view.root.removeAt(0), {
				customMetadata: { group: "deletions" },
			});
		}
		provider.synchronizeMessages();
		view.root.insertAtEnd("author barrier");
		other.root.insertAtEnd("peer barrier");
		provider.synchronizeMessages();
		assert.equal(tree.kernel.compactHistory(sameGroup), 1);
		assert.equal(tree.kernel.checkout.getRemovedRoots().length, 2);
		assert.equal(anchor.treeStatus, TreeStatus.Removed);
		for (let index = 0; index < 10; index++) {
			view.root.insertAtEnd(`author ${index}`);
			provider.synchronizeMessages();
			other.root.insertAtEnd(`peer ${index}`);
			provider.synchronizeMessages();
		}
		assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), []);
		assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
		assert.equal(anchor.treeStatus, TreeStatus.Deleted);
	});

	for (const location of ["main", "fork"] as const) {
		for (const result of ["commit", "abort", "nested abort", "outer abort"] as const) {
			it(`preserves repair cleanup across ${result} on a ${location} checkout`, async () => {
				const provider = new TestTreeProviderLite(2, makeFactory(8));
				const [tree, peer] = provider.trees;
				const view = asAlpha(tree.viewWith(config));
				view.initialize(["a", "b", "c", "d"]);
				provider.synchronizeMessages();
				const other = peer.viewWith(config);
				for (let index = 0; index < 3; index++) {
					view.runTransaction(() => view.root.removeAt(0), {
						customMetadata: { group: "deletions" },
					});
				}
				provider.synchronizeMessages();
				view.root.insertAtEnd("author barrier");
				other.root.insertAtEnd("peer barrier");
				provider.synchronizeMessages();
				const checkout =
					location === "main" ? tree.kernel.checkout : tree.kernel.checkout.fork();
				const checkoutView = location === "main" ? view : checkout.viewWith(config);
				const content = [...checkoutView.root];
				const roots = checkout.getRemovedRoots();
				const before = revisions(checkout.branchHistory);
				checkout.transaction.start();
				if (result === "nested abort" || result === "outer abort") {
					checkout.transaction.start();
				}
				checkoutView.root.insertAtEnd("transaction edit");

				// A separate fork may have an open transaction while the main tree summarizes.
				if (location === "fork") {
					tree.kernel.setSummaryCompactionPolicy(sameGroup);
					await summarize(tree);
					tree.kernel.setSummaryCompactionPolicy(undefined);
				} else {
					assert.equal(tree.kernel.compactHistory(sameGroup), 2);
				}
				if (result === "commit") {
					checkout.transaction.commit();
				} else if (result === "outer abort") {
					checkout.transaction.commit();
					checkout.transaction.abort();
				} else {
					checkout.transaction.abort();
					if (result === "nested abort") {
						checkout.transaction.commit();
					}
				}

				assert.equal(
					revisions(checkout.branchHistory).length,
					before.length - 2 + (result === "commit" ? 1 : 0),
				);
				assert.deepEqual(
					[...checkoutView.root],
					result === "commit" ? [...content, "transaction edit"] : content,
				);
				assert.deepEqual(checkout.getRemovedRoots(), roots, "Repair identities stay intact");
				for (let index = 0; index < 10; index++) {
					view.root.insertAtEnd(`author ${index}`);
					provider.synchronizeMessages();
					other.root.insertAtEnd(`peer ${index}`);
					provider.synchronizeMessages();
					if (location === "fork") {
						checkout.rebaseOnto(tree.kernel.checkout);
					}
				}
				assert.deepEqual(checkout.getRemovedRoots(), []);
				assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), []);
				assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
				assert.deepEqual([...view.root], [...other.root]);
				if (location === "fork") {
					checkout.dispose();
				}
			});
		}
	}

	describe("mixed-edit summary round-trip", () => {
		const sf = new SchemaFactory("internal-history-compaction");
		class Item extends sf.object("Item", {
			value: sf.number,
			children: sf.array(sf.string),
		}) {}
		class Document extends sf.object("Document", {
			left: sf.array(Item),
			right: sf.array(Item),
		}) {}
		const configuration = new TreeViewConfiguration({ schema: Document });
		const readContent = (root: Document) => ({
			left: root.left.map((item) => ({ value: item.value, children: [...item.children] })),
			right: root.right.map((item) => ({ value: item.value, children: [...item.children] })),
		});

		for (const count of [42, 49]) {
			for (const mode of ["uncompacted", "manual", "summary"] as const) {
				it(`round-trips ${count / 7} insert/move/nested-edit/delete cycles (${mode})`, async () => {
					const previous = RebaseValidation.currentLevel;
					try {
						const provider = new TestTreeProviderLite(2, makeFactory());
						const [tree, peer] = provider.trees;
						const view = asAlpha(tree.viewWith(configuration));
						view.initialize({ left: [], right: [] });
						provider.synchronizeMessages();
						const other = peer.viewWith(configuration);
						const initial = view.branchHistory.getHead()?.revision ?? assert.fail();
						const original = readContent(view.root);
						const editRevisions: string[] = [];
						for (let index = 0; index < count; index++) {
							view.runTransaction(
								() => {
									const { left, right } = view.root;
									switch (index % 7) {
										case 0:
										case 1: {
											left.insertAtEnd({ value: index, children: [`child ${index}`] });
											break;
										}
										case 2: {
											right.moveToEnd(0, left);
											break;
										}
										case 3: {
											right[0].children.insertAtEnd(`nested ${index}`);
											break;
										}
										case 4: {
											left[0].value = index;
											break;
										}
										case 5: {
											left.moveToEnd(0, right);
											break;
										}
										case 6: {
											left.removeAt(0);
											break;
										}
										default: {
											assert.fail();
										}
									}
								},
								{ customMetadata: { group: "mixed" } },
							);
							editRevisions.push(view.branchHistory.getHead()?.revision ?? assert.fail());
						}
						const survivor = editRevisions.at(-1) ?? assert.fail();
						const retainedContent = readContent(view.root);
						provider.synchronizeMessages();
						view.root.left.insertAtEnd({ value: count, children: [] });
						other.root.right.insertAtEnd({ value: count + 1, children: [] });
						provider.synchronizeMessages();
						const content = readContent(view.root);
						const before = revisions(view.branchHistory);
						RebaseValidation.setLevel(RebaseValidation.Level.Strict);
						if (mode === "manual") {
							assert.equal(tree.kernel.compactHistory(sameGroup), count - 1);
						} else if (mode === "summary") {
							tree.kernel.setSummaryCompactionPolicy(sameGroup);
						}
						const summary = await summarize(tree);
						const removed = mode === "uncompacted" ? [] : editRevisions.slice(0, -1);
						const expected = before.filter((revision) => !removed.includes(revision));
						assert.deepEqual(revisions(view.branchHistory), expected);
						const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
						const loadedView = asAlpha(loaded.viewWith(configuration));
						assert.deepEqual(revisions(loadedView.branchHistory), expected);
						for (const target of [view, loadedView]) {
							assert.deepEqual(readContent(target.root), content);
							for (const [revision, state] of [
								[initial, original],
								[survivor, retainedContent],
							] as const) {
								const reader = target.fork();
								reader.rewindTo(revision);
								assert.deepEqual(readContent(reader.root), state);
								reader.dispose();
							}
							const restored = target.fork();
							restored.revertTo(initial);
							assert.deepEqual(readContent(restored.root), original);
							restored.dispose();
						}
					} finally {
						RebaseValidation.setLevel(previous);
					}
				});
			}
		}
	});

	describe("engine failure isolation", () => {
		interface Engine {
			readonly changeFamily: { readonly rebaser: ChangeRebaser<SharedTreeChange> };
			validateComposedChange: (
				change: SharedTreeChange,
				revision: RevisionTag,
				...rest: unknown[]
			) => void;
		}

		for (const mode of ["manual", "summary"] as const) {
			for (const stage of ["compose", "validate"] as const) {
				it(`isolates ${stage} failures in a ${mode} pass and does not retry failed pairs`, async () => {
					const { provider, tree, view, other } = generateHistory(3);
					const kernel = tree.kernel as unknown as Engine;
					let target = tree.kernel.checkout.getLocationHead();
					for (let index = 0; index < 2; index++) {
						target = target.parent ?? assert.fail();
					}
					const failingRevision = target.revision;
					let failures = 0;
					if (stage === "compose") {
						const compose = kernel.changeFamily.rebaser.compose.bind(
							kernel.changeFamily.rebaser,
						);
						kernel.changeFamily.rebaser.compose = (changes) => {
							if (changes.length === 2 && changes[1].revision === failingRevision) {
								failures++;
								throw new Error("injected composition failure");
							}
							return compose(changes);
						};
					} else {
						const validate = kernel.validateComposedChange;
						kernel.validateComposedChange = (change, revision, ...rest) => {
							if (revision === failingRevision) {
								failures++;
								throw new Error("injected validation failure");
							}
							validate(change, revision, ...rest);
						};
					}
					const before = revisions(view.branchHistory).length;
					const content = [...view.root];
					const run = async () => {
						if (mode === "manual") {
							const stats = createHistoryCompactionStats();
							const removed = tree.kernel.compactHistory(sameGroup, undefined, stats);
							return { summary: await summarize(tree), removed, stats };
						}
						tree.kernel.setSummaryCompactionPolicy(sameGroup);
						return { summary: await summarize(tree) };
					};
					const result = await run();
					assert.equal(failures, 1);
					assert.equal(revisions(view.branchHistory).length, before - 1);
					if ("stats" in result) {
						assert.equal(result.removed, 1);
						assert.equal(result.stats.failedPairCount, 1);
					} else {
						assert(
							provider.logger
								.events()
								.some(
									(event) =>
										event.eventName.endsWith("HistoryCompaction") &&
										event.status === "partialFailure" &&
										event.failedPairCount === 1,
								),
						);
					}
					const repeated = await run();
					assert.equal(failures, 1);
					if ("stats" in repeated) {
						assert.equal(repeated.removed, 0);
						assert.equal(repeated.stats.skippedFailedPairCount, 1);
					} else {
						assert(
							provider.logger
								.events()
								.some(
									(event) =>
										event.eventName.endsWith("HistoryCompaction") &&
										event.skippedFailedPairCount === 1,
								),
						);
					}
					const loaded = await loadFromSummary(result.summary, provider.getCompressor(tree));
					assert.deepEqual([...loaded.viewWith(config).root], content);
					assert.deepEqual(
						revisions(loaded.kernel.checkout.branchHistory),
						revisions(view.branchHistory),
					);
					view.root.insertAtEnd("still editable");
					other.root.insertAtEnd("peer edit");
					provider.synchronizeMessages();
					assert.deepEqual([...view.root], [...other.root]);
				});
			}
		}

		it("validates every composed change against the summary codec", () => {
			const { tree } = generateHistory();
			const kernel = tree.kernel as unknown as Engine;
			const validate = kernel.validateComposedChange;
			let validated = 0;
			kernel.validateComposedChange = (...args) => {
				validated++;
				validate(...args);
			};
			assert.equal(tree.kernel.compactHistory(sameGroup), 4);
			assert.equal(validated, 4);
		});

		it("continues with later pairs after a validation failure", async () => {
			const { provider, tree, view } = generateHistory();
			const kernel = tree.kernel as unknown as Engine;
			const validate = kernel.validateComposedChange;
			let calls = 0;
			kernel.validateComposedChange = (...args) => {
				if (++calls === 2) {
					throw new Error("injected validation failure");
				}
				validate(...args);
			};
			const stats = createHistoryCompactionStats();
			assert.equal(tree.kernel.compactHistory(sameGroup, undefined, stats), 3);
			assert.equal(calls, 4);
			assert.equal(stats.failedPairCount, 1);
			const summary = await summarize(tree);
			const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
			assert.deepEqual(
				revisions(loaded.kernel.checkout.branchHistory),
				revisions(view.branchHistory),
			);
			assert.deepEqual([...loaded.viewWith(config).root], [...view.root]);
		});

		it("keeps summaries loadable after a policy failure without logging application errors", async () => {
			const { provider, tree, view, other } = generateHistory();
			let calls = 0;
			tree.kernel.setSummaryCompactionPolicy((current, target) => {
				if (++calls === 3) {
					throw new Error("private application error");
				}
				return sameGroup(current, target);
			});
			const before = revisions(view.branchHistory).length;
			const summary = await summarize(tree);
			assert.equal(calls, 3);
			assert.equal(revisions(view.branchHistory).length, before - 1);
			const event = provider.logger
				.events()
				.find(
					(logged) =>
						logged.eventName.endsWith("HistoryCompaction") && logged.status === "failure",
				);
			assert(event !== undefined);
			assert.equal(event.failureSource, "policy");
			assert(!JSON.stringify(event).includes("private application error"));
			const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
			assert.deepEqual([...loaded.viewWith(config).root], [...view.root]);
			tree.kernel.setSummaryCompactionPolicy(undefined);
			view.root.insertAtEnd("after failure");
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], [...other.root]);
			await summarize(tree);
		});
	});

	it("does not compact summaries unless an internal policy is configured", async () => {
		const { provider, tree, peer, view } = generateHistory();
		const before = revisions(view.branchHistory);
		const summary = await summarize(tree);
		assert.deepEqual(revisions(view.branchHistory), before);
		tree.kernel.setSummaryCompactionPolicy(sameGroup);
		const compacted = await summarize(tree);
		assert.equal(revisions(view.branchHistory).length, before.length - 4);
		assert.deepEqual(revisions(peer.kernel.checkout.branchHistory), before);
		const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
		const compactedLoader = await loadFromSummary(compacted, provider.getCompressor(tree));
		assert.equal(revisions(loaded.kernel.checkout.branchHistory).length, before.length);
		assert.equal(
			revisions(compactedLoader.kernel.checkout.branchHistory).length,
			before.length - 4,
		);
	});
});
