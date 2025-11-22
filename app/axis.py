# app/axis.py

from __future__ import annotations
from typing import Dict, Mapping
import math

# ---------------------------------------------------------
# EIXOS do teste — espaço 5D usado na classificação
# economic   → Estado vs Mercado
# social     → Autoridade/Ordem vs Liberdades Individuais
# community  → Nacional/Comunitário vs Cosmopolita/Global
# method     → Planejamento/Engenharia Social vs Incrementalismo
# pragmatism → Idealismo/Princípios vs Pragmatismo/Resultados
# ---------------------------------------------------------
AXES = ["economic", "social", "community", "method", "pragmatism"]

# ---------------------------------------------------------
# VETORES-ALVO ("centros ideais") de cada perfil no espaço 5D
# Faixa recomendada: -10 (extremo esquerda/liberdade/status quo)
#                    +10 (extremo direita/autoridade/comunidade)
# Esses valores são ajustáveis; servem como coordenadas culturais.
# ---------------------------------------------------------
PROFILE_TARGETS: Dict[str, Dict[str, float]] = {
    # Social-democrata pragmático
    # economic   → centro-esquerda pró-Estado moderado
    # social     → liberdades civis com alguma ordem
    # community  → leve pertença comunitária
    # method     → reformas graduais, baseadas em evidências
    # pragmatism → muito pragmático
    "social_democrata_pragmatico": {
        "economic": -6,
        "social": -3,
        "community": +2,
        "method": -2,
        "pragmatism": +6,
    },

    # Liberal clássico, pro-mercado, costumes moderados
    # economic   → mercado livre forte
    # social     → moderadamente liberal
    # community  → neutro
    # method     → incremental
    # pragmatism → pragmático
    "liberal_classico_mercado": {
        "economic": +8,
        "social": +1,
        "community": 0,
        "method": +2,
        "pragmatism": +5,
    },

    # Liberal social — direitos civis + globalismo
    # economic   → liberal pró-inovação
    # social     → liberdades máximas
    # community  → cosmopolita
    # method     → tecnicista moderado
    # pragmatism → pragmatismo moderado
    "liberal_social_cosmopolita": {
        "economic": +5,
        "social": -6,
        "community": -6,
        "method": -1,
        "pragmatism": +3,
    },

    # Tecnocrata pragmático — dados > ideologia
    # economic   → mercado regulado
    # social     → neutro
    # community  → neutro
    # method     → muito planejado, racionalista
    # pragmatism → altamente pragmático
    "tecnocrata_pragmatico": {
        "economic": +2,
        "social": -1,
        "community": 0,
        "method": -6,
        "pragmatism": +9,
    },

    # Empirista conservador — prudência institucional
    # economic   → pró-mercado sem radicalismo
    # social     → mais ordem e estabilidade
    # community  → comunitário moderado
    # method     → forte incrementalismo
    # pragmatism → muito pragmático
    "empirista_conservador": {
        "economic": +3,
        "social": +5,
        "community": +5,
        "method": +8,
        "pragmatism": +7,
    },

    # Conservador comunitário — tradição e pertencimento
    # economic   → leve pró-mercado
    # social     → forte ordem/moralidade
    # community  → comunitarismo/nacional moderado
    # method     → incremental forte
    # pragmatism → alto pragmatismo
    "conservador_comunitario": {
        "economic": +1,
        "social": +6,
        "community": +8,
        "method": +7,
        "pragmatism": +6,
    },

    # Direita libertária — máxima liberdade individual
    # economic   → livre-mercado extremo
    # social     → liberdades civis máximas
    # community  → leve cosmopolitismo
    # method     → anti-planejamento estatal
    # pragmatism → pragmatismo médio
    "direita_libertaria": {
        "economic": +9,
        "social": -9,
        "community": -2,
        "method": -3,
        "pragmatism": +4,
    },

    # Direita autoritária nacionalista
    # economic   → pró-mercado com proteção nacional
    # social     → autoridade forte
    # community  → nacionalismo alto
    # method     → planejamento nacional moderado
    # pragmatism → pragmatismo médio
    "direita_autoritaria_nacional": {
        "economic": +3,
        "social": +9,
        "community": +9,
        "method": +3,
        "pragmatism": +5,
    },

    # Esquerda libertária — autonomia e globalismo
    # economic   → anti-mercado forte
    # social     → máxima liberdade
    # community  → global/cosmopolita
    # method     → racionalista leve
    # pragmatism → pouco pragmático (por idealismo leve)
    "esquerda_libertaria_cosmopolita": {
        "economic": -8,
        "social": -8,
        "community": -8,
        "method": -3,
        "pragmatism": +2,
    },

    # Esquerda comunitária igualitária
    # economic   → anti-mercado
    # social     → liberdades, mas com coesão social
    # community  → comunitário/solidário
    # method     → racionalismo reformista
    # pragmatism → pragmatismo moderado
    "esquerda_comunitaria": {
        "economic": -8,
        "social": -2,
        "community": +7,
        "method": -2,
        "pragmatism": +3,
    },

    # Idealista utópico — extremo em princípios
    # economic   → variável (0)
    # social     → variável (0)
    # community  → variável (0)
    # method     → engenharia social
    # pragmatism → idealismo máximo
    "idealista_utopico": {
        "economic": 0,
        "social": 0,
        "community": 0,
        "method": -4,
        "pragmatism": -9,
    },

    # Esquerda nacional-desenvolvimentista autoritária
    # economic   → Estado forte e desenvolvimentista
    # social     → ordem e controle moderados
    # community  → nacionalismo popular
    # method     → planejamento estatal
    # pragmatism → pragmatismo moderado
    "esquerda_nacional_desenvolvimentista_autoritaria": {
        "economic": -7,
        "social": +5,
        "community": +8,
        "method": -5,
        "pragmatism": +1,
    },
}

# ---------------------------------------------------------
# Normalização: converte pontuação bruta (ex: -16..+16) para -10..+10
# ---------------------------------------------------------
def normalize_axes(axes_scores: Mapping[str, float], max_abs: float = 16.0) -> Dict[str, float]:
    """
    Normaliza as pontuações brutas dos eixos para a escala -10..10.
    O valor máximo absoluto considerado é max_abs = 16,
    correspondente a 8 perguntas * 2 pontos (Likert de -2 a +2).
    
    Nota: valores acima ou abaixo desse limite são automaticamente
    'clamped' para evitar distorções na classificação.
    """
    norm: Dict[str, float] = {}
    for axis, val in axes_scores.items():
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue

        # Proteção contra overflow: garante que o eixo fica entre -max_abs e +max_abs
        v = max(-max_abs, min(max_abs, v))

        # Normaliza para -10..10
        norm[axis] = (v / max_abs) * 10.0

    return norm

# ---------------------------------------------------------
# Classificação: encontra o perfil mais próximo
# usando distância euclidiana no espaço 5D.
# ---------------------------------------------------------
def classify_profile(axes_scores: Mapping[str, float], profiles_dict: Dict[str, dict]) -> dict:
    """
    Recebe os scores brutos dos eixos e retorna o perfil mais próximo.
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

        # Só considera perfis presentes no profiles.json
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

    # fallback de segurança
    if best_key is None:
        any_key = next(iter(profiles_dict.keys()))
        profile = profiles_dict[any_key].copy()
        profile["key"] = any_key
        return profile

    profile = profiles_dict[best_key].copy()
    profile["key"] = best_key
    return profile
