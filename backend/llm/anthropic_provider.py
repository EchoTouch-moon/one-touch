import json
import logging

from backend.llm.base import BaseLLMProvider, ENRICH_SYSTEM_PROMPT, EnrichResponseSchema, EnrichResult

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    async def enrich_word(self, word: str) -> EnrichResult:
        import anthropic

        client = anthropic.AsyncAnthropic(
            api_key=self.config.api_key,
            base_url=self.config.base_url,
        )

        response = await client.messages.create(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            system=ENRICH_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": f"Enrich the word: {word}"},
            ],
        )

        content = response.content[0].text if response.content else "{}"
        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]

        data = EnrichResponseSchema.model_validate(json.loads(content.strip()))

        return EnrichResult(
            phonetic=data.phonetic,
            definitions=[item.model_dump() for item in data.definitions],
            examples=[],
            collocations=[],
        )
