/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkIt, ValueType, type CollectedData } from "@fluid-tools/benchmark";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions/internal";

import { asAlpha } from "../../api.js";
import { flattenCustomMetadata } from "../../core/index.js";
import {
	createHistoryCompactionStats,
	type HistoryCompactionPolicy,
} from "../../shared-tree-core/index.js";
import type { SharedTreeChange } from "../../shared-tree/index.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import type { ISharedTree } from "../../treeFactory.js";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	configureBenchmarkHooks,
} from "../utils.js";

const sf = new SchemaFactory("history-compaction-savings");
class Document extends sf.object("Document", {
	value: sf.number,
	barrier: sf.number,
	items: sf.array(sf.string),
}) {}
const configuration = new TreeViewConfiguration({ schema: Document });
type Workload = "overwrites" | "inserts" | "deletions" | "moves" | "metadata";

/**
 * Measures full DDS blob payloads, not handles, JSON wrapper overhead, or container-wide metadata.
 */
function summaryBytes(summary: ISummaryTree): { total: number; history: number } {
	let total = 0;
	let history = 0;
	for (const [key, entry] of Object.entries(summary.tree)) {
		if (entry.type === SummaryType.Tree) {
			const child = summaryBytes(entry);
			total += child.total;
			history += key === "EditManager" ? child.total : child.history;
		} else {
			assert.equal(entry.type, SummaryType.Blob, "Measurements require a full blob snapshot");
			if (entry.type === SummaryType.Blob) {
				total +=
					typeof entry.content === "string"
						? Buffer.byteLength(entry.content, "utf8")
						: entry.content.byteLength;
			}
		}
	}
	return { total, history };
}

/**
 * Runs a workload on real local-service containers for both compaction locations.
 * Each run measures its own uncompacted baseline, then checks summary reload and further collaboration.
 */
