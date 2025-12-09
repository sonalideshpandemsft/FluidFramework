/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	createDDSFuzzSuite,
	registerOracle,
	type DDSFuzzHarnessEvents,
	type DDSFuzzSuiteOptions,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	attachTreeOracle,
	deterministicIdCompressorFactory,
	failureDirectory,
	hasSharedTreeOracle,
	type ISharedTreeWithOracle,
} from "./fuzzUtils.js";
import { baseTreeModel } from "./baseModel.js";

const oracleEmitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

oracleEmitter.on("clientCreate", (client) => {
	const tree = client.channel as ISharedTreeWithOracle;
	attachTreeOracle(tree);

	// Register oracle for proper disposal after tests
	if (hasSharedTreeOracle(tree) && tree.sharedTreeOracle !== undefined) {
		registerOracle(tree.sharedTreeOracle);
	}
});

describe("Fuzz - Event Oracle Tests", () => {
	const runsPerBatch = 50;

	describe("nodeChanged Events", () => {
		const options: Partial<DDSFuzzSuiteOptions> = {
			emitter: oracleEmitter,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
			},
			defaultTestCount: runsPerBatch,
			reconnectProbability: 0.5,
			saveFailures: {
				directory: failureDirectory,
			},
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
				// AB#43127: fully allowing rehydrate after attach is currently not supported in tests (but should be in prod) due to limitations in the test mocks.
				attachingBeforeRehydrateDisable: true,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			validationStrategy: { type: "fixedInterval", interval: 10 },
		};

		createDDSFuzzSuite(baseTreeModel, options);
	});
});
