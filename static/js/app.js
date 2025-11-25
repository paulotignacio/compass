// app.js

let questions = [];
let pages = []; // cada página = perguntas de um eixo
let currentPageIndex = 0;
let answers = {}; // { questionId: value }
let chartInstance = null;
let radarChartInstance = null;
let latestResult = null; // guarda último resultado para abrir a página de detalhes
let latestResultId = null; // chave do resultado salvo

// mapa para nomes bonitos dos eixos
const AXIS_LABELS = {
  economic: "Economia",
  social: "Costumes / Liberdades",
  community: "Comunidade / Identidade",
  method: "Método de mudança",
  pragmatism: "Pragmatismo vs Idealismo",
};

// rótulos em múltiplas linhas para caber no radar em telas pequenas
const RADAR_POINT_LABELS = {
  economic: ["Economia"],
  social: ["Costumes", "vs Liberdades"],
  community: ["Comunidade", "vs Identidade"],
  method: ["Método de", "mudança"],
  pragmatism: ["Pragmatismo", "vs Idealismo"],
};

const AXIS_DESCRIPTIONS = {
  economic:
    "Este eixo avalia como você entende o papel do Estado e do mercado na organização econômica: impostos, regulação, serviços públicos e liberdade empresarial.",
  social:
    "Este eixo mede sua visão sobre a liberdade pessoal: quanto o Estado ou a sociedade devem influenciar comportamentos individuais, moralidade e escolhas privadas.",
  community:
    "Este eixo analisa como você equilibra autonomia individual, pertencimento cultural, identidade nacional e deveres com a comunidade.",
  method:
    "Este eixo identifica como você acredita que mudanças sociais devem ocorrer: por evoluções graduais, pela ação de especialistas ou por transformações estruturadas.",
  pragmatism:
    "Este eixo mede se você prioriza soluções práticas e imediatas ou visões de longo prazo orientadas por princípios e objetivos ideais.",
};

const axisOrder = ["economic", "social", "community", "method", "pragmatism"];
const LIKERT_OPTIONS = [
  { value: -2, label: "Discordo Muito" },
  { value: -1, label: "Discordo" },
  { value: 0, label: "Neutro" },
  { value: 1, label: "Concordo" },
  { value: 2, label: "Concordo Muito" },
];
const RESULT_ID_REGEX = /^IDEO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function detectDeviceType() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isTouch = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  if (/Mobi|Android/i.test(ua) || isTouch) return "mobile";
  return "desktop";
}

function normalizeResultId(value) {
  if (!value) return "";
  return value.trim().toUpperCase();
}

function setInlineMessage(elementId, text, { error = false } = {}) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("text-red-300", error);
  el.classList.toggle("text-emerald-300", !error);
}

function updateResultKeyDisplay(resultId) {
  const block = document.getElementById("result-key-block");
  const valueEl = document.getElementById("result-key-value");
  const copyBtn = document.getElementById("copy-result-key-btn");
  if (!block || !valueEl) return;

  if (resultId) {
    valueEl.textContent = resultId;
    block.classList.remove("hidden");
    copyBtn?.removeAttribute("disabled");
  } else {
    valueEl.textContent = "Chave ainda não gerada";
    copyBtn?.setAttribute("disabled", "true");
    block.classList.remove("hidden");
  }
}

async function copyResultKeyToClipboard() {
  if (!latestResultId) return;
  try {
    await navigator.clipboard.writeText(latestResultId);
    setInlineMessage("result-key-message", "Chave copiada para a área de transferência.");
  } catch (err) {
    console.error(err);
    setInlineMessage(
      "result-key-message",
      "Não foi possível copiar automaticamente. Selecione e copie manualmente.",
      { error: true }
    );
  }
}

