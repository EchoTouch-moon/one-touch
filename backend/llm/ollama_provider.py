from backend.llm.openai_provider import OpenAIProvider
from backend.llm.base import LLMConfig


class OllamaProvider(OpenAIProvider):
    """Ollama uses the OpenAI-compatible API at localhost:11434."""

    def __init__(self, config: LLMConfig) -> None:
        ollama_config = LLMConfig(
            provider="ollama",
            model=config.model,
            api_key="ollama",
            base_url=config.base_url or "http://localhost:11434/v1",
            max_tokens=config.max_tokens,
            temperature=config.temperature,
        )
        super().__init__(ollama_config)
