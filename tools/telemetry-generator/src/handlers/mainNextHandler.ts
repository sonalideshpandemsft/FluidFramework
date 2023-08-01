/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** Interface to make it easier to parse json returned from the timeline REST API */
interface ParsedJob {
	stageName: string;
	commitId: string;
	unmergedCommitCount: number;
}

module.exports = function handler(fileData, logger) {
	// - fileData is a JSON object obtained by calling JSON.parse() on the contents of a file.
	// In this particular handler, we are using the timeline REST API to retrieve the status of the pipeline:
	// Ex. https://dev.azure.com/fluidframework/internal/_apis/build/builds/<buildId>/timeline?api-version=6.0-preview.1
	// - logger is an ITelemetryBufferedLogger. Call its send() method to write the output telemetry
	//   events.
	if (fileData.records?.length === undefined || fileData.records?.length === 0) {
		console.log(`could not locate records info`);
	}
	if (process.env.BUILD_ID !== undefined) {
		console.log("BUILD_ID", process.env.BUILD_ID);
	} else {
		console.log("BUILD_ID not defined.");
	}

	// Note: type == "Task" would include tasks from the stages in the result set. It might be interesting in the future - for now we will only collect stages.
	const parsedJobs: ParsedJob[] = fileData.records
		.filter((job) => job.type === "Stage")
		.map((job) => {
			return {
				stageName: job.name,
				commitId: job.commitId,
				count: job.unmergedCommitCount,
			}
		});

	for (const job of parsedJobs) {
		// Hardcoding the last stage name for now as it will need to be bypassed (still in Progress).
		if (job.stageName === "runAfterAll") {
			continue;
		}
		logger.send({
			category: "performance",
			eventName: "StageTiming",
			benchmarkType: "PipelineInfo",
			stageName: job.stageName,
		});
	}
};