function createLikertControl(questionId, axis, currentValue, onChange) {
  const container = document.createElement("div");
  container.className = "likert-scale";
  container.setAttribute("role", "radiogroup");
  container.setAttribute(
    "aria-label",
    "Selecione o quanto você concorda ou discorda desta afirmação"
  );

  const optionNodes = [];

  const legend = document.createElement("div");
  legend.className = "likert-scale__legend";
  const legendLeft = document.createElement("span");
  legendLeft.className = "likert-scale__legend-item legend-left";
  legendLeft.textContent = "Discordo muito";
  const legendCenter = document.createElement("span");
  legendCenter.className = "likert-scale__legend-item legend-center";
  legendCenter.textContent = "Neutro";
  const legendRight = document.createElement("span");
  legendRight.className = "likert-scale__legend-item legend-right";
  legendRight.textContent = "Concordo muito";
  legend.append(legendLeft, legendCenter, legendRight);

  const optionsRow = document.createElement("div");
  optionsRow.className = "likert-scale__options";

  const syncSelection = (newValue) => {
    optionNodes.forEach(({ label, input, value }) => {
      const active = value === newValue;
      label.dataset.selected = active ? "true" : "false";
      label.classList.toggle("selected", active);
      input.checked = active;
    });
  };

  LIKERT_OPTIONS.forEach((opt) => {
    const optionId = `likert-${questionId}-${opt.value}`;
    const optionLabel = document.createElement("label");
    optionLabel.className = "likert-option";
    optionLabel.dataset.value = opt.value;
    optionLabel.dataset.selected = currentValue === opt.value ? "true" : "false";
    optionLabel.classList.toggle("selected", currentValue === opt.value);
    optionLabel.setAttribute("for", optionId);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `likert-${questionId}`;
    input.id = optionId;
    input.value = opt.value;
    input.checked = currentValue === opt.value;
    input.setAttribute("aria-label", opt.label);

    input.addEventListener("change", () => {
      onChange(opt.value);
      syncSelection(opt.value);
    });

    const textLabel = document.createElement("span");
    textLabel.className = "likert-scale__label-text likert-option__text";
    textLabel.textContent = opt.label;

    optionLabel.appendChild(input);
    optionLabel.appendChild(textLabel);
    optionsRow.appendChild(optionLabel);

    optionNodes.push({ label: optionLabel, input, value: opt.value });
  });

  syncSelection(currentValue ?? null);

  container.appendChild(legend);
  container.appendChild(optionsRow);
  return container;
}

function getAxisNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function formatAxisValue(val) {
  if (!Number.isFinite(val)) return "--";
  const rounded = Math.abs(val % 1) < 0.001 ? Math.round(val) : Number(val.toFixed(1));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function interpretAxisScore(axis, raw) {
  const score = getAxisNumber(raw);
  if (score === null) return "Sem dados suficientes para este eixo.";

  const strong = Math.abs(score) >= 7;
  const moderate = Math.abs(score) >= 3;

  switch (axis) {
    case "economic":
      if (strong && score > 0)
        return "Forte preferência por mercado, concorrência e menor intervenção estatal.";
      if (moderate && score > 0)
        return "Inclinação a soluções de mercado com regulação moderada.";
      if (strong && score < 0)
        return "Defesa intensa da atuação estatal, redistribuição e proteção social.";
      if (moderate && score < 0)
        return "Tendência a políticas estatais e maior regulação econômica.";
      return "Equilíbrio entre atuação do Estado e do mercado conforme o contexto.";
    case "social":
      if (strong && score > 0)
        return "Valorização de normas tradicionais, autoridade e regulação de costumes.";
      if (moderate && score > 0)
        return "Tendência a conservar costumes e limitar mudanças bruscas em pautas sociais.";
      if (strong && score < 0)
        return "Defesa forte de liberdades civis, autonomia individual e pluralismo.";
      if (moderate && score < 0)
        return "Inclinação liberal em costumes, com pouca interferência estatal.";
      return "Postura moderada em temas de costumes e liberdades individuais.";
    case "community":
      if (strong && score > 0)
        return "Prioriza identidade coletiva, coesão social e laços nacionais.";
      if (moderate && score > 0)
        return "Valoriza raízes locais e deveres com a comunidade.";
      if (strong && score < 0)
        return "Visão cosmopolita, foco no indivíduo e na cooperação internacional.";
      if (moderate && score < 0)
        return "Inclinação universalista, com identidades mais fluidas e abertas.";
      return "Equilibra pertencimento comunitário com abertura cosmopolita.";
    case "method":
      if (strong && score > 0)
        return "Prefere mudanças graduais, prudentes e institucionalizadas.";
      if (moderate && score > 0)
        return "Favorece reformas incrementais e pactuadas.";
      if (strong && score < 0)
        return "Aceita transformações mais rápidas, experimentação e reformismo intenso.";
      if (moderate && score < 0)
        return "Inclinação a intervenções planejadas e inovação mais acelerada.";
      return "Ajusta entre gradualismo e mudança rápida conforme o tema.";
    case "pragmatism":
      if (strong && score > 0)
        return "Orientação fortemente pragmática: prioriza resultados práticos e negociáveis.";
      if (moderate && score > 0)
        return "Mais pragmático que idealista, aberto a acordos para avançar.";
      if (strong && score < 0)
        return "Visão idealista ou utópica, priorizando princípios sobre a negociação.";
      if (moderate && score < 0)
        return "Inclinação idealista, com menos foco em compromissos imediatos.";
      return "Equilibra pragmatismo e idealismo dependendo do contexto.";
    default:
      return "Eixo fora do conjunto principal.";
  }
}

function splitShortDescription(text) {
  if (!text) return [];
  const bySemicolon = text.split(";").map((t) => t.trim()).filter(Boolean);
  if (bySemicolon.length >= 2 && bySemicolon.length <= 4) {
    return bySemicolon;
  }

  const sentences = text
    .split(/[.!?]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!sentences.length) return [text.trim()];
  if (sentences.length <= 3) return sentences;

  const chunkSize = Math.ceil(sentences.length / 3);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

function renderShortDescription(containerId, text) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";
  const parts = splitShortDescription(text);

  if (!parts.length) {
    const p = document.createElement("p");
    p.className = "text-sm text-slate-300";
    p.textContent = "Ainda não temos um resumo curto para este perfil.";
    container.appendChild(p);
    return;
  }

  parts.slice(0, 3).forEach((segment) => {
    const p = document.createElement("p");
    p.className = "text-sm text-slate-200";
    p.textContent = segment;
    container.appendChild(p);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fetchQuestions();

  document.getElementById("prev-btn").addEventListener("click", () => {
    if (currentPageIndex > 0) {
      currentPageIndex--;
      renderPage();
    }
  });

  document.getElementById("next-btn").addEventListener("click", () => {
    if (currentPageIndex < pages.length - 1) {
      currentPageIndex++;
      renderPage();
    } else {
      // última página → enviar
      submitAnswers();
    }
  });

  document.getElementById("open-details-btn")?.addEventListener("click", () => {
    showDetailsPage();
  });

  document.getElementById("close-details-btn")?.addEventListener("click", () => {
    hideDetailsPage();
  });

  document.getElementById("restart-btn")?.addEventListener("click", () => {
    resetQuiz();
  });

  document.getElementById("retrieve-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRetrieveSubmit();
  });

  document
    .getElementById("copy-result-key-btn")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      copyResultKeyToClipboard();
    });

  // Se veio da landing com uma chave, tenta recuperar automaticamente
  const pendingKey = sessionStorage.getItem("ideo-pending-key");
  if (pendingKey) {
    sessionStorage.removeItem("ideo-pending-key");
    loadResultById(pendingKey)
      .then((data) => {
        answers = data.answers || {};
        handleResult(data);
        setInlineMessage("result-key-message", "Resultado recuperado pela sua chave IDEO.");
      })
      .catch((err) => {
        console.error(err);
        const quizMsg = document.getElementById("quiz-message");
        if (quizMsg) {
          quizMsg.textContent = "Não foi possível recuperar o resultado com essa chave.";
          quizMsg.classList.remove("hidden");
        }
      });
  }
});

async function fetchQuestions() {
  try {
    const res = await fetch("/api/questions");
    if (!res.ok) {
      throw new Error("Erro ao carregar perguntas");
    }
    const data = await res.json();

    // backend pode retornar lista direta ou objeto { questions: [...] }
    if (Array.isArray(data)) {
      questions = data;
    } else if (Array.isArray(data.questions)) {
      questions = data.questions;
    } else {
      throw new Error("Formato inesperado de perguntas");
    }

    buildPagesByAxis();
    renderPage();
  } catch (err) {
    console.error(err);
    const container = document.getElementById("questions-container");
    container.innerHTML =
      '<p class="text-sm text-red-300">Não foi possível carregar as perguntas. Tente recarregar a página.</p>';
  }
}

