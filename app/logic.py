import json
from pathlib import Path
from typing import Dict, Any
from .axis import classify_profile



BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def load_questions() -> Dict[str, list]:
    """
    Carrega o questions.json no novo formato:
    {
      "economic": [...],
      "social": [...],
      ...
    }
    """
    with open(DATA_DIR / "questions.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def load_profiles() -> dict:
    with open(DATA_DIR / "profiles.json", "r", encoding="utf-8") as f:
        return json.load(f)


def compute_axes(answers: Dict[str, int], questions_by_axis: Dict[str, list]) -> Dict[str, float]:
    """
    Soma os eixos a partir das respostas.
    answers: {"EC1": 2, "SO3": -1, ...}
    questions_by_axis: {"economic": [...], "social": [...], ...}
    """
    axes_scores: Dict[str, float] = {
        "economic": 0.0,
        "social": 0.0,
        "community": 0.0,
        "method": 0.0,
        "pragmatism": 0.0,
    }

    # índice id -> question
    index: Dict[str, Any] = {}
    for axis_name, q_list in questions_by_axis.items():
        for q in q_list:
            index[q["id"]] = q

    for qid, value in answers.items():
        question = index.get(qid)
        if question is None:
            continue

        for axis_def in question.get("axes", []):
            name = axis_def["name"]
            direction = axis_def.get("direction", 1)
            weight = axis_def.get("weight", 1.0)

            if name not in axes_scores:
                axes_scores[name] = 0.0

            axes_scores[name] += value * direction * weight

    return axes_scores