const $ = (s) => document.querySelector(s);
const factory = window.RigFactoryPresets || [];
const factoryCount = factory.length;
const native = window.RigAndroid || null;
let nativeLive = false,
  nativeLibraryReady = false,
  selectedIrId = "studio-reference.wav",
  nativeIrs = [],
  webImportedIrs = [];
const validValues = (v) =>
  Array.isArray(v) &&
  v.length === 6 &&
  v.every((n) => Number.isFinite(n) && n >= 0 && n <= 10);
let userPresets = [];
try {
  const raw = JSON.parse(
    localStorage.getItem("rig-user-presets") ||
      (native ? native.getSavedPresets() : "[]") ||
      "[]",
  );
  if (Array.isArray(raw))
    userPresets = raw.filter(
      (p) => p && typeof p.name === "string" && validValues(p.values),
    );
} catch {}
const presets = [...factory, ...userPresets];
try {
  const saved = JSON.parse(localStorage.getItem("rig-favorites") || "null");
  if (Array.isArray(saved))
    presets.forEach((p) => (p.favorite = saved.includes(p.name)));
} catch {}
const pedalDefs = [
  {
    id: "comp",
    name: "Squeeze",
    subtitle: "COMPRESSOR",
    caption: "A LITTLE MORE SUSTAIN",
    params: ["SUSTAIN", "AMOUNT"],
    help: ["Sustentação das notas", "Intensidade da compressão"],
    values: [4, 6],
    on: true,
  },
  {
    id: "drive",
    name: "Rust",
    subtitle: "OVERDRIVE",
    caption: "WARM. ROUGH. BEAUTIFUL.",
    params: ["DRIVE", "TONE"],
    help: ["Intensidade da distorção", "Brilho do overdrive"],
    values: [3.5, 5],
    on: true,
  },
  {
    id: "tape",
    name: "Daytrip",
    subtitle: "TAPE ECHO",
    caption: "LET IT COME BACK AROUND",
    params: ["TIME", "REPEAT"],
    help: ["Intervalo entre ecos", "Quantidade de repetições"],
    values: [4, 3],
    on: true,
  },
  {
    id: "room",
    name: "Somewhere",
    subtitle: "ROOM REVERB",
    caption: "A LITTLE ROOM TO BREATHE",
    params: ["SPACE", "MIX"],
    help: ["Tamanho do ambiente", "Quantidade de reverberação"],
    values: [5, 2.5],
    on: true,
  },
];
let current = 0,
  values = [],
  pedalState = [],
  ampOn = true,
  bypassed = false,
  model = "british",
  filter = "all",
  bankFilter = "all",
  toastTimer,
  comparing = false,
  comparisonSnapshot = null;
