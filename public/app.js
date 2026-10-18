import { authReady, getAccessToken } from "./auth.js";

const $ = (id) => document.getElementById(id);
const script = $("script");
const generate = $("generate");
const status = $("status");
const result = $("result");
let quotaRemaining = 1;
const LIVE_SITE_URL = "https://jamzstudio.github.io/narration-studio/";
const API_BASE = String(window.NARRATION_API_BASE || "").replace(/\/$/, "");
const PART_CHAR_TARGET = 6000;
const apiUrl = (path) => `${API_BASE}${path}`;

const voicePresets = {
  female: {
    young: [["Leda", "جوان و روشن"], ["Aoede", "سبک و روان"], ["Zephyr", "درخشان"]],
    adult: [["Sulafat", "گرم و داستانی"], ["Kore", "محکم و مطمئن"], ["Achernar", "نرم و آرام"]],
    mature: [["Gacrux", "پخته و عمیق"], ["Vindemiatrix", "ملایم"], ["Callirrhoe", "آرام و خودمانی"]]
  },
  male: {
    young: [["Puck", "جوان و پرانرژی"], ["Achird", "صمیمی"], ["Fenrir", "هیجان‌انگیز"]],
    adult: [["Charon", "مستند و آگاه"], ["Iapetus", "شفاف"], ["Schedar", "متعادل"]],
    mature: [["Gacrux", "پخته و عمیق"], ["Rasalgethi", "آگاه و جدی"], ["Algenib", "خش‌دار"]]
  }
};

function ageGroup(age) {
  if (age < 30) return "young";
  if (age < 50) return "adult";
  return "mature";
}

function updateSpeed() {
  const speed = Number($("speed").value);
  $("speedValue").textContent = `${speed.toLocaleString("fa-IR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}×`;
}

function updateVoices() {
  const age = Number($("age").value);
  $("ageValue").textContent = age.toLocaleString("fa-IR");
  const presets = voicePresets[$("gender").value][ageGroup(age)];
  $("voice").replaceChildren(...presets.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${label} — ${value}`;
    return option;
  }));
}

function renderQuota(quota) {
  quotaRemaining = Number(quota.remaining) > 0 ? 1 : 0;
  $("quotaBadge").textContent = quotaRemaining
    ? "امروز ۱ خروجی رایگان داری"
    : "خروجی رایگان امروزت رو ساختی";
  $("quotaBadge").classList.toggle("quota-used", quotaRemaining === 0);
  generate.disabled = quotaRemaining === 0;
  generate.title = quotaRemaining ? "" : "فردا دوباره می‌تونی یه نریشن بسازی.";
}

async function refreshQuota() {
  try {
    await authReady;
    const token = await getAccessToken();
    if (!token) return;
    const response = await fetch(apiUrl("/api/quota"), { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) renderQuota(await response.json());
  } catch {
    // The generation endpoint remains the authoritative quota check.
  }
}

$("gender").addEventListener("change", updateVoices);
$("age").addEventListener("input", updateVoices);
$("speed").addEventListener("input", updateSpeed);
updateSpeed();
updateVoices();
refreshQuota();

function updateScriptCount() {
  const characters = script.value.length;
  const parts = characters ? Math.ceil(characters / PART_CHAR_TARGET) : 0;
  $("counter").textContent = parts > 1
    ? `${characters.toLocaleString("fa-IR")} کاراکتر · حدود ${parts.toLocaleString("fa-IR")} پارت`
    : `${characters.toLocaleString("fa-IR")} کاراکتر`;
}

script.addEventListener("input", updateScriptCount);
updateScriptCount();

function setProgress(percent, message) {
  status.classList.remove("hidden");
  $("liveSiteLink").classList.add("hidden");
  $("progressBar").style.width = `${percent}%`;
  $("progressBar").parentElement.setAttribute("aria-valuenow", String(Math.round(percent)));
  $("progressBar").parentElement.setAttribute("aria-valuemin", "0");
  $("progressBar").parentElement.setAttribute("aria-valuemax", "100");
  $("statusPercent").textContent = `${Math.round(percent).toLocaleString("fa-IR")}٪`;
  $("statusText").textContent = message;
}

function friendlyError(error) {
  const errorText = String(error?.message || "");
  if (window.location.protocol === "file:") {
    return "این نسخه مستقیم از روی فایل باز شده و به سرور وصل نمی‌شه. سایت اصلی رو باز کن و همون‌جا دوباره امتحان کن.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(errorText)) {
    return "به سرور وصل نشدیم. اینترنتت رو بررسی کن و چند لحظه دیگه دوباره امتحان کن.";
  }
  if (/timeout|timed out|aborted/i.test(errorText)) {
    return "ارتباط با سرور زیادی طول کشید. یه بار دیگه امتحان کن.";
  }
  if (/quota storage|reservation expired/i.test(errorText)) {
    return "فعلاً نتونستیم سهمیه امروزت رو بررسی کنیم. چند لحظه دیگه دوباره امتحان کن.";
  }
  return errorText || "یه مشکلی پیش اومد. دوباره امتحان کن.";
}

function showLiveSiteHelp() {
  setProgress(0, friendlyError(new Error("local file")));
  $("liveSiteLink").href = LIVE_SITE_URL;
  $("liveSiteLink").classList.remove("hidden");
}

generate.addEventListener("click", async () => {
  if (!script.value.trim()) {
    setProgress(0, "اول متن نریشنت رو وارد کن.");
    return;
  }
  if (window.location.protocol === "file:") {
    showLiveSiteHelp();
    return;
  }
  generate.disabled = true;
  generate.setAttribute("aria-busy", "true");
  result.classList.add("hidden");
  setProgress(2, "داریم متن رو آماده می‌کنیم…");
  try {
    const token = await getAccessToken();
    if (!token) throw new Error("اول وارد حسابت شو.");
    const response = await fetch(apiUrl("/api/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        script: script.value,
        language: $("language").value,
        gender: $("gender").value,
        age: Number($("age").value),
        speed: Number($("speed").value),
        voice: $("voice").value,
        direction: $("direction").value
      })
    });
    if (!response.body) throw new Error("نتونستیم به سرور وصل بشیم. یه بار دیگه امتحان کن.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "progress") {
          const percent = 5 + (Number(event.current) / Math.max(1, Number(event.total))) * 88;
          setProgress(percent, event.message);
        }
        if (event.type === "error") {
          if (event.code === "DAILY_LIMIT") renderQuota({ remaining: 0 });
          throw new Error(event.message);
        }
        if (event.type === "done") {
          setProgress(100, "نریشنت آماده شد.");
          const audioUrl = apiUrl(event.url);
          $("player").src = audioUrl;
          $("download").href = audioUrl;
          $("download").download = event.filename;
          const minutes = Math.floor(event.seconds / 60);
          const seconds = event.seconds % 60;
          $("resultMeta").textContent = `${minutes}:${String(seconds).padStart(2, "0")} دقیقه · خروجی امروز`;
          result.classList.remove("hidden");
          renderQuota({ remaining: event.remaining });
        }
      }
      if (done) break;
    }
  } catch (error) {
    setProgress(0, friendlyError(error));
  } finally {
    generate.disabled = quotaRemaining === 0;
    generate.removeAttribute("aria-busy");
  }
});
