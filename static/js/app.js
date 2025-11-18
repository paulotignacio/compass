// app.js

let questions = [];
let pages = []; // cada página = perguntas de um eixo
let currentPageIndex = 0;
let answers = {}; // { questionId: value }
let chartInstance = null;
let radarChartInstance = null;
let latestResult = null; // guarda último resultado para abrir a página de detalhes

// mapa para nomes bonitos dos eixos
const AXIS_LABELS = {
  economic: "Economia",
  social: "Costumes / Liberdades",
  community: "Comunidade / Identidade",
  method: "Método de mudança",
  pragmatism: "Pragmatismo vs Idealismo",
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

function getAxisNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

document.addEventListener("DOMContentLoaded", () => {
  fetchQuestions();

  document.getElementById("prev-btn").addEventListener("click", () => {
    if (currentPageIndex > 0) {
      currentPageIndex--;
      renderPage();
      scrollToQuizTop();
    }
  });

  document.getElementById("next-btn").addEventListener("click", () => {
    if (currentPageIndex < pages.length - 1) {
      currentPageIndex++;
      renderPage();
      scrollToQuizTop();
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
  const axisInfo = document.getElementById("axis-info");

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

    const scaleRow = document.createElement("div");
    scaleRow.className =
      "flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm";

    const options = [
      { label: "Discordo totalmente", value: -2 },
      { label: "Discordo", value: -1 },
      { label: "Neutro / Não sei", value: 0 },
      { label: "Concordo", value: 1 },
      { label: "Concordo totalmente", value: 2 },
    ];

    options.forEach((opt) => {
      const optId = `q_${qId}_${opt.value}`;
      const label = document.createElement("label");
      label.className =
        "flex flex-col items-center gap-1 cursor-pointer text-slate-300";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q_${qId}`;
      input.value = String(opt.value);
      input.id = optId;
      input.className = "accent-indigo-500";
      if (currentValue === opt.value) {
        input.checked = true;
      }

      input.addEventListener("change", () => {
        answers[qId] = parseInt(input.value, 10);
      });

      const spanLabel = document.createElement("span");
      spanLabel.textContent = opt.label;
      spanLabel.className = "text-center";

      label.appendChild(input);
      label.appendChild(spanLabel);

      scaleRow.appendChild(label);
    });

    wrapper.appendChild(scaleRow);
    container.appendChild(wrapper);
  });
}

async function submitAnswers() {
  const quizMsg = document.getElementById("quiz-message");

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
    handleResult(data);
    quizMsg.classList.add("hidden");
  } catch (err) {
    console.error(err);
    quizMsg.textContent =
      "Ocorreu um erro ao calcular o resultado. Tente novamente em instantes.";
    quizMsg.classList.remove("hidden");
  }
}

function handleResult(data) {
  const axes = data.axes || {};
  const profile = data.profile || {};

  // salva para uso na página de detalhes
  latestResult = { axes, profile };
  hideDetailsPage();

  // exibir resultado simples
  const simpleSection = document.getElementById("simple-result-section");
  const labelEl = document.getElementById("result-label");
  const shortEl = document.getElementById("result-short");
  const quizSection = document.getElementById("quiz-section");
  const axisInfo = document.getElementById("axis-info");

  // troca a visualização: esconde questionário e mostra a página de resultado simples
  if (quizSection) {
    quizSection.classList.add("hidden");
  }
  if (axisInfo) {
    axisInfo.classList.add("hidden");
  }
  if (simpleSection) {
    simpleSection.classList.remove("hidden");
  }

  labelEl.textContent = profile.label || "Perfil não identificado";
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

  const hasAxes =
    axes && typeof axes.economic === "number" && typeof axes.social === "number";

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
          data: [{ x: axes.economic, y: axes.social }],
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

  const labels = axisOrder.map((axis) => AXIS_LABELS[axis] || axis);
  const values = axisOrder.map((axis) => getAxisNumber(axes[axis]) ?? 0);

  const maxAbs = Math.max(...values.map((val) => Math.abs(val)), 10);
  const suggestedMax = Math.ceil((maxAbs + 2) / 5) * 5;
  const tickStep = Math.max(Math.round(suggestedMax / 4), 5);

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
            label: (ctx) => `${ctx.label}: ${ctx.formattedValue}`,
          },
        },
      },
    },
  });
}

function fillList(elementId, items) {
  const ul = document.getElementById(elementId);
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
    li.textContent = `${axisLabel}: ${axes[axis]}`;
    li.className = "flex justify-between gap-2";
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
  document.getElementById("details-profile-short").textContent =
    profile.description_short ||
    "Ainda não temos um resumo curto para este perfil.";
  document.getElementById("details-profile-long").textContent =
    profile.description_long ||
    "Sem explicação detalhada disponível para este perfil.";

  fillAxisList(axes || {});
  fillList("details-authors-classic-list", profile.authors_classic || []);
  fillList(
    "details-figures-int-list",
    profile.figures_modern_international || []
  );
  fillList(
    "details-figures-nat-list",
    profile.figures_modern_national || []
  );
  fillList("details-examples-list", profile.examples_practical || []);
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
  currentPageIndex = 0;
  hideDetailsPage();
  const simple = document.getElementById("simple-result-section");
  const quizSection = document.getElementById("quiz-section");
  const axisInfo = document.getElementById("axis-info");
  if (simple) {
    simple.classList.add("hidden");
  }
  if (quizSection) {
    quizSection.classList.remove("hidden");
  }
  if (axisInfo) {
    axisInfo.classList.remove("hidden");
  }
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (radarChartInstance) {
    radarChartInstance.destroy();
    radarChartInstance = null;
  }
  renderPage();
  scrollToQuizTop();
}

function scrollToQuizTop() {
  const quiz = document.getElementById("quiz-section");
  if (quiz) {
    quiz.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