const collapsedModules = [true, true, false, false];
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast(
      "Não foi possível salvar no navegador. Libere o armazenamento e tente novamente.",
    );
    return false;
  }
}
function renderPresets() {
  const q = $("#search").value.trim().toLocaleLowerCase("pt-BR");
  const list = $("#presets");
  list.replaceChildren();
  $("#preset-total").textContent = String(presets.length).padStart(2, "0");
  let count = 0;
  presets.forEach((p, i) => {
    if (
      !p.name.toLocaleLowerCase("pt-BR").includes(q) ||
      (filter === "favorites" && !p.favorite) ||
      (bankFilter !== "all" && (p.model || "british") !== bankFilter)
    )
      return;
    count++;
    const button = document.createElement("button");
    button.className = `preset-item ${i === current ? "selected" : ""}`;
    button.setAttribute("aria-pressed", String(i === current));
    const number = document.createElement("span");
    number.className = "preset-index";
    number.textContent = String(i + 1).padStart(2, "0");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = p.name;
    const tag = document.createElement("small");
    tag.textContent = typeof p.tag === "string" ? p.tag : "CUSTOM · USER";
    text.append(title, tag);
    const arrow = document.createElement("span");
    arrow.className = "preset-arrow";
    arrow.innerHTML =
      '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 14 14 4M4 4h10v10"/></svg>';
    button.append(number, text, arrow);
    button.addEventListener("click", () => loadPreset(i));
    list.append(button);
  });
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "Nenhum timbre aqui. Tente outro nome ou selecione Todos.";
    list.append(empty);
  }
}
function dial({ id, label, help, value, onChange, pedal = false }) {
  const el = document.createElement("div");
  el.className = "dial-control";
  el.innerHTML = `<div class="dial-track"><div class="dial-face"></div><input id="${id}" type="range" min="0" max="10" step="0.1"></div><label class="dial-label" for="${id}">${label}</label><output for="${id}"></output><input class="fine-slider" type="range" min="0" max="10" step="0.1">`;
  const inputs = el.querySelectorAll("input");
  inputs[0].setAttribute("aria-label", help);
  inputs[1].setAttribute("aria-label", `${help} · ajuste fino`);
  inputs.forEach((input) => {
    input.value = value;
    input.title = help;
    input.addEventListener("input", () => {
      const n = Number(input.value);
      inputs.forEach((item) => {
        item.value = n;
        item.setAttribute("aria-valuetext", `${n.toFixed(1)} de 10`);
      });
      el.querySelector("output").value = n.toFixed(1);
      el.querySelector(".dial-face").style.transform =
        `rotate(${-135 + n * 27}deg)`;
      el.querySelector(".dial-track").style.setProperty(
        "--angle",
        `${n * 27}deg`,
      );
      onChange(n);
      updateAudio();
    });
  });
  el.querySelector("output").value = Number(value).toFixed(1);
  el.querySelector(".dial-face").style.transform =
    `rotate(${-135 + value * 27}deg)`;
  el.querySelector(".dial-track").style.setProperty(
    "--angle",
    `${value * 27}deg`,
  );
  return el;
}
function renderControls() {
  const labels = ["Ganho", "Graves", "Médios", "Agudos", "Presença", "Volume"];
  const helps = [
    "Distorção do amplificador",
    "Graves",
    "Médios",
    "Agudos",
    "Presença",
    "Volume do amplificador",
  ];
  $("#amp-controls").replaceChildren(
    ...values.map((value, i) =>
      dial({
        id: `amp-${i}`,
        label: labels[i],
        help: helps[i],
        value,
        onChange: (n) => (values[i] = n),
      }),
    ),
  );
}
function renderPedals() {
  const categories = ["COMPRESSOR", "OVERDRIVE", "TAPE DELAY", "STUDIO REVERB"];
  const descriptions = [
    "Dynamic sustain processor",
    "Vintage drive circuit",
    "Analog-style tape echoes",
    "Room ambience processor",
  ];
  const parameters = [
    ["SUSTAIN", "AMOUNT"],
    ["DRIVE", "TONE"],
    ["TIME", "FEEDBACK"],
    ["SPACE", "MIX"],
  ];
  $("#pre-effects").replaceChildren();
  $("#pedals").replaceChildren();
  pedalDefs.forEach((p, i) => {
    const state = pedalState[i],
      el = document.createElement("article");
    el.className = `pedal ${p.id} ${state.on ? "" : "disabled"} ${collapsedModules[i] ? "collapsed" : ""}`;
    el.innerHTML = `<div class="pedal-row"><button class="footswitch" aria-pressed="${state.on}"><span class="power-led"></span></button><div class="pedal-identity"><h3 class="pedal-name">${p.name}</h3><span class="pedal-category">${categories[i]}</span><p class="pedal-description">${descriptions[i]}</p></div><div class="pedal-dials" id="pedal-body-${i}"></div><span class="pedal-number">FX 0${i + 1}</span><button class="module-collapse" aria-label="${collapsedModules[i] ? "Expandir" : "Recolher"} ${p.name}" aria-expanded="${!collapsedModules[i]}" aria-controls="pedal-body-${i}">${collapsedModules[i] ? "+" : "−"}</button></div>`;
    p.params.forEach((_, j) =>
      el.querySelector(".pedal-dials").append(
        dial({
          id: `pedal-${i}-${j}`,
          label: parameters[i][j],
          help: p.help[j],
          value: state.values[j],
          onChange: (n) => (state.values[j] = n),
          pedal: true,
        }),
      ),
    );
    const button = el.querySelector(".footswitch");
    button.setAttribute(
      "aria-label",
      `${state.on ? "Desligar" : "Ligar"} ${p.name}`,
    );
    button.addEventListener("click", () => {
      state.on = !state.on;
      renderPedals();
      renderComponents();
      connectAudio();
      updateAudio();
    });
    el.querySelector(".module-collapse").addEventListener("click", () => {
      collapsedModules[i] = !collapsedModules[i];
      renderPedals();
    });
    $(i < 2 ? "#pre-effects" : "#pedals").append(el);
  });
}
function renderComponents() {
  renderLive();
  const list = $("#component-list");
  list.replaceChildren();
  const entries = [
    {
      name: "Signature Amplifier",
      on: ampOn,
      action: () => $("#amp-power").click(),
    },
    ...pedalDefs.map((p, i) => ({
      name: p.name,
      on: pedalState[i].on,
      action: () => {
        pedalState[i].on = !pedalState[i].on;
        renderPedals();
        renderComponents();
        connectAudio();
        updateAudio();
      },
    })),
  ];
  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "component-button";
    button.setAttribute("aria-pressed", String(entry.on));
    const lamp = document.createElement("i");
    const name = document.createTextNode(entry.name);
    const state = document.createElement("span");
    state.textContent = entry.on ? "ON" : "OFF";
    button.append(lamp, name, state);
    button.addEventListener("click", entry.action);
    list.append(button);
  });
}
function renderPower() {
  $("#amp-power").setAttribute("aria-pressed", String(ampOn));
  $("#amp-power").setAttribute(
    "aria-label",
    `${ampOn ? "Desligar" : "Ligar"} amplificador`,
  );
  $("#amp-led").classList.toggle("off", !ampOn);
  $("#amp-state-label").textContent = ampOn ? "Ligado" : "Desligado";
}
function renderFavorite() {
  $("#favorite").setAttribute(
    "aria-pressed",
    String(Boolean(presets[current].favorite)),
  );
  $("#favorite").setAttribute(
    "aria-label",
    presets[current].favorite
      ? "Remover dos favoritos"
      : "Adicionar aos favoritos",
  );
}
function renderModel() {
  const names = {
    british: ["BRITISH", "800"],
    american: ["AMERICAN", "65"],
    modern: ["MODERN", "515"],
  };
  $("#amp-model").value = model;
  $("#model-heading").textContent = names[model][0];
  $("#model-number").textContent = names[model][1];
  const copy = {
    british: ["BRITISH COLLECTION", "Ataque marcante. Personalidade de sobra."],
    american: ["AMERICAN COLLECTION", "Som aberto. Clareza em cada nota."],
    modern: ["MODERN COLLECTION", "Mais peso. Mais sustain. Sem limites."],
  };
  $(".amp-panel").dataset.model = model;
  $(".cabinet-module").dataset.model = model;
  $(".model-category").textContent = copy[model][0];
  $("#model-description").textContent = copy[model][1];
}
function loadPreset(index, preserveComparison = false) {
  if (!preserveComparison) {
    comparing = false;
    comparisonSnapshot = null;
    $("#compare").setAttribute("aria-pressed", "false");
    $("#compare").textContent = "Comparar";
  }
  current = index;
  $(".preset-slot").textContent = String(index + 1).padStart(3, "0");
  const p = presets[index];
  values = [...p.values];
  model = ["british", "american", "modern"].includes(p.model)
    ? p.model
    : "british";
  ampOn = p.ampOn !== false;
  pedalState = pedalDefs.map((d, i) => {
    const saved = p.pedals?.[i];
    return {
      on: typeof saved?.on === "boolean" ? saved.on : d.on,
      values:
        Array.isArray(saved?.values) &&
        saved.values.length === 2 &&
        saved.values.every((v) => Number.isFinite(v) && v >= 0 && v <= 10)
          ? [...saved.values]
          : [...d.values],
    };
  });
  $("#master").value = Number.isFinite(p.master)
    ? Math.max(0, Math.min(100, p.master))
    : 60;
  $("#master-value").value = `${$("#master").value}%`;
  $("#mic").value = String([0, 1, 2].includes(p.microphone) ? p.microphone : 0);
  $("#preset-title").textContent = p.name;
  $("#preset-description").textContent =
    typeof p.description === "string"
      ? p.description
      : "Sua combinação. Sua assinatura sonora.";
  renderPresets();
  renderControls();
  renderPedals();
  renderPower();
  selectedIrId = typeof p.irId === "string" ? p.irId : "studio-reference.wav";
  renderIrList();
  if (native && nativeLibraryReady) native.selectIr(selectedIrId);
  applyWebIr();
  renderFavorite();
  renderModel();
  renderComponents();
  connectAudio();
  updateAudio();
}
$("#search").addEventListener("input", renderPresets);
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    renderPresets();
  }),
);
$("#favorite").addEventListener("click", () => {
  presets[current].favorite = !presets[current].favorite;
  store(
    "rig-favorites",
    presets.filter((p) => p.favorite).map((p) => p.name),
  );
  renderFavorite();
  renderPresets();
});
$("#amp-power").addEventListener("click", () => {
  ampOn = !ampOn;
  renderPower();
  renderComponents();
  connectAudio();
  updateAudio();
});
$("#amp-model").addEventListener("change", (e) => {
  model = e.target.value;
  renderModel();
  updateAudio();
});
$("#reset").addEventListener("click", () => {
  loadPreset(current);
  toast("Ajustes originais do timbre restaurados.");
});
$("#global-bypass").addEventListener("click", () => {
  bypassed = !bypassed;
  $("#global-bypass").setAttribute("aria-pressed", String(bypassed));
  $(".rack").classList.toggle("bypassed", bypassed);
  renderLive();
  connectAudio();
  updateAudio();
  toast(
    bypassed
      ? "Bypass ligado: ouvindo o sinal sem efeitos."
      : "Efeitos ligados novamente.",
  );
});
$("#master").addEventListener("input", () => {
  $("#master-value").value = `${$("#master").value}%`;
  updateAudio();
});
$("#mic").addEventListener("change", updateAudio);
$("#save-button").addEventListener("click", () => {
  $("#preset-name").value = "";
  $("#save-dialog").showModal();
});
$("#cancel-save").addEventListener("click", () => $("#save-dialog").close());
$("#save-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#preset-name").value.trim();
  if (!name) {
    $("#preset-name").setCustomValidity("Dê um nome ao seu timbre.");
    $("#preset-name").reportValidity();
    return;
  }
  const p = {
    name,
    tag: "CUSTOM · USER",
    description: "Sua combinação. Sua assinatura sonora.",
    model,
    values: [...values],
    pedals: pedalState.map((p) => ({ on: p.on, values: [...p.values] })),
    ampOn,
    master: Number($("#master").value),
    microphone: Number($("#mic").value),
    irId: selectedIrId,
    favorite: true,
  };
  if (!store("rig-user-presets", [...presets.slice(factoryCount), p])) return;
  if (native)
    native.savePresets(JSON.stringify([...presets.slice(factoryCount), p]));
  presets.push(p);
  store(
    "rig-favorites",
    presets.filter((p) => p.favorite).map((p) => p.name),
  );
  loadPreset(presets.length - 1);
  $("#save-dialog").close();
  toast("Timbre salvo no navegador. Pode voltar quando quiser.");
});
$("#preset-name").addEventListener("input", (e) =>
  e.target.setCustomValidity(""),
);
$("#help").addEventListener("click", () => $("#help-dialog").showModal());
$("#close-help").addEventListener("click", () => $("#help-dialog").close());
// Browser-native preview: a synthesized plucked string, not a sampled guitar or hardware model.
let audio = null,
  playing = false,
  noteTimer = null,
  meterFrame = null,
  noteIndex = 0,
  activeSources = new Set(),
  importedBuffer = null,
  importedName = "",
  loadVersion = 0;
