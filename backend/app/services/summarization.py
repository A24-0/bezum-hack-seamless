import re
from app.config import settings


async def summarize_transcript(transcript: str) -> str:
    """Summarize a meeting transcript. Uses OpenAI GPT if key set, otherwise simple extractive."""
    if not transcript or len(transcript.strip()) < 50:
        return "No transcript available for summarization."

    if settings.OPENAI_API_KEY:
        return await _openai_summarize(transcript)
    return _simple_summarize(transcript)


async def _openai_summarize(transcript: str) -> str:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meeting assistant. Summarize the following meeting transcript "
                        "into a structured summary with sections: "
                        "**Key Decisions**, **Action Items**, **Discussion Points**. "
                        "Be concise and use bullet points."
                    ),
                },
                {"role": "user", "content": transcript[:8000]},
            ],
            max_tokens=800,
        )
        return response.choices[0].message.content or _simple_summarize(transcript)
    except Exception as e:
        return f"AI summarization failed: {str(e)}\n\n" + _simple_summarize(transcript)


def _simple_summarize(transcript: str) -> str:
    lines = [l.strip() for l in transcript.split('\n') if l.strip()]
    # Extract sentences that look like decisions or actions
    decision_keywords = ['decided', 'agreed', 'will', 'action', 'todo', 'need to', 'should', 'must']
    decisions = []
    actions = []
    other = []

    for line in lines:
        lower = line.lower()
        if any(k in lower for k in ['decided', 'agreed', 'approved', 'confirmed']):
            decisions.append(f"• {line}")
        elif any(k in lower for k in ['will', 'action', 'todo', 'need to', 'should', 'must', 'assigned']):
            actions.append(f"• {line}")
        else:
            other.append(line)

    parts = []
    if decisions:
        parts.append("**Key Decisions**\n" + "\n".join(decisions[:5]))
    if actions:
        parts.append("**Action Items**\n" + "\n".join(actions[:5]))
    if other:
        excerpt = " ".join(other)[:400]
        parts.append(f"**Discussion Summary**\n{excerpt}...")

    return "\n\n".join(parts) if parts else f"Meeting transcript ({len(lines)} lines). Key topics discussed."