function buildPagesByAxis() {
  // agrupa questions por eixo
  const byAxis = {};
  for (const q of questions) {
    const axis = q.axis || "other";
    if (!byAxis[axis]) byAxis[axis] = [];
    byAxis[axis].push(q);
  }

  // ordena pelas chaves que conhecemos
  pages = [];
  for (const axis of axisOrder) {
    if (byAxis[axis]) {
      pages.push({
        axis,
        questions: byAxis[axis],
      });
      delete byAxis[axis];
    }
  }
  // qualquer coisa “sobrando” vai para o final
  for (const axis of Object.keys(byAxis)) {
    pages.push({
      axis,
      questions: byAxis[axis],
    });
  }

  currentPageIndex = 0;
}

function renderPage() {
  if (!pages.length) return;

  const page = pages[currentPageIndex];
  const container = document.getElementById("questions-container");
  const axisTitle = document.getElementById("axis-title");
  const axisDescription = document.getElementById("axis-description");
  const axisPrompt = document.getElementById("axis-prompt");
  const pageIndicator = document.getElementById("page-indicator");
  const progressBar = document.getElementById("progress-bar");
  const nextBtn = document.getElementById("next-btn");
  const prevBtn = document.getElementById("prev-btn");
  const quizMsg = document.getElementById("quiz-message");

  quizMsg.classList.add("hidden");
  quizMsg.textContent = "";

  const axisName = AXIS_LABELS[page.axis] || page.axis;
  axisTitle.textContent = axisName;
  if (axisDescription) {
    axisDescription.textContent =
      AXIS_DESCRIPTIONS[page.axis] ||
      `Texto sobre o eixo "${axisName}"...`;
  }
  if (axisPrompt) {
    axisPrompt.textContent =
      "Responda a cada afirmação de acordo com o que você pensa.";
  }
  pageIndicator.textContent = `Eixo ${currentPageIndex + 1}/${pages.length}`;

  const progress = ((currentPageIndex + 1) / pages.length) * 100;
  progressBar.style.width = `${progress}%`;

  // botão anterior / próximo
  prevBtn.disabled = currentPageIndex === 0;
  if (currentPageIndex === pages.length - 1) {
    nextBtn.textContent = "Ver resultado";
  } else {
    nextBtn.textContent = "Próximo eixo →";
  }

  // renderizar perguntas
  container.innerHTML = "";

  page.questions.forEach((q, idx) => {
    const qId = String(q.id ?? q.key ?? `q${idx}`);
    const currentValue = answers[qId];

    const wrapper = document.createElement("div");
    wrapper.className =
      "bg-slate-900/80 border border-slate-800 rounded-xl p-3 md:p-4";

    const title = document.createElement("p");
    title.className = "text-sm md:text-base font-medium text-slate-100 mb-2";
    title.textContent = q.text || q.question || "(pergunta sem texto)";
    wrapper.appendChild(title);

    const likertControl = createLikertControl(qId, q.axis || page.axis, currentValue, (newValue) => {
      answers[qId] = newValue;
    });

    wrapper.appendChild(likertControl);
    container.appendChild(wrapper);
  });

  // garante foco e leitura da explicação do eixo ao trocar de página
  requestAnimationFrame(scrollToQuizTop);
}

async function submitAnswers() {
  const quizMsg = document.getElementById("quiz-message");
  if (quizMsg) {
    quizMsg.classList.add("hidden");
  }

  try {
    // se não respondeu nada, ainda assim enviamos — backend já trata como "inconclusivo"
    const payload = { answers };

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Erro ao enviar respostas");
    }

    const data = await res.json();

    let resultId = null;
    try {
      resultId = await saveResultToServer({
        answers,
        axes: data.axes,
        profile: data.profile,
      });
      setInlineMessage(
        "result-key-message",
        "Chave gerada com sucesso. Guarde para recuperar o resultado depois."
      );
    } catch (err) {
      console.error(err);
      setInlineMessage(
        "result-key-message",
        "Não foi possível gerar a chave agora. Seu resultado continua visível nesta sessão.",
        { error: true }
      );
    }

    handleResult({ ...data, result_id: resultId, answers });
  } catch (err) {
    console.error(err);
    quizMsg.textContent =
      "Ocorreu um erro ao calcular o resultado. Tente novamente em instantes.";
    quizMsg.classList.remove("hidden");
  }
}

