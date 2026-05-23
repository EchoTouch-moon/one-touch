import json
import logging

from backend.llm.base import BaseLLMProvider, ENRICH_SYSTEM_PROMPT, EnrichResponseSchema, EnrichResult

logger = logging.getLogger(__name__)


def _extract_response_text(response) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)

    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                chunks.append(str(text))
    return "\n".join(chunks)


def _strip_json_markdown(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()


class DoubaoProvider(BaseLLMProvider):
    async def enrich_word(self, word: str) -> EnrichResult:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url or "https://ark.cn-beijing.volces.com/api/v3",
        )

        response = await client.responses.create(
            model=self.config.model,
            instructions=ENRICH_SYSTEM_PROMPT,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": f"Enrich the word: {word}",
                        }
                    ],
                }
            ],
            max_output_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
        )

        content = _strip_json_markdown(_extract_response_text(response))
        data = EnrichResponseSchema.model_validate(json.loads(content))

        return EnrichResult(
            phonetic=data.phonetic,
            definitions=[item.model_dump() for item in data.definitions],
            examples=[],
            collocations=[],
        )
