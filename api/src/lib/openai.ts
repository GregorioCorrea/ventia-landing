import { AzureOpenAI } from "openai";
import { getOpenAiEnv } from "./env";
import { HttpError } from "./errors";

let openAiClient: AzureOpenAI | null = null;

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

export async function generateMessage(prompt: string): Promise<string> {
  if (!prompt || prompt.trim().length === 0) {
    throw new HttpError(400, "Prompt must not be empty.", "invalid_prompt");
  }

  const env = getOpenAiEnv();
  const client = getAzureOpenAiClient();

  const completion = await client.chat.completions.create({
    model: env.AZURE_OPENAI_DEPLOYMENT_NAME,
    messages: [{ role: "user", content: prompt.trim() }],
    temperature: 0.3
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}