async function measureSavings(
	mode: "local" | "summarizer",
	edits: number,
	workload: Workload,
): Promise<CollectedData> {
	const loadedTrees: ISharedTree[] = [];
	const factory = SharedTreeTestFactory.build(
		() => {},
		(tree) => loadedTrees.push(tree),
		{ retainHistory: true, minVersionForCollab: "3.14.0" },
	);
	const provider = await TestTreeProvider.create(2, SummarizeType.onDemand, factory);
	try {
		const [author, peer] = provider.trees;
		const view = asAlpha(author.viewWith(configuration));
		const initialItems =
			workload === "deletions"
				? Array.from({ length: edits + 1 }, (_, index) => `item ${index}`)
				: workload === "moves"
					? ["a", "b", "c", "d"]
					: [];
		view.initialize({ value: 0, barrier: 0, items: initialItems });
		await provider.ensureSynchronized();
		const other = peer.viewWith(configuration);
		// Load the dedicated summarizer before the measured workload, with compaction disabled.
		await provider.summarize();
		const summarizerTrees = loadedTrees.filter((tree) => !provider.trees.includes(tree));
		assert.equal(summarizerTrees.length, 1);
		const summarizerTree = summarizerTrees[0];
		const target = mode === "local" ? author : summarizerTree;

		for (let index = 1; index <= edits; index++) {
			view.runTransaction(
				() => {
					switch (workload) {
						case "overwrites":
						case "metadata": {
							view.root.value = index;
							break;
						}
						case "inserts": {
							view.root.items.insertAtEnd(`item ${index}`);
							break;
						}
						case "deletions": {
							view.root.items.removeAt(0);
							break;
						}
						case "moves": {
							view.root.items.moveToEnd(0);
							break;
						}
						default: {
							assert.fail();
						}
					}
				},
				{
					customMetadata:
						workload === "metadata"
							? { group: workload, detail: "metadata".repeat(128) }
							: { group: workload },
				},
			);
		}
		await provider.ensureSynchronized();
		const workloadSequenceNumber = provider.containers[0].deltaManager.lastSequenceNumber;
		// The summarizer also participates in the service's collaboration window.
		// An uncompacted summary advances its reference sequence number.
		await provider.summarize();
		await provider.ensureSynchronized();
		for (let attempt = 0; attempt < 10; attempt++) {
			view.root.barrier++;
			await provider.ensureSynchronized();
			other.root.barrier++;
			await provider.ensureSynchronized();
			if (
				provider.containers[0].deltaManager.minimumSequenceNumber >= workloadSequenceNumber
			) {
				break;
			}
		}
		assert(
			provider.containers[0].deltaManager.minimumSequenceNumber >= workloadSequenceNumber,
			"The workload must leave the collaboration window before measurement",
		);
		const history = target.kernel.checkout.branchHistory;
		const beforeCount = history.length;
		const beforeSummary = await target.summarize(true);
		const before = summaryBytes(beforeSummary.summary);
		assert(before.history > 0);
		const policy: HistoryCompactionPolicy<SharedTreeChange> = (current, next) =>
			flattenCustomMetadata(current.customMetadata)?.group === workload &&
			flattenCustomMetadata(next.customMetadata)?.group === workload;

		const start = performance.now();
		if (mode === "local") {
			const stats = createHistoryCompactionStats();
			let failure: unknown;
			const removed = target.kernel.compactHistory(policy, undefined, stats, (error) => {
				failure = error;
			});
			assert.equal(removed, edits - 1, `${JSON.stringify(stats)} ${String(failure)}`);
		} else {
			target.kernel.setSummaryCompactionPolicy(policy);
		}
		const localCompactionMs = performance.now() - start;
		const summaryStart = performance.now();
		await provider.summarize();
		const serviceSummaryMs = performance.now() - summaryStart;
		target.kernel.setSummaryCompactionPolicy(undefined);
		const afterSummary = await target.summarize(true);
		const after = summaryBytes(afterSummary.summary);
		assert.equal(history.length, beforeCount - (edits - 1));
		if (workload === "overwrites") {
			assert(after.history < before.history, "Overwrite history payload must shrink");
			assert(after.total < before.total, "Overwrite DDS payload must shrink");
		}
		const untouched = mode === "local" ? summarizerTree : author;
		assert.equal(untouched.kernel.checkout.branchHistory.length, beforeCount);

		const loaded = await provider.createTree();
		const loadedView = asAlpha(loaded.viewWith(configuration));
		const finalValue = workload === "overwrites" || workload === "metadata" ? edits : 0;
		assert.equal(loadedView.root.value, finalValue);
		assert.deepEqual([...loadedView.root.items], [...view.root.items]);
		assert.equal(
			loadedView.branchHistory.length,
			mode === "summarizer" ? history.length : beforeCount,
		);
		const restored = loadedView.fork();
		let initial = restored.branchHistory.getHead();
		while (initial?.getParent() !== undefined) {
			initial = initial.getParent();
		}
		assert(initial !== undefined);
		restored.revertTo(initial.revision);
		assert.equal(restored.root.value, 0);
		assert.deepEqual([...restored.root.items], initialItems);
		restored.dispose();
		loadedView.root.value++;
		await provider.ensureSynchronized();
		assert.equal(view.root.value, finalValue + 1);
		assert.equal(other.root.value, finalValue + 1);
		await provider.summarize();
		const reloaded = await provider.createTree();
		const reloadedView = reloaded.viewWith(configuration);
		assert.equal(reloadedView.root.value, finalValue + 1);
		assert.deepEqual([...reloadedView.root.items], [...view.root.items]);

		return [
			{
				name: "historyBytesSaved",
				value: before.history - after.history,
				units: "bytes",
				type: ValueType.LargerIsBetter,
				significance: "Primary",
			},
			{ name: "historyBytesBefore", value: before.history, units: "bytes" },
			{ name: "historyBytesAfter", value: after.history, units: "bytes" },
			{
				name: "historySavingsPercent",
				value: 100 * (1 - after.history / before.history),
				units: "%",
			},
			{ name: "ddsBytesBefore", value: before.total, units: "bytes" },
			{ name: "ddsBytesAfter", value: after.total, units: "bytes" },
			{ name: "ddsBytesSaved", value: before.total - after.total, units: "bytes" },
			{ name: "commitsBefore", value: beforeCount, units: "count" },
			{ name: "commitsAfter", value: beforeCount - (edits - 1), units: "count" },
			{ name: "serviceSummaryMs", value: serviceSummaryMs, units: "ms" },
			...(mode === "local"
				? [{ name: "localCompactionMs", value: localCompactionMs, units: "ms" }]
				: []),
		];
	} finally {
		provider.reset();
	}
}

describe("History compaction end-to-end savings", () => {
	configureBenchmarkHooks();
	for (const workload of [
		"overwrites",
		"inserts",
		"deletions",
		"moves",
		"metadata",
	] as const) {
		for (const edits of workload === "overwrites" ? [100, 500] : [100]) {
			for (const mode of ["local", "summarizer"] as const) {
				benchmarkIt({
					title: `${mode} compaction of ${edits} ${workload}`,
					run: async () => measureSavings(mode, edits, workload),
				}).timeout(60000);
			}
		}
	}
});
