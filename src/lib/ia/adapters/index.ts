import type { IAProvider, IAChatRequestBody, IAChatResponse, HealthResult } from "@/lib/ia/types";
import * as ollama from "./ollama";
import * as huggingface from "./huggingface";

export interface IAAdapter {
  health: () => Promise<HealthResult>;
  listModels: () => Promise<string[]>;
  chat: (req: IAChatRequestBody) => Promise<IAChatResponse>;
}

export function getAdapter(provider: IAProvider): IAAdapter {
  switch (provider) {
    case "ollama":
      return ollama;
    case "huggingface":
      return huggingface;
  }
}

export function isValidProvider(value: unknown): value is IAProvider {
  return value === "ollama" || value === "huggingface";
}