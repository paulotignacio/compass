from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Any

from .logic import load_questions, load_profiles, compute_axes
from .axis import classify_profile

app = FastAPI(title="Compass MVP")

# CORS liberado para uso local (se acessar via file:// ou outras portas)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# monta static/
app.mount("/static", StaticFiles(directory="static"), name="static")


class AnswersPayload(BaseModel):
    answers: Dict[str, int]


@app.get("/", response_class=HTMLResponse)
def read_root():
    index_path = Path("static/index.html")
    return index_path.read_text(encoding="utf-8")


@app.get("/quiz", response_class=HTMLResponse)
def read_quiz():
    quiz_path = Path("static/quiz.html")
    return quiz_path.read_text(encoding="utf-8")


@app.get("/api/questions")
def get_questions() -> Any:
    """
    Retorna as perguntas em dois formatos:

    - questions: lista achatada (array) para o front atual
    - by_axis: mesmas perguntas agrupadas por eixo,
      para futura paginação (economic, social, etc.)
    """
    questions_by_axis = load_questions()

    flat_list = []
    for axis_name, q_list in questions_by_axis.items():
        for q in q_list:
            item = q.copy()
            # garante que o eixo fica acessível no front
            item["axis"] = axis_name
            flat_list.append(item)

    return {
        "questions": flat_list,      # o front atual usa isso (array)
        "by_axis": questions_by_axis # futuro: paginação por eixos
    }



@app.post("/api/submit")
def submit_answers(payload: AnswersPayload) -> Any:
    questions = load_questions()
    profiles = load_profiles()
    # 0) Pega todos os valores respondidos
    values = list(payload.answers.values())
    
    # 1) Nenhuma resposta preenchida → perfil inconclusivo
    if not payload.answers:
        return {
            "axes": {},
            "profile": {
                "key": "inconclusivo",
                "label": "Perfil inconclusivo",
                "description_short": (
                    "Você não respondeu a nenhuma afirmação. "
                    "Para identificar seu perfil, é necessário responder pelo menos parte das perguntas."
                ),
            },
        }

    # 2) Se a pessoa marcou tudo igual (-2 em tudo, ou tudo 0, ou tudo +2)
    if values and all(v == values[0] for v in values):
        return {
            "axes": {},
            "profile": {
                "key": "inconclusivo",
                "label": "Perfil inconclusivo",
                "description_short": (
                    "Suas respostas foram muito homogêneas (por exemplo, discordo totalmente em todas as afirmações). "
                    "Isso impede identificar um padrão consistente de ideias. "
                    "Tente responder variando entre concordo e discordo conforme cada frase faça sentido para você."
                ),
            },
        }

    # 3) Fluxo normal (se passou nos testes acima)

    axes_scores = compute_axes(payload.answers, questions)
    profile = classify_profile(axes_scores, profiles)

    return {
        "axes": axes_scores,
        "profile": profile,
    }
