from typing import Dict, Type

from backend.llm.base import BaseLLMProvider, EnrichResult, LLMConfig
from backend.llm.doubao_provider import DoubaoProvider
from backend.llm.ollama_provider import OllamaProvider
from backend.llm.openai_provider import OpenAIProvider

LLM_REGISTRY: Dict[str, Type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "ollama": OllamaProvider,
    "doubao": DoubaoProvider,
}


def register_llm(name: str):
    def decorator(cls: Type[BaseLLMProvider]):
        LLM_REGISTRY[name] = cls
        return cls
    return decorator


def LLMFactory(config: LLMConfig) -> BaseLLMProvider:
    # Lazy import to avoid import errors when anthropic SDK is not installed
    if config.provider == "anthropic":
        from backend.llm.anthropic_provider import AnthropicProvider
        return AnthropicProvider(config)

    cls = LLM_REGISTRY.get(config.provider)
    if cls is None:
        raise ValueError(f"Unknown LLM provider: {config.provider}")
    return cls(config)


__all__ = ["BaseLLMProvider", "EnrichResult", "LLMConfig", "LLMFactory", "register_llm"]
