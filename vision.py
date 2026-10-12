"""(선택) Claude로 손바닥 사진에서 손금 특징을 읽어 질문 답을 미리 채운다.

ANTHROPIC_API_KEY가 있고 `anthropic` 패키지가 설치돼 있을 때만 켜진다.
사진은 이 요청에만 쓰이고 서버에 저장하지 않는다.
"""
import json
import os
from pathlib import Path

RULES = json.loads((Path(__file__).parent / "site" / "rules.json").read_text(encoding="utf-8"))

MODEL = "claude-opus-5-5"

try:
    import anthropic
except ImportError:  # AI 모드 없이도 서비스는 동작한다
    anthropic = None


def enabled():
    return anthropic is not None and bool(os.environ.get("ANTHROPIC_API_KEY"))


def _schema():
    point = {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
             "required": ["x", "y"], "additionalProperties": False}
    answers = {
        q["id"]: {"type": "string", "enum": [o["value"] for o in q["options"]]}
        for q in RULES["questions"]
    }
    return {
        "type": "object",
        "properties": {
            "photo_ok": {"type": "boolean"},
            "photo_issue": {"type": "string"},
            "hand": {"type": "string", "enum": ["left", "right", "unknown"]},
            "answers": {"type": "object", "properties": answers,
                        "required": list(answers), "additionalProperties": False},
            "uncertain": {"type": "array", "items": {"type": "string", "enum": list(answers)}},
            "lines": {
                "type": "object",
                "properties": {k: {"type": "array", "items": point} for k in ("heart", "head", "life", "fate")},
                "required": ["heart", "head", "life", "fate"],
                "additionalProperties": False,
            },
        },
        "required": ["photo_ok", "photo_issue", "hand", "answers", "uncertain", "lines"],
        "additionalProperties": False,
    }


def _prompt():
    guide = "\n".join(
        f"- {q['id']}: {q['title']} " + " / ".join(f"{o['value']}={o['label']}" for o in q["options"])
        for q in RULES["questions"]
    )
    return (
        "You read palm photos for an entertainment palm-reading app. Look at the photo and fill in "
        "each feature below, choosing the option that best matches what is visible.\n\n"
        f"{guide}\n\n"
        "Rules:\n"
        "- photo_ok is false if no open palm is clearly visible (blurry, too dark, back of the hand, "
        "fingers closed). Then explain the problem in photo_issue in one short Korean sentence; "
        "otherwise photo_issue is an empty string.\n"
        "- List in `uncertain` every feature you could not see clearly. Still give your best guess.\n"
        "- If simian is yes, still fill the heart/head fields with your best guess; the app ignores them.\n"
        "- lines: for each visible main line give 4-8 points along it, as fractions of image width (x) "
        "and height (y) from the top-left corner. Use an empty list for a line you cannot see. "
        "If simian is yes, put the merged line under heart and leave head empty."
    )


def analyze(image_b64, media_type):
    """사진을 분석해 {'photo_ok', 'photo_issue', 'hand', 'answers', 'uncertain', 'lines'}를 돌려준다."""
    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": _schema()}},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": _prompt()},
            ],
        }],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("AI가 이 사진을 분석하지 않았어요. 다른 사진으로 시도하거나 직접 선택해 주세요.")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("AI 응답이 잘렸어요. 다시 시도해 주세요.")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)
