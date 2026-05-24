import type { AIClient } from "../types.js";

export class OpenAIResponsesClient implements AIClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async generate(prompt: string, options: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Missing OpenAI API key");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: prompt,
        max_output_tokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const data = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    if (data.output_text) return data.output_text;

    const text = data.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;
    if (!text) throw new Error("OpenAI API returned no text");
    return text;
  }
}

export class StaticAIClient implements AIClient {
  constructor(private readonly response: string) {}

  async generate(): Promise<string> {
    return this.response;
  }
}
