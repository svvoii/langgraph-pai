import type { FsStore } from "./fsStore.js";

function countByPrefix(events: string[], prefix: string): number {
  return events.filter((line) => line.includes(prefix)).length;
}

export async function synthesizeLearningForWork(
  store: FsStore,
  workId: string,
): Promise<string> {
  const events = await store.readEventLines(workId);

  if (events.length === 0) {
    const emptySummary = [
      `# Learning Summary ${workId}`,
      "",
      "No events found for this work item.",
    ].join("\n");
    await store.writeLearningSummary(workId, emptySummary);
    return emptySummary;
  }

  const preTool = countByPrefix(events, "pre_tool");
  const postTool = countByPrefix(events, "post_tool");
  const start = countByPrefix(events, "session_start");
  const stop = countByPrefix(events, "stop summary=");
  const blocked = countByPrefix(events, "blocked");

  const summary = [
    `# Learning Summary ${workId}`,
    "",
    "## Signals",
    `- Session starts: ${start}`,
    `- Pre-tool checks: ${preTool}`,
    `- Post-tool events: ${postTool}`,
    `- Stop events: ${stop}`,
    `- Blocked indicators: ${blocked}`,
    "",
    "## Recommendations",
    "- Expand signal capture with explicit rating events.",
    "- Track phase durations for plateau and bottleneck analysis.",
    "- Record verification failures with criterion ids.",
  ].join("\n");

  await store.writeLearningSummary(workId, summary);
  return summary;
}
