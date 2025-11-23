from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

# Caminho do banco local (SQLite) — não armazena nenhum dado pessoal
DB_PATH = Path(__file__).resolve().parent / "data" / "results.db"

# Alfabeto sem caracteres facilmente confundíveis (0/O/I/l removidos)
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_result_id() -> str:
    """
    Gera uma chave no formato IDEO-XXXX-YYYY usando fonte criptográfica.
    """
    def _block() -> str:
        return "".join(secrets.choice(_ALPHABET) for _ in range(4))

    return f"IDEO-{_block()}-{_block()}"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Cria a tabela de resultados, caso ainda não exista.
    """
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS results (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                version TEXT,
                answers TEXT,
                scores TEXT,
                profile_key TEXT,
                profile_label TEXT,
                user_locale TEXT,
                device_type TEXT
            )
            """
        )
        conn.commit()


def save_result_record(
    *,
    answers: Dict[str, Any],
    scores: Dict[str, Any],
    version: str,
    profile_key: str,
    profile_label: str,
    user_locale: Optional[str],
    device_type: Optional[str],
) -> str:
    """
    Persiste o resultado e retorna o ID gerado.
    """
    attempts = 0
    while attempts < 5:
        result_id = generate_result_id()
        try:
            with get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO results (
                        id, timestamp, version, answers, scores,
                        profile_key, profile_label, user_locale, device_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        result_id,
                        datetime.utcnow().isoformat(),
                        version,
                        json.dumps(answers or {}),
                        json.dumps(scores or {}),
                        profile_key,
                        profile_label,
                        user_locale,
                        device_type,
                    ),
                )
                conn.commit()
            return result_id
        except sqlite3.IntegrityError:
            # Em caso raríssimo de colisão, tenta novamente
            attempts += 1
            continue

    raise RuntimeError("Não foi possível gerar uma chave única de resultado.")


def fetch_result_record(result_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM results WHERE id = ?", (result_id,)
        ).fetchone()

    if not row:
        return None

    return {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "version": row["version"],
        "answers": json.loads(row["answers"]) if row["answers"] else {},
        "scores": json.loads(row["scores"]) if row["scores"] else {},
        "profile_key": row["profile_key"],
        "profile_label": row["profile_label"],
        "user_locale": row["user_locale"],
        "device_type": row["device_type"],
    }


def get_stats_summary() -> Dict[str, Any]:
    with get_connection() as conn:
        total_row = conn.execute("SELECT COUNT(*) AS total FROM results").fetchone()
        latest_row = conn.execute(
            "SELECT timestamp FROM results ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        dist_rows = conn.execute(
            "SELECT profile_key, COUNT(*) AS qty FROM results GROUP BY profile_key"
        ).fetchall()

        avg_row = conn.execute(
            """
            SELECT
                AVG(CAST(json_extract(scores, '$.economic') AS REAL)) AS economic,
                AVG(CAST(json_extract(scores, '$.social') AS REAL)) AS social,
                AVG(CAST(json_extract(scores, '$.community') AS REAL)) AS community,
                AVG(CAST(json_extract(scores, '$.method') AS REAL)) AS method,
                AVG(CAST(json_extract(scores, '$.pragmatism') AS REAL)) AS pragmatism
            FROM results
            """
        ).fetchone()

    profile_distribution = {row["profile_key"]: row["qty"] for row in dist_rows}
    axes_avg = {
        "economic": avg_row["economic"],
        "social": avg_row["social"],
        "community": avg_row["community"],
        "method": avg_row["method"],
        "pragmatism": avg_row["pragmatism"],
    }

    return {
        "total": total_row["total"] if total_row else 0,
        "profile_distribution": profile_distribution,
        "axes_avg": axes_avg,
        "latest_timestamp": latest_row["timestamp"] if latest_row else None,
    }
