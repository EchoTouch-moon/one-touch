import json
import logging

from backend.llm.base import BaseLLMProvider, ENRICH_SYSTEM_PROMPT, EnrichResponseSchema, EnrichResult

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    async def enrich_word(self, word: str) -> EnrichResult:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url,
        )

        response = await client.chat.completions.create(
            model=self.config.model,
            messages=[
                {"role": "system", "content": ENRICH_SYSTEM_PROMPT},
                {"role": "user", "content": f"Enrich the word: {word}"},
            ],
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
        )

        content = response.choices[0].message.content or "{}"
        data = EnrichResponseSchema.model_validate(json.loads(content))

        return EnrichResult(
            phonetic=data.phonetic,
            definitions=[item.model_dump() for item in data.definitions],
            examples=[],
            collocations=[],
        )