async function saveResultToServer({ answers, axes, profile }) {
  const payload = {
    answers,
    scores: axes || {},
    profile_key: profile?.key || "",
    profile_label: profile?.label || "",
    locale: navigator.language || "pt-BR",
    device: detectDeviceType(),
  };

  const res = await fetch("/api/save_result", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Erro ao salvar resultado.");
  }

  const data = await res.json();
  return data.result_id;
}

async function handleRetrieveSubmit() {
  const input = document.getElementById("retrieve-input");
  if (!input) return;
  const rawValue = normalizeResultId(input.value);

  if (!rawValue) {
    setInlineMessage("retrieve-message", "Digite uma chave IDEO para recuperar o resultado.", {
      error: true,
    });
    return;
  }

  if (!RESULT_ID_REGEX.test(rawValue)) {
    setInlineMessage(
      "retrieve-message",
      "Formato inválido. Use IDEO-XXXX-YYYY (letras e números).",
      { error: true }
    );
    return;
  }

  setInlineMessage("retrieve-message", "Buscando resultado...");
  try {
    const data = await loadResultById(rawValue);
    answers = data.answers || {};
    handleResult(data);
    setInlineMessage("retrieve-message", "Resultado carregado com sucesso.");
  } catch (err) {
    console.error(err);
    setInlineMessage(
      "retrieve-message",
      "Chave não encontrada. Confira e tente novamente.",
      { error: true }
    );
  }
}

async function loadResultById(resultId) {
  const res = await fetch(`/api/result/${encodeURIComponent(resultId)}`);
  if (!res.ok) {
    throw new Error("Resultado não encontrado.");
  }
  return res.json();
}

function handleResult(data) {
  const axes = data.axes || {};
  const profile = data.profile || {};
  const resultId = data.result_id || data.id || null;

  // salva para uso na página de detalhes
  latestResult = { axes, profile, answers: data.answers || answers };
  latestResultId = resultId;
  updateResultKeyDisplay(resultId);
  if (resultId) {
    setInlineMessage(
      "result-key-message",
      "Guarde esta chave para consultar seu resultado depois."
    );
  }
  hideDetailsPage();

  // sincroniza respostas atuais caso tenha vindo de uma recuperação
  if (data.answers) {
    answers = data.answers;
  }

  // exibir resultado simples
  const simpleSection = document.getElementById("simple-result-section");
  const labelEl = document.getElementById("result-label");
  const taglineEl = document.getElementById("result-tagline");
  const shortEl = document.getElementById("result-short");
  const quizSection = document.getElementById("quiz-section");
  const axisHeader = document.getElementById("axis-header");

  // troca a visualização: esconde questionário e mostra a página de resultado simples
  if (quizSection) {
    quizSection.classList.add("hidden");
  }
  if (axisHeader) {
    axisHeader.classList.add("hidden");
  }
  if (simpleSection) {
    simpleSection.classList.remove("hidden");
  }

  labelEl.textContent = profile.label || "Perfil não identificado";
  taglineEl.textContent = profile.tagline || "";
  shortEl.textContent =
    profile.description_short ||
    "Não foi possível gerar uma descrição resumida para este perfil.";

  renderQuadrantChart(axes);

  const detailsBtn = document.getElementById("open-details-btn");
  detailsBtn?.classList.remove("hidden");
  simpleSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuadrantChart(axes) {
  const canvas = document.getElementById("quadrantChart");
  const fallback = document.getElementById("chart-fallback");
  if (!canvas) return;

  const econ = axes ? getAxisNumber(axes.economic) : null;
  const soc = axes ? getAxisNumber(axes.social) : null;
  const hasAxes = econ !== null && soc !== null;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (!hasAxes) {
    if (fallback) fallback.classList.remove("hidden");
    return;
  }

  if (fallback) fallback.classList.add("hidden");

  const quadrantLines = {
    id: "quadrantLines",
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const centerX = scales.x.getPixelForValue(0);
      const centerY = scales.y.getPixelForValue(0);

      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1;
      // linha vertical
      ctx.beginPath();
      ctx.moveTo(centerX, chartArea.top);
      ctx.lineTo(centerX, chartArea.bottom);
      ctx.stroke();
      // linha horizontal
      ctx.beginPath();
      ctx.moveTo(chartArea.left, centerY);
      ctx.lineTo(chartArea.right, centerY);
      ctx.stroke();
      ctx.restore();
    },
  };

  const ctx = canvas.getContext("2d");
  chartInstance = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Posição",
          data: [{ x: econ, y: soc }],
          backgroundColor: "rgba(99, 102, 241, 0.9)",
          borderColor: "rgba(129, 140, 248, 0.9)",
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
      },
      scales: {
        x: {
          min: -20,
          max: 20,
          title: {
            display: true,
            text: "Economia (Estado ↔ Mercado)",
            color: "#cbd5e1",
          },
          grid: {
            color: "rgba(148, 163, 184, 0.2)",
          },
        },
        y: {
          min: -20,
          max: 20,
          title: {
            display: true,
            text: "Costumes / Liberdades",
            color: "#cbd5e1",
          },
          grid: {
            color: "rgba(148, 163, 184, 0.2)",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `Econ: ${ctx.raw.x}, Social: ${ctx.raw.y}`,
          },
        },
      },
    },
    plugins: [quadrantLines],
  });
}

