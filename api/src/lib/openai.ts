import { AzureOpenAI } from "openai";
import { getOpenAiEnv } from "./env";
import { HttpError } from "./errors";

let openAiClient: AzureOpenAI | null = null;

export type GenerateMessageOptions = {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
};

export function getAzureOpenAiClient(): AzureOpenAI {
  if (openAiClient) {
    return openAiClient;
  }

  const env = getOpenAiEnv();

  openAiClient = new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    deployment: env.AZURE_OPENAI_DEPLOYMENT_NAME
  });

  return openAiClient;
}

export async function generateMessage(
  prompt: string,
  options: GenerateMessageOptions = {}
): Promise<string> {
  if (!prompt || prompt.trim().length === 0) {
    throw new HttpError(400, "Prompt must not be empty.", "invalid_prompt");
  }

  const env = getOpenAiEnv();
  const client = getAzureOpenAiClient();

  const completion = await client.chat.completions.create({
    model: env.AZURE_OPENAI_DEPLOYMENT_NAME,
    messages: [{ role: "user", content: prompt.trim() }],
    temperature: options.temperature ?? 0.3,
    top_p: options.top_p ?? 0.9,
    max_tokens: options.max_tokens
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}
