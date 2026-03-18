import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import type { Criterion, Mode } from "./types.js";

export interface LlmPhaseInput {
    phase: "think" | "plan";
    request: string;
    mode: Mode;
    iteration: number;
    criteria: Criterion[];
}

export interface LlmAdapter {
    completePhase(input: LlmPhaseInput): Promise<string>;
}

class OpenAiLlmAdapter implements LlmAdapter {
    private readonly client = new ChatOpenAI({
        model: "gpt-4o",
        configuration: {
            baseURL: "https://models.inference.ai.azure.com",
            apiKey: process.env.OPENAI_API_KEY,
        },
    });

    constructor(private readonly timeoutMs = 12_000) {}

    async completePhase(input: LlmPhaseInput): Promise<string> {
        const criteriaText = input.criteria
            .map((criterion) => `- ${criterion.id}: ${criterion.text} [${criterion.status}]`)
            .join("\n");

        const systemPrompt =
            input.phase === "think"
                ? "You are the THINK phase. Return one concise reasoning sentence for the next step."
                : "You are the PLAN phase. Return one concise implementation sentence for the next step.";

        const userPrompt = [
            `Request: ${input.request}`,
            `Mode: ${input.mode}`,
            `Iteration: ${input.iteration}`,
            "Criteria:",
            criteriaText || "- none",
            "Respond with plain text only.",
        ].join("\n");

        const response = await withTimeout(
            this.client.invoke([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ]),
            this.timeoutMs,
            `LLM timeout after ${this.timeoutMs}ms`,
        );

        const text = normalizeContent(response.content);
        if (!text) {
            throw new Error("LLM returned empty content");
        }

        return text;
    }
}

class NoopLlmAdapter implements LlmAdapter {
    async completePhase(input: LlmPhaseInput): Promise<string> {
        return input.phase === "think"
            ? "Fallback reasoning: continue with deterministic workflow checks"
            : "Fallback plan: proceed with current phased execution strategy";
    }
}

function normalizeContent(content: unknown): string {
    if (typeof content === "string") {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") {
                    return part;
                }
                if (part && typeof part === "object" && "text" in part) {
                    const text = (part as { text?: unknown }).text;
                    return typeof text === "string" ? text : "";
                }
                return "";
            })
            .join(" ")
            .trim();
    }

    return "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export function createLlmAdapter(): LlmAdapter {
    if (!process.env.OPENAI_API_KEY) {
        return new NoopLlmAdapter();
    }

    return new OpenAiLlmAdapter();
}

