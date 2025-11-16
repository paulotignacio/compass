# app/axis.py

from __future__ import annotations
from typing import Dict, Mapping
import math

# Eixos em uso no teste
AXES = ["economic", "social", "community", "method", "pragmatism"]

# "Centros" aproximados de cada perfil no espaço 5D (-10..+10)
# Esses valores são calibráveis depois, mas já dão um mapa coerente.
PROFILE_TARGETS: Dict[str, Dict[str, float]] = {
    # Centro-esquerda institucional / social-democrata
    "social_democrata_pragmatico": {
        "economic": -6,
        "social": -3,
        "community": +2,
        "method": -2,
        "pragmatism": +6,
    },
    # Liberal clássico pró-mercado, costumes moderados
    "liberal_classico_mercado": {
        "economic": +8,
        "social": +1,
        "community": 0,
        "method": +2,
        "pragmatism": +5,
    },
    # Liberal social pró-direitos civis, cosmopolita
    "liberal_social_cosmopolita": {
        "economic": +5,
        "social": -6,
        "community": -6,
        "method": -1,
        "pragmatism": +3,
    },
    # Tecnocrata pragmático, orientado a dados
    "tecnocrata_pragmatico": {
        "economic": +2,
        "social": -1,
        "community": 0,
        "method": -6,
        "pragmatism": +9,
    },
    # Conservador empirista (prudência + tradição)
    "empirista_conservador": {
        "economic": +3,
        "social": +5,
        "community": +5,
        "method": +8,
        "pragmatism": +7,
    },
    # Conservador comunitário
    "conservador_comunitario": {
        "economic": +1,
        "social": +6,
        "community": +8,
        "method": +7,
        "pragmatism": +6,
    },
    # Direita libertária / minarquista
    "direita_libertaria": {
        "economic": +9,
        "social": -9,
        "community": -2,
        "method": -3,
        "pragmatism": +4,
    },
    # Direita autoritária nacionalista
    "direita_autoritaria_nacional": {
        "economic": +3,
        "social": +9,
        "community": +9,
        "method": +3,
        "pragmatism": +5,
    },
    # Esquerda libertária cosmopolita
    "esquerda_libertaria_cosmopolita": {
        "economic": -8,
        "social": -8,
        "community": -8,
        "method": -3,
        "pragmatism": +2,
    },
    # Esquerda comunitária igualitária
    "esquerda_comunitaria": {
        "economic": -8,
        "social": -2,
        "community": +7,
        "method": -2,
        "pragmatism": +3,
    },
    # Estilo idealista/utópico (principalmente no pragmatism)
    "idealista_utopico": {
        "economic": 0,
        "social": 0,
        "community": 0,
        "method": -4,
        "pragmatism": -9,
    },
    # Centro moderado pragmático
    "moderado_centro_pragmatico": {
        "economic": 0,
        "social": 0,
        "community": 0,
        "method": 0,
        "pragmatism": +8,
    },
}


def normalize_axes(axes_scores: Mapping[str, float], max_abs: float = 12.0) -> Dict[str, float]:
    """
    Normaliza os eixos para a faixa aproximada -10..10,
    assumindo que o valor absoluto máximo é max_abs (ex: 6 perguntas * 2 pontos = 12).
    """
    norm: Dict[str, float] = {}
    for axis, val in axes_scores.items():
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        norm[axis] = (v / max_abs) * 10.0
    return norm


def classify_profile(axes_scores: Mapping[str, float], profiles_dict: Dict[str, dict]) -> dict:
    """
    Recebe os scores brutos dos eixos (ex: -12..+12) e o dicionário de perfis
    carregado do profiles.json, e retorna o perfil mais próximo no espaço 5D.
    """
    # Caso totalmente neutro/inconclusivo
    if not axes_scores or all(v == 0 for v in axes_scores.values()):
        return {
            "key": "inconclusivo",
            "label": "Resultado inconclusivo",
            "description_short": (
                "Não foi possível identificar um perfil, pois as respostas foram neutras "
                "ou insuficientes em todos os eixos."
            ),
            "description_long": (
                "Para obter um resultado mais preciso, tente responder às afirmações "
                "com mais convicção, evitando deixar tudo em neutro."
            ),
            "axis_tendencies": {},
            "authors_classic": [],
            "figures_modern_international": [],
            "figures_modern_national": [],
            "examples_practical": [],
        }

    norm_axes = normalize_axes(axes_scores)

    best_key = None
    best_dist = float("inf")

    for key, target in PROFILE_TARGETS.items():
        # só considera perfis definidos e existentes no profiles.json
        if key not in profiles_dict:
            continue

        dist_sq = 0.0
        for axis in AXES:
            user_val = norm_axes.get(axis, 0.0)
            target_val = float(target.get(axis, 0.0))
            diff = user_val - target_val
            dist_sq += diff * diff

        if dist_sq < best_dist:
            best_dist = dist_sq
            best_key = key

    # fallback extremo (não deveria acontecer se PROFILE_TARGETS e profiles.json estiverem alinhados)
    if best_key is None:
        any_key = next(iter(profiles_dict.keys()))
        profile = profiles_dict[any_key].copy()
        profile["key"] = any_key
        return profile

    profile = profiles_dict[best_key].copy()
    profile["key"] = best_key
    return profile