function makeCurve(drive) {
  const amount = drive * 35;
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
function initializeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw Error("unsupported");
  const ctx = new Ctx({ latencyHint: "interactive" });
  const input = ctx.createGain(),
    comp = ctx.createDynamicsCompressor(),
    drive = ctx.createWaveShaper(),
    driveTone = ctx.createBiquadFilter(),
    amp = ctx.createWaveShaper(),
    bass = ctx.createBiquadFilter(),
    mid = ctx.createBiquadFilter(),
    treble = ctx.createBiquadFilter(),
    presence = ctx.createBiquadFilter(),
    cab = ctx.createBiquadFilter(),
    cabIR = ctx.createConvolver(),
    ampGain = ctx.createGain(),
    dryDelay = ctx.createGain(),
    delay = ctx.createDelay(2),
    feedback = ctx.createGain(),
    wetDelay = ctx.createGain(),
    delayMix = ctx.createGain(),
    convolver = ctx.createConvolver(),
    wetRoom = ctx.createGain(),
    roomMix = ctx.createGain(),
    master = ctx.createGain(),
    limiter = ctx.createDynamicsCompressor(),
    analyser = ctx.createAnalyser();
  driveTone.type = "lowpass";
  bass.type = "lowshelf";
  bass.frequency.value = 160;
  mid.type = "peaking";
  mid.frequency.value = 900;
  mid.Q.value = 0.7;
  treble.type = "highshelf";
  treble.frequency.value = 3200;
  presence.type = "peaking";
  presence.frequency.value = 4500;
  cab.type = "lowpass";
  limiter.threshold.value = -8;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  analyser.fftSize = 256;
  cabIR.normalize = false;
  const impulse = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  convolver.buffer = impulse;
  audio = {
    ctx,
    input,
    comp,
    drive,
    driveTone,
    amp,
    bass,
    mid,
    treble,
    presence,
    cab,
    cabIR,
    ampGain,
    dryDelay,
    delay,
    feedback,
    wetDelay,
    delayMix,
    convolver,
    wetRoom,
    roomMix,
    master,
    limiter,
    analyser,
  };
  applyWebIr();
  connectAudio();
  updateAudio();
}
function connectAudio() {
  if (!audio) return;
  const a = audio;
  for (const [key, node] of Object.entries(a))
    if (key !== "ctx" && typeof node.disconnect === "function")
      node.disconnect();
  let tail = a.input;
  const append = (...nodes) => {
    for (const node of nodes) {
      tail.connect(node);
      tail = node;
    }
  };
  if (!bypassed) {
    if (pedalState[0].on) append(a.comp);
    if (pedalState[1].on) append(a.drive, a.driveTone);
    if (ampOn)
      append(
        a.amp,
        a.bass,
        a.mid,
        a.treble,
        a.presence,
        a.cab,
        a.cabIR,
        a.ampGain,
      );
    if (pedalState[2].on) {
      tail.connect(a.dryDelay);
      a.dryDelay.connect(a.delayMix);
      tail.connect(a.delay);
      a.delay.connect(a.feedback);
      a.feedback.connect(a.delay);
      a.delay.connect(a.wetDelay);
      a.wetDelay.connect(a.delayMix);
      tail = a.delayMix;
    }
    if (pedalState[3].on) {
      tail.connect(a.roomMix);
      tail.connect(a.convolver);
      a.convolver.connect(a.wetRoom);
      a.wetRoom.connect(a.roomMix);
      tail = a.roomMix;
    }
  }
  append(a.master, a.limiter, a.analyser);
  a.analyser.connect(a.ctx.destination);
}
function updateAudio() {
  syncNativeSettings();
  if (!audio) return;
  const a = audio,
    t = a.ctx.currentTime;
  const smooth = (param, value) => param.setTargetAtTime(value, t, 0.02);
  a.comp.threshold.value = -12 - pedalState[0].values[0] * 2;
  a.comp.ratio.value = 1 + pedalState[0].values[1];
  a.drive.curve = makeCurve(pedalState[1].values[0] * 0.8);
  smooth(a.driveTone.frequency, 900 + pedalState[1].values[1] * 650);
  a.amp.curve = makeCurve(
    values[0] * { american: 0.2, british: 0.8, modern: 1.5 }[model],
  );
  smooth(a.bass.gain, (values[1] - 5) * 2);
  smooth(a.mid.gain, (values[2] - 5) * 2);
  smooth(a.treble.gain, (values[3] - 5) * 2);
  smooth(a.presence.gain, (values[4] - 5) * 1.5);
  smooth(a.ampGain.gain, values[5] / 10);
  smooth(a.cab.frequency, [6500, 4200, 8000][Number($("#mic").value)]);
  smooth(a.delay.delayTime, 0.06 + pedalState[2].values[0] * 0.065);
  smooth(a.feedback.gain, Math.min(0.7, pedalState[2].values[1] * 0.07));
  smooth(a.wetDelay.gain, 0.25);
  smooth(a.dryDelay.gain, 0.8);
  smooth(
    a.wetRoom.gain,
    (pedalState[3].values[1] / 10) *
      (0.15 + pedalState[3].values[0] / 10) *
      0.7,
  );
  smooth(a.master.gain, (Number($("#master").value) / 100) * 0.4);
}
function pluck() {
  if (!playing) return;
  const a = audio;
  const notes = [110, 164.81, 196, 220, 164.81, 146.83, 130.81, 164.81];
  const f = notes[noteIndex++ % notes.length];
  const duration = 1.4,
    length = Math.floor(a.ctx.sampleRate * duration),
    buffer = a.ctx.createBuffer(1, length, a.ctx.sampleRate),
    data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / a.ctx.sampleRate;
    let wave = 0;
    for (let h = 1; h <= 8; h++)
      wave +=
        (Math.sin(2 * Math.PI * f * h * t) * Math.exp(-t * (2.8 + h * 0.7))) /
        (h * 1.3);
    data[i] = wave * 0.18 * Math.min(1, t / 0.006);
  }
  const source = a.ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(a.input);
  activeSources.add(source);
  source.onended = () => {
    activeSources.delete(source);
    source.disconnect();
  };
  source.start();
}
function drawMeter() {
  if (!playing) return;
  const data = new Float32Array(audio.analyser.fftSize);
  audio.analyser.getFloatTimeDomainData(data);
  const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  $("#meter i").style.width =
    `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
  $("#meter-value").textContent =
    Number.isFinite(db) && db > -90 ? `${db.toFixed(1)} dB` : "−∞ dB";
  $("#output-indicator").classList.toggle("active", rms > 0.001);
  meterFrame = requestAnimationFrame(drawMeter);
}
function stopDemo() {
  playing = false;
  clearInterval(noteTimer);
  cancelAnimationFrame(meterFrame);
  activeSources.forEach((s) => {
    try {
      s.stop();
    } catch {}
  });
  activeSources.clear();
  if (audio) audio.ctx.suspend().catch(() => {});
  $("#play-demo").classList.remove("playing");
  $("#play-icon").textContent = "▶";
  $("#play-text").textContent = "Ouvir timbre";
  $("#engine-label").textContent = "Experimente seu timbre";
  $("#engine-description").textContent = importedBuffer
    ? "Sua gravação pronta para tocar"
    : "Demo sintetizada · Sem entrada de guitarra";
  if (importedBuffer) $("#engine-label").textContent = importedName;
  $("#meter i").style.width = "0";
  $("#meter-value").textContent = "−∞ dB";
  $("#output-indicator").classList.remove("active");
  $("#status-text").textContent = "Pronto";
}
$("#play-demo").addEventListener("click", async () => {
  if (playing) {
    stopDemo();
    return;
  }
  if (nativeLive) {
    toast("Pare a entrada de guitarra antes de ouvir a demo.");
    return;
  }
  const button = $("#play-demo");
  button.disabled = true;
  try {
    if (!audio) initializeAudio();
    await audio.ctx.resume();
    playing = true;
    $("#status-text").textContent = "Reproduzindo";
    noteIndex = 0;
    button.classList.add("playing");
    $("#play-icon").textContent = "■";
    $("#play-text").textContent = "Parar demo";
    $("#engine-label").textContent = "Explorando seu timbre";
    $("#engine-description").textContent =
      "Sequência sintetizada · Efeitos em tempo real";
    if (importedBuffer) {
      const source = audio.ctx.createBufferSource();
      source.buffer = importedBuffer;
      source.loop = true;
      source.connect(audio.input);
      activeSources.add(source);
      source.onended = () => {
        activeSources.delete(source);
        source.disconnect();
      };
      source.start();
      $("#engine-label").textContent = importedName;
      $("#engine-description").textContent =
        "Sua gravação · Reprodução em loop";
    } else {
      pluck();
      noteTimer = setInterval(pluck, 480);
    }
    drawMeter();
  } catch {
    stopDemo();
    toast(
      "Não foi possível iniciar o áudio neste navegador. Você ainda pode ajustar e salvar timbres.",
    );
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("pagehide", stopDemo);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) stopDemo();
});
// Local audio is decoded in memory and is never uploaded.
$("#audio-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const version = ++loadVersion;
  if (file.size > 10 * 1024 * 1024) {
    toast("Escolha um arquivo de áudio de até 10 MB.");
    e.target.value = "";
    return;
  }
  stopDemo();
  $("#audio-file-label").textContent = "Preparando seu áudio…";
  try {
    if (!audio) initializeAudio();
    const buffer = await audio.ctx.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 120)
      throw Error("Use uma gravação de até 2 minutos.");
    if (version !== loadVersion) return;
    importedBuffer = buffer;
    importedName = file.name;
    $("#audio-file-label").textContent = file.name;
    $("#clear-audio").hidden = false;
    $("#engine-label").textContent = file.name;
    $("#engine-description").textContent = "Sua gravação pronta para tocar";
    toast("Áudio carregado. Clique em Ouvir timbre para experimentar.");
  } catch {
    if (version !== loadVersion) return;
    $("#audio-file-label").textContent =
      importedName || "Importe uma gravação de guitarra para ouvir os efeitos.";
    toast(
      "Não foi possível ler esse áudio. Tente um arquivo WAV ou MP3 válido.",
    );
  } finally {
    e.target.value = "";
  }
});
$("#clear-audio").addEventListener("click", () => {
  loadVersion++;
  stopDemo();
  importedBuffer = null;
  importedName = "";
  $("#audio-file-label").textContent =
    "Importe uma gravação de guitarra para ouvir os efeitos.";
  $("#clear-audio").hidden = true;
  $("#engine-label").textContent = "Experimente seu timbre";
  $("#engine-description").textContent =
    "Demo sintetizada · Sem entrada de guitarra";
});
function renderLive() {
  const grid = $("#live-switches");
  if (!grid) return;
  grid.replaceChildren();
  const entries = [
    { name: "Som anterior", action: () => stepPreset(-1) },
    { name: "Próximo som", action: () => stepPreset(1) },
    { name: "Amplificador", on: ampOn, action: () => $("#amp-power").click() },
    ...pedalDefs.map((p, i) => ({
      name: p.name,
      on: pedalState[i].on,
      action: () => {
        pedalState[i].on = !pedalState[i].on;
        renderPedals();
        renderComponents();
        connectAudio();
        updateAudio();
      },
    })),
    { name: "Bypass", on: bypassed, action: () => $("#global-bypass").click() },
  ];
  entries.forEach((entry, i) => {
    const button = document.createElement("button");
    button.className = "live-switch";
    if (entry.on !== undefined)
      button.setAttribute("aria-pressed", String(entry.on));
    const led = document.createElement("i");
    const metal = document.createElement("span");
    metal.className = "live-metal";
    const label = document.createElement("strong");
    label.textContent = entry.name;
    const number = document.createElement("small");
    number.textContent = String(i + 1).padStart(2, "0");
    button.append(number, led, metal, label);
    button.addEventListener("click", entry.action);
    grid.append(button);
  });
}
function showSidebar(components) {
  $("#browser-content").hidden = components;
  $("#components-content").hidden = !components;
  $("#nav-studio").classList.toggle("active", !components);
  $("#nav-library").classList.toggle("active", components);
  $("#nav-studio").setAttribute("aria-pressed", String(!components));
  $("#nav-library").setAttribute("aria-pressed", String(components));
}
$("#nav-studio").addEventListener("click", () => showSidebar(false));
$("#nav-library").addEventListener("click", () => {
  showSidebar(true);
  renderComponents();
});
$("#live-view").addEventListener("click", () => {
  const live = $(".application").classList.toggle("live");
  $("#live-view").setAttribute("aria-pressed", String(live));
  $("#live-view").textContent = live ? "RACK VIEW" : "LIVE VIEW";
});
$("#collapse-all").addEventListener("click", () => {
  const collapse = collapsedModules.some((v) => !v);
  collapsedModules.fill(collapse);
  renderPedals();
  $("#collapse-all").textContent = collapse ? "+" : "−";
  $("#collapse-all").setAttribute(
    "aria-label",
    collapse ? "Expandir efeitos" : "Recolher efeitos",
  );
});
document.querySelectorAll("[data-bank]").forEach((button) =>
  button.addEventListener("click", () => {
    bankFilter = button.dataset.bank;
    $("#search").value = "";
    filter = "all";
    document
      .querySelectorAll("[data-bank]")
      .forEach((b) => b.classList.toggle("selected", b === button));
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === "all");
      b.setAttribute("aria-pressed", String(b.dataset.filter === "all"));
    });
    const index = presets.findIndex(
      (p) => bankFilter === "all" || (p.model || "british") === bankFilter,
    );
    if (index >= 0) loadPreset(index);
    else renderPresets();
  }),
);
function stepPreset(direction) {
  const query = $("#search").value.toLocaleLowerCase("pt-BR");
  const indexes = presets
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) =>
        (bankFilter === "all" || (p.model || "british") === bankFilter) &&
        (filter !== "favorites" || p.favorite) &&
        p.name.toLocaleLowerCase("pt-BR").includes(query),
    )
    .map(({ i }) => i);
  if (!indexes.length) return;
  const pos = indexes.indexOf(current);
  loadPreset(indexes[(pos + direction + indexes.length) % indexes.length]);
}
$("#previous-preset").addEventListener("click", () => stepPreset(-1));
$("#next-preset").addEventListener("click", () => stepPreset(1));
function captureSettings() {
  return {
    values: [...values],
    model,
    ampOn,
    pedals: pedalState.map((p) => ({ on: p.on, values: [...p.values] })),
    master: $("#master").value,
    microphone: $("#mic").value,
    irId: selectedIrId,
  };
}
function applySettings(s) {
  values = [...s.values];
  model = s.model;
  ampOn = s.ampOn;
  pedalState = s.pedals.map((p) => ({ on: p.on, values: [...p.values] }));
  $("#master").value = s.master;
  $("#master-value").value = `${s.master}%`;
  $("#mic").value = s.microphone;
  selectedIrId = s.irId || "studio-reference.wav";
  renderIrList();
  if (native && nativeLibraryReady) native.selectIr(selectedIrId);
  applyWebIr();
  renderControls();
  renderPedals();
  renderPower();
  renderModel();
  renderComponents();
  connectAudio();
  updateAudio();
}
$("#compare").addEventListener("click", () => {
  if (!comparing) {
    comparisonSnapshot = captureSettings();
    loadPreset(current, true);
    comparing = true;
    $("#compare").textContent = "Original";
    toast(
      "Comparação: ouvindo o timbre original. Clique novamente para voltar aos seus ajustes.",
    );
  } else {
    comparing = false;
    applySettings(comparisonSnapshot);
    $("#compare").textContent = "Comparar";
    toast("Seus ajustes restaurados.");
  }
  $("#compare").setAttribute("aria-pressed", String(comparing));
});
function syncNativeSettings() {
  if (!native) return;
  const modelIndex = { british: 0, american: 1, modern: 2 }[model];
  const p = pedalState;
  if (p.length !== 4) return;
  native.setSettings(
    JSON.stringify([
      ...values,
      modelIndex,
      ampOn ? 1 : 0,
      bypassed ? 1 : 0,
      Number($("#master").value) / 100,
      Number($("#mic").value),
      p[0].on ? 1 : 0,
      ...p[0].values,
      p[1].on ? 1 : 0,
      ...p[1].values,
      p[2].on ? 1 : 0,
      ...p[2].values,
      p[3].on ? 1 : 0,
      ...p[3].values,
      -70,
    ]),
  );
}
function builtinIrBuffer(item) {
  const raw = atob(item.base64),
    data = new DataView(Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer);
  const rate = audio.ctx.sampleRate,
    length = Math.max(1, Math.round((item.samples * rate) / item.sampleRate));
  const buffer = audio.ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const position = (i * item.sampleRate) / rate,
      a = Math.min(item.samples - 1, Math.floor(position)),
      b = Math.min(item.samples - 1, a + 1),
      fraction = position - a;
    out[i] =
      (data.getInt16(44 + a * 2, true) * (1 - fraction) +
        data.getInt16(44 + b * 2, true) * fraction) /
      32768;
  }
  return buffer;
}
function applyWebIr() {
  if (!audio) return;
  const item = (window.RigCabinetIrs || []).find((i) => i.id === selectedIrId);
  const imported = webImportedIrs.find((i) => i.id === selectedIrId);
  if (imported?.buffer) audio.cabIR.buffer = imported.buffer;
  else if (item) audio.cabIR.buffer = builtinIrBuffer(item);
  else {
    const identity = audio.ctx.createBuffer(1, 1, audio.ctx.sampleRate);
    identity.getChannelData(0)[0] = 1;
    audio.cabIR.buffer = identity;
  }
}
function renderIrList() {
  const select = $("#cabinet-ir");
  select.replaceChildren();
  const entries =
    native && nativeLibraryReady
      ? nativeIrs
      : [...(window.RigCabinetIrs || []), ...webImportedIrs];
  entries.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
  if (entries.some((i) => i.id === selectedIrId)) select.value = selectedIrId;
  else if (selectedIrId) {
    const missing = document.createElement("option");
    missing.value = selectedIrId;
    missing.textContent = "IR ausente — importe " + selectedIrId;
    missing.disabled = true;
    select.append(missing);
    select.value = selectedIrId;
  }
}
$("#cabinet-ir").addEventListener("change", (e) => {
  selectedIrId = e.target.value;
  if (native) native.selectIr(selectedIrId);
  else applyWebIr();
  toast("Gabinete IR selecionado.");
});
$("#import-ir").addEventListener("click", () => {
  if (native) native.pickIr();
  else $("#ir-file").click();
});
$("#ir-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 4000000) throw Error("Escolha um IR WAV de até 4 MB.");
    const raw = await file.arrayBuffer();
    const bytes = new Uint8Array(raw);
    if (
      String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
      String.fromCharCode(...bytes.slice(8, 12)) !== "WAVE"
    )
      throw Error("Use um IR de gabinete em WAV.");
    if (!audio) initializeAudio();
    const decoded = await audio.ctx.decodeAudioData(raw.slice(0));
    if (decoded.duration > 2)
      throw Error("Use um IR de gabinete de até 2 segundos.");
    const length = Math.min(8192, decoded.length);
    const buffer = audio.ctx.createBuffer(1, length, decoded.sampleRate);
    const out = buffer.getChannelData(0);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const source = decoded.getChannelData(c);
      for (let i = 0; i < length; i++)
        out[i] += source[i] / decoded.numberOfChannels;
    }
    let energy = 0;
    for (const value of out) energy += Math.abs(value);
    if (energy < 1e-9) throw Error("O IR está silencioso.");
    if (energy > 2) for (let i = 0; i < out.length; i++) out[i] *= 2 / energy;
    const id = "local-" + Date.now() + ".wav";
    webImportedIrs.push({ id, name: file.name, buffer });
    selectedIrId = id;
    renderIrList();
    applyWebIr();
    $("#ir-status").textContent =
      "IR importado nesta sessão (até 8192 amostras). No APK, a biblioteca fica salva.";
    toast("IR importado para esta sessão.");
  } catch (error) {
    toast(error.message || "Não foi possível ler esse IR.");
  } finally {
    e.target.value = "";
  }
});
function importPresetArray(items) {
  if (!Array.isArray(items) || items.length > 500) {
    toast("Biblioteca inválida. Use uma lista JSON de até 500 presets.");
    return;
  }
  const valid = items.filter(
    (p) =>
      p &&
      typeof p.name === "string" &&
      p.name.trim() &&
      p.name.length <= 100 &&
      validValues(p.values),
  );
  if (!valid.length) {
    toast("Nenhum preset compatível encontrado.");
    return;
  }
  const custom = [...presets.slice(factoryCount), ...valid];
  if (custom.length > 500) {
    toast("Limite de 500 presets pessoais atingido.");
    return;
  }
  if (!store("rig-user-presets", custom)) return;
  presets.push(...valid);
  if (native) native.savePresets(JSON.stringify(custom));
  renderPresets();
  toast(`${valid.length} timbres importados.`);
}
function exportPresetFile() {
  const blob = new Blob(
    [JSON.stringify(presets.slice(factoryCount), null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rig-user-presets.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#connect-drive").addEventListener("click", () => {
  if (native) native.chooseDriveFolder();
  else
    toast("A seleção de pasta do Google Drive fica disponível no APK Android.");
});
$("#export-library").addEventListener("click", () => {
  if (native) native.exportLibrary();
  else exportPresetFile();
});
$("#import-presets").addEventListener("click", () => {
  if (native) native.importPresets();
  else $("#presets-file").click();
});
$("#presets-file").addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2000000) throw Error("JSON muito grande.");
    importPresetArray(JSON.parse(await file.text()));
  } catch {
    toast("Use um arquivo JSON de presets compatível.");
  } finally {
    e.target.value = "";
  }
});
$("#connect-guitar").addEventListener("click", () => {
  if (!native) {
    toast("Instale o APK Android para usar a interface de áudio USB.");
    return;
  }
  stopDemo();
  syncNativeSettings();
  native.startEngine(
    Number($("#input-device").value),
    Number($("#output-device").value),
  );
  $("#native-status").textContent = "Conectando entrada de áudio…";
});
$("#disconnect-guitar").addEventListener("click", () => {
  if (native) native.stopEngine();
});
if (!native) {
  $("#connect-guitar").title = "Requer o APK Android";
  $("#drive-status").textContent =
    "Prévia web: exportação local. Drive pelo APK.";
} else {
  $("#native-status").textContent =
    "Motor nativo pronto · Conecte sua interface USB";
  native.refreshDevices();
}
window.onRigNativeEvent = (event) => {
  const payload = event.payload;
  if (event.type === "driveSync") {
    $("#drive-status").textContent = String(payload);
  } else if (event.type === "message" || event.type === "error")
    toast(String(payload));
  else if (event.type === "importPresets") importPresetArray(payload);
  else if (event.type === "library") {
    nativeLibraryReady = true;
    nativeIrs = Array.isArray(payload.irs) ? payload.irs : [];
    selectedIrId = payload.selectedIr || selectedIrId;
    renderIrList();
    $("#drive-status").textContent = payload.folderConnected
      ? "Pasta escolhida no Android. A conta é a selecionada no provedor."
      : "Pasta ainda não vinculada";
    $("#ir-status").textContent =
      `${nativeIrs.length} IRs salvos · WAV até 8192 amostras usadas a 48 kHz.`;
  } else if (event.type === "devices") {
    for (const [id, list] of [
      ["input-device", payload.inputs],
      ["output-device", payload.outputs],
    ]) {
      const select = $("#" + id),
        previous = select.value;
      select.replaceChildren();
      const option = document.createElement("option");
      option.value = "0";
      option.textContent = "Padrão do Android";
      select.append(option);
      (list || []).forEach((d) => {
        const o = document.createElement("option");
        o.value = d.id;
        o.textContent =
          d.name +
          " · " +
          ([11, 12, 22].includes(d.type) ? "USB" : "dispositivo");
        select.append(o);
      });
      if ([...select.options].some((o) => o.value === previous))
        select.value = previous;
    }
  } else if (event.type === "engine") {
    const wasLive = nativeLive;
    nativeLive = Boolean(payload.running);
    if (wasLive && !nativeLive) {
      $("#meter i").style.width = "0";
      $("#meter-value").textContent = "−∞ dB";
      $("#output-indicator").classList.remove("active");
      $("#status-text").textContent = "Pronto";
    }
    $("#disconnect-guitar").disabled = !nativeLive;
    $("#connect-guitar").disabled = nativeLive;
    $(".native-indicator").classList.toggle("active", nativeLive);
    $("#native-status").textContent = nativeLive
      ? `48 kHz · buffer ${payload.bufferFrames} frames · xruns ${payload.xruns} (latência não medida)`
      : "Motor nativo parado";
    if (nativeLive) {
      const peak = Math.max(0, Number(payload.level) || 0),
        db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      $("#meter i").style.width =
        Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + "%";
      $("#meter-value").textContent =
        db > -90 ? db.toFixed(1) + " dB" : "−∞ dB";
      $("#output-indicator").classList.toggle("active", peak > 0.001);
      $("#status-text").textContent = "Guitarra ao vivo";
    }
  }
};
loadPreset(0);
