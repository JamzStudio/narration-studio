import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const configured = !String(window.SUPABASE_URL).includes("YOUR_PROJECT")
  && !String(window.SUPABASE_PUBLISHABLE_KEY).includes("YOUR_SUPABASE");
const supabase = configured ? createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY) : null;
let pendingProfile = null;

const $ = (id) => document.getElementById(id);
const message = (text, error = false) => {
  $("authMessage").textContent = text;
  $("authMessage").classList.toggle("is-error", error);
};
const busy = (button, value) => { button.disabled = value; button.setAttribute("aria-busy", String(value)); };
const toLatinDigits = (value) => String(value)
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const clearPhoneError = () => {
  $("authPhone").setCustomValidity("");
  $("authPhone").removeAttribute("aria-invalid");
  $("phoneError").textContent = "";
  $("phoneError").classList.add("hidden");
};
const selectedCountry = () => $("phoneCountry").selectedOptions[0];
const updatePhoneCountry = () => {
  const option = selectedCountry();
  $("phonePrefix").textContent = option.value;
  $("authPhone").placeholder = option.dataset.example || "شماره تلفن";
  $("phoneHint").textContent = `پیش‌شماره ${option.value} خودکار اضافه می‌شه؛ شماره رو بدون صفر اول بنویس.`;
  clearPhoneError();
};
const normalizedPhone = (showError = false) => {
  const input = $("authPhone");
  const option = selectedCountry();
  const prefixDigits = option.value.replace(/\D/g, "");
  const localDigits = toLatinDigits(input.value).replace(/\D/g, "").replace(/^0+/, "");
  const minimum = Number(option.dataset.min || Math.max(6, 8 - prefixDigits.length));
  const maximum = Number(option.dataset.max || (15 - prefixDigits.length));
  let error = "";
  if (!localDigits) error = "ادامهٔ شماره تلفنت رو وارد کن.";
  else if (localDigits.length < minimum || localDigits.length > maximum) {
    error = `شماره رو بدون پیش‌شماره و صفر اول، بین ${minimum} تا ${maximum} رقم وارد کن.`;
  }
  const fullPhone = `${option.value}${localDigits}`;
  if (!error && !/^\+[1-9][0-9]{7,14}$/.test(fullPhone)) error = "شماره تلفن کامل نیست؛ دوباره بررسیش کن.";
  clearPhoneError();
  if (error) {
    input.setCustomValidity(error);
    input.setAttribute("aria-invalid", "true");
    if (showError) {
      $("phoneError").textContent = error;
      $("phoneError").classList.remove("hidden");
    }
    return null;
  }
  return fullPhone;
};
const unlock = (session) => {
  document.body.classList.toggle("auth-locked", !session);
  $("authGate").classList.toggle("hidden", Boolean(session));
  $("signOut").classList.toggle("hidden", !session);
};

export const authReady = (async () => {
  if (!configured) {
    message("ورود هنوز راه‌اندازی نشده؛ مدیر سایت باید اتصال حساب‌ها رو تنظیم کنه.", true);
    return null;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const { data: profile } = await supabase.from("profiles").select("id,phone").maybeSingle();
  if (!profile?.phone) {
    await supabase.auth.signOut();
    message("برای ورود، ایمیل و شماره تلفنت رو کامل کن.");
    return null;
  }
  unlock(data.session);
  return data.session;
})();

export async function getAccessToken() {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

$("accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return message("ورود هنوز راه‌اندازی نشده.", true);
  const email = $("authEmail").value.trim().toLowerCase();
  const phone = normalizedPhone(true);
  if (!phone) {
    $("authPhone").focus();
    $("authPhone").reportValidity();
    return;
  }
  pendingProfile = {
    email, phone,
    email_marketing_consent: $("emailMarketing").checked,
    sms_marketing_consent: $("smsMarketing").checked
  };
  busy($("sendCode"), true);
  message("داریم کد رو می‌فرستیم…");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  busy($("sendCode"), false);
  if (error) return message("کد فرستاده نشد. ایمیل رو بررسی کن و دوباره امتحان کن.", true);
  $("accountStep").classList.add("hidden");
  $("otpStep").classList.remove("hidden");
  $("otpHint").textContent = `کد ۶ رقمی رو به ${email} فرستادیم.`;
  $("otpCode").focus();
  message("");
});

$("phoneCountry").addEventListener("change", updatePhoneCountry);
$("authPhone").addEventListener("input", () => {
  $("authPhone").value = toLatinDigits($("authPhone").value).replace(/[^0-9 ()-]/g, "");
  clearPhoneError();
});
$("authPhone").addEventListener("blur", () => normalizedPhone(true));
updatePhoneCountry();

$("otpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !pendingProfile) return message("اول ایمیل و شماره‌ات رو وارد کن.", true);
  busy($("verifyCode"), true);
  message("داریم کد رو بررسی می‌کنیم…");
  const { data, error } = await supabase.auth.verifyOtp({ email: pendingProfile.email, token: $("otpCode").value.trim(), type: "email" });
  if (error || !data.user) { busy($("verifyCode"), false); return message("کد درست نیست یا زمانش گذشته. دوباره امتحان کن.", true); }
  const now = new Date().toISOString();
  const profile = { id: data.user.id, ...pendingProfile, privacy_accepted_at: now, consent_version: "2026-08-22-v1", updated_at: now };
  const { error: profileError } = await supabase.from("profiles").upsert(profile);
  const { error: consentError } = await supabase.from("marketing_consent_events").insert({
    user_id: data.user.id, email_consent: pendingProfile.email_marketing_consent,
    sms_consent: pendingProfile.sms_marketing_consent, consent_version: profile.consent_version
  });
  busy($("verifyCode"), false);
  if (profileError || consentError) return message("حسابت تأیید شد، ولی اطلاعات تماس ذخیره نشد. با پشتیبانی تماس بگیر.", true);
  unlock(data.session);
});

$("changeEmail").addEventListener("click", () => {
  $("otpStep").classList.add("hidden"); $("accountStep").classList.remove("hidden"); message("");
});
$("signOut").addEventListener("click", async () => { if (supabase) await supabase.auth.signOut(); location.reload(); });
