import OpenAI from "@lobehub/icons/es/OpenAI";
import Claude from "@lobehub/icons/es/Claude";
import Gemini from "@lobehub/icons/es/Gemini";
import Grok from "@lobehub/icons/es/Grok";
import Perplexity from "@lobehub/icons/es/Perplexity";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Codex from "@lobehub/icons/es/Codex";
import AiStudio from "@lobehub/icons/es/AiStudio";

interface PlatformIconProps {
  platform: string | null | undefined;
  size?: number;
}

export function PlatformIcon({ platform, size = 14 }: PlatformIconProps) {
  if (!platform) return null;
  const key = platform.toLowerCase();

  switch (key) {
    case "chatgpt":
      return <OpenAI size={size} />;
    case "codex":
      return <Codex size={size} />;
    case "claude":
      return <Claude size={size} />;
    case "gemini":
      return <Gemini size={size} />;
    case "aistudio":
    case "ai-studio":
    case "ai_studio":
      return <AiStudio size={size} />;
    case "grok":
      return <Grok size={size} />;
    case "perplexity":
      return <Perplexity size={size} />;
    case "deepseek":
      return <DeepSeek size={size} />;
    default:
      return null;
  }
}

export function prettyPlatformName(platform: string | null | undefined): string {
  if (!platform) return "";
  const key = platform.toLowerCase();
  switch (key) {
    case "chatgpt":
      return "ChatGPT";
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "aistudio":
    case "ai-studio":
    case "ai_studio":
      return "AI Studio";
    case "grok":
      return "Grok";
    case "perplexity":
      return "Perplexity";
    case "deepseek":
      return "DeepSeek";
    default:
      return platform;
  }
}
