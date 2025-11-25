from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.db import get_connection

from .logic import load_questions, load_profiles, compute_axes
from .axis import classify_profile
from .db import (
    init_db,
    save_result_record,
    fetch_result_record,
    get_stats_summary,
)

app = FastAPI(title="Compass MVP")
APP_VERSION = "1.0.0"

# garante que a tabela exista ao subir a aplicação
init_db()

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

class SaveResultPayload(BaseModel):
    answers: Dict[str, int]
    scores: Dict[str, float]
    profile_key: str
    profile_label: str
    locale: Optional[str] = None
    device: Optional[str] = None

class SaveResultResponse(BaseModel):
    result_id: str

class ResultResponse(BaseModel):
    result_id: str
    axes: Dict[str, float]
    profile: Dict[str, Any]
    answers: Optional[Dict[str, int]] = None
    metadata: Optional[Dict[str, Any]] = None


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


@app.post("/api/save_result", response_model=SaveResultResponse)
def save_result(payload: SaveResultPayload) -> Any:
    """
    Persiste o resultado de forma anônima e retorna a chave de recuperação.
    """
    # perfil pode mudar de versão, mas guardamos o rótulo enviado
    profile_label = payload.profile_label
    profiles = load_profiles()
    if not profile_label and payload.profile_key in profiles:
        profile_label = profiles[payload.profile_key].get("label", payload.profile_key)

    result_id = save_result_record(
        answers=payload.answers or {},
        scores=payload.scores or {},
        version=APP_VERSION,
        profile_key=payload.profile_key,
        profile_label=profile_label or payload.profile_key,
        user_locale=payload.locale,
        device_type=payload.device,
    )

    return {"result_id": result_id}


@app.get("/api/result/{result_id}", response_model=ResultResponse)
def get_result(result_id: str) -> Any:
    """
    Recupera um resultado salvo a partir da chave pública.
    """
    record = fetch_result_record(result_id)
    if not record:
        raise HTTPException(status_code=404, detail="Resultado não encontrado.")

    profiles = load_profiles()
    profile = profiles.get(record["profile_key"], {})
    profile_with_meta = {
        **profile,
        "key": record["profile_key"],
        "label": record["profile_label"] or profile.get("label") or record["profile_key"],
    }

    metadata = {
        "timestamp": record["timestamp"],
        "version": record["version"],
        "user_locale": record["user_locale"],
        "device_type": record["device_type"],
    }

    return {
        "result_id": record["id"],
        "axes": record["scores"],
        "profile": profile_with_meta,
        "answers": record["answers"],
        "metadata": metadata,
    }


@app.get("/api/stats")
def get_stats():
    conn = get_connection()
    cur = conn.cursor()

    # total de testes registrados
    cur.execute("SELECT COUNT(*) FROM results")
    total = cur.fetchone()[0]

    # distribuição de perfis
    cur.execute("""
        SELECT profile_key, COUNT(*) 
        FROM results 
        GROUP BY profile_key 
        ORDER BY COUNT(*) DESC
    """)
    profiles = [
        {"profile": row[0], "count": row[1]}
        for row in cur.fetchall()
    ]

    # média dos eixos
    cur.execute("""
        SELECT 
            AVG(CAST(json_extract(scores, '$.economic') AS FLOAT)),
            AVG(CAST(json_extract(scores, '$.social') AS FLOAT)),
            AVG(CAST(json_extract(scores, '$.community') AS FLOAT)),
            AVG(CAST(json_extract(scores, '$.method') AS FLOAT)),
            AVG(CAST(json_extract(scores, '$.pragmatism') AS FLOAT))
        FROM results
    """)
    avg_scores_row = cur.fetchone()
    avg_scores = {
        "economic": avg_scores_row[0],
        "social": avg_scores_row[1],
        "community": avg_scores_row[2],
        "method": avg_scores_row[3],
        "pragmatism": avg_scores_row[4],
    }

    conn.close()

    return {
        "total_results": total,
        "profile_distribution": profiles,
        "average_scores": avg_scores
    }