function renderRadarChart(axes) {
  const canvas = document.getElementById("radarChart");
  const fallback = document.getElementById("radarChartFallback");
  if (!canvas) return;

  const hasValues = axisOrder.some(
    (axis) => axes && getAxisNumber(axes[axis]) !== null
  );

  if (radarChartInstance) {
    radarChartInstance.destroy();
    radarChartInstance = null;
  }

  if (!hasValues) {
    fallback?.classList.remove("hidden");
    return;
  }

  fallback?.classList.add("hidden");

  const labels = axisOrder.map(
    (axis) => RADAR_POINT_LABELS[axis] || AXIS_LABELS[axis] || axis
  );
  const values = axisOrder.map((axis) => getAxisNumber(axes[axis]) ?? 0);

  const maxAbs = Math.max(...values.map((val) => Math.abs(val)), 10);
  const suggestedMax = Math.ceil((maxAbs + 2) / 5) * 5;
  const tickStep = Math.max(Math.round(suggestedMax / 4), 5);
  const tooltipLabelForIndex = (index) =>
    AXIS_LABELS[axisOrder[index]] || axisOrder[index];

  const ctx = canvas.getContext("2d");
  radarChartInstance = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Pontuação por eixo",
          data: values,
          backgroundColor: "rgba(99, 102, 241, 0.2)",
          borderColor: "rgba(99, 102, 241, 0.8)",
          borderWidth: 2,
          pointBackgroundColor: "#c7d2fe",
          pointBorderColor: "#6366f1",
          pointHoverBackgroundColor: "#fff",
          pointHoverBorderColor: "#6366f1",
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          suggestedMin: -suggestedMax,
          suggestedMax,
          beginAtZero: false,
          angleLines: {
            color: "rgba(148, 163, 184, 0.25)",
          },
          grid: {
            color: "rgba(148, 163, 184, 0.15)",
          },
          pointLabels: {
            color: "#e2e8f0",
            font: { size: 11 },
            callback: (_, index) => labels[index],
          },
          ticks: {
            display: true,
            stepSize: tickStep,
            color: "#cbd5e1",
            backdropColor: "rgba(15, 23, 42, 0.4)",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${tooltipLabelForIndex(ctx.dataIndex)}: ${ctx.formattedValue}`,
          },
        },
      },
    },
  });
}

function fillList(elementId, items) {
  const ul = document.getElementById(elementId);
  if (!ul) return;

  ul.innerHTML = "";

  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "Sem dados específicos para este perfil.";
    li.className = "text-slate-500";
    ul.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

function fillAxisList(axes) {
  const ul = document.getElementById("details-axis-list");
  if (!ul) return;

  ul.innerHTML = "";

  const axisKeys = axisOrder.filter((axis) => axis in axes);
  if (!axisKeys.length) {
    const li = document.createElement("li");
    li.textContent = "Sem pontuação calculada para exibir.";
    li.className = "text-slate-500";
    ul.appendChild(li);
    return;
  }

  axisKeys.forEach((axis) => {
    const li = document.createElement("li");
    const axisLabel = AXIS_LABELS[axis] || axis;
    const value = getAxisNumber(axes[axis]);

    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2";

    const labelEl = document.createElement("span");
    labelEl.className = "font-medium text-slate-100";
    labelEl.textContent = axisLabel;

    const valueEl = document.createElement("span");
    valueEl.className = "text-indigo-300 font-semibold";
    valueEl.textContent = formatAxisValue(value);

    row.appendChild(labelEl);
    row.appendChild(valueEl);

    const interpretation = document.createElement("p");
    interpretation.className = "text-xs text-slate-400 mt-1";
    interpretation.textContent = interpretAxisScore(axis, value);

    li.className =
      "bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1";
    li.appendChild(row);
    li.appendChild(interpretation);
    ul.appendChild(li);
  });
}

function fillWorldviewSections(descriptionSplit = {}) {
  const mapping = {
    economic: "details-worldview-economic",
    social: "details-worldview-social",
    community: "details-worldview-community",
    method: "details-worldview-method",
    pragmatism: "details-worldview-pragmatism",
  };

  Object.entries(mapping).forEach(([key, elementId]) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent =
      (descriptionSplit && descriptionSplit[key]) ||
      "Sem descrição específica para este ponto.";
  });
}

function renderExamplesList(examples) {
  const ul = document.getElementById("details-examples-list");
  if (!ul) return;

  ul.innerHTML = "";

  if (!examples || !examples.length) {
    const li = document.createElement("li");
    li.className = "text-slate-500";
    li.textContent = "Ainda não há exemplos cadastrados para este perfil.";
    ul.appendChild(li);
    return;
  }

  examples.forEach((ex) => {
    const li = document.createElement("li");
    li.className = "text-slate-200 leading-relaxed";
    li.textContent = ex;
    ul.appendChild(li);
  });
}

function showDetailsPage() {
  if (!latestResult) return;

  const { axes, profile } = latestResult;
  const section = document.getElementById("details-section");
  if (!section) return;

  document.getElementById("details-profile-label").textContent =
    profile.label || "Perfil não identificado";
  document.getElementById("details-profile-tagline").textContent =
    profile.tagline || "";

  renderShortDescription("details-short-block", profile.description_short);
  fillAxisList(axes || {});
  fillWorldviewSections(profile.description_long_split || {});
  fillList("details-authors-classic-list", profile.authors?.classic || []);
  fillList(
    "details-authors-international-list",
    profile.authors?.modern_international || []
  );
  fillList(
    "details-authors-national-list",
    profile.authors?.modern_national || []
  );
  renderExamplesList(profile.examples || []);
  renderRadarChart(axes || {});

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideDetailsPage() {
  const section = document.getElementById("details-section");
  if (section) {
    section.classList.add("hidden");
  }
}

function resetQuiz() {
  answers = {};
  latestResult = null;
  latestResultId = null;
  currentPageIndex = 0;
  hideDetailsPage();
  const simple = document.getElementById("simple-result-section");
  const quizSection = document.getElementById("quiz-section");
  const axisHeader = document.getElementById("axis-header");
  if (simple) {
    simple.classList.add("hidden");
  }
  if (quizSection) {
    quizSection.classList.remove("hidden");
  }
  if (axisHeader) {
    axisHeader.classList.remove("hidden");
  }
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (radarChartInstance) {
    radarChartInstance.destroy();
    radarChartInstance = null;
  }
  updateResultKeyDisplay(null);
  setInlineMessage("result-key-message", "");
  const keyBlock = document.getElementById("result-key-block");
  keyBlock?.classList.add("hidden");
  renderPage();
}

function scrollToQuizTop() {
  const header = document.getElementById("axis-header");
  if (!header) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  header.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    header.focus({ preventScroll: true });
  } catch (err) {
    header.focus();
  }
}
