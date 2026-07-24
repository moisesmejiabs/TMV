const form = document.getElementById("milkRegistrationForm");
const formSection = document.getElementById("formSection");
const successSection = document.getElementById("successSection");
const message = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const otherFormulaField = document.getElementById("otherFormulaField");
const formulaOther = document.getElementById("formulaOther");
const phone = document.getElementById("phone");
const requestCodeButton = document.getElementById("requestCodeButton");
const verificationCodeSection = document.getElementById("verificationCodeSection");
const verificationCode = document.getElementById("verificationCode");
const verifyCodeButton = document.getElementById("verifyCodeButton");
const phoneVerificationStatus = document.getElementById("phoneVerificationStatus");
let verificationId = "";
let phoneVerificationToken = "";
let verifiedPhoneValue = "";
let resendTimer = null;

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function showError(text) {
  message.textContent = text;
  message.hidden = false;
  message.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateOtherFormula() {
  const selected = form.elements.formula_type.value;
  const isOther = selected === "Otra fórmula";
  otherFormulaField.hidden = !isOther;
  formulaOther.required = isOther;
  if (!isOther) formulaOther.value = "";
}

function setVerificationStatus(text, verified = false) {
  phoneVerificationStatus.textContent = text;
  phoneVerificationStatus.classList.toggle("is-verified", verified);
}

function resetPhoneVerification() {
  verificationId = "";
  phoneVerificationToken = "";
  verifiedPhoneValue = "";
  verificationCode.value = "";
  verificationCodeSection.hidden = true;
  phone.readOnly = false;
  requestCodeButton.disabled = false;
  requestCodeButton.textContent = "Enviar código por SMS";
  submitButton.disabled = true;
  setVerificationStatus("");
  if (resendTimer) {
    window.clearInterval(resendTimer);
    resendTimer = null;
  }
}

function startResendCountdown(seconds) {
  let remaining = seconds;
  requestCodeButton.disabled = true;
  requestCodeButton.textContent = `Reenviar en ${remaining} s`;
  if (resendTimer) window.clearInterval(resendTimer);
  resendTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(resendTimer);
      resendTimer = null;
      requestCodeButton.disabled = false;
      requestCodeButton.textContent = "Reenviar código";
      return;
    }
    requestCodeButton.textContent = `Reenviar en ${remaining} s`;
  }, 1000);
}

async function verifySession() {
  try {
    const user = await requestJson("/api/me");
    document.getElementById("userGreeting").textContent =
      `Sesión iniciada como ${user.name || user.email}`;
    formSection.hidden = false;
    document.getElementById("fullName").focus({ preventScroll: true });
  } catch (error) {
    const next = encodeURIComponent("/milk-giveaway");
    window.location.replace(`/login.html?next=${next}`);
  }
}

form.addEventListener("change", (event) => {
  if (event.target.name === "formula_type") updateOtherFormula();
});

phone.addEventListener("input", () => {
  if ((phoneVerificationToken && phone.value !== verifiedPhoneValue) || verificationId) {
    resetPhoneVerification();
    setVerificationStatus("El número cambió. Solicite un código nuevo.");
  }
});

requestCodeButton.addEventListener("click", async () => {
  message.hidden = true;
  if (!phone.reportValidity()) return;
  requestCodeButton.disabled = true;
  requestCodeButton.textContent = "Enviando código…";
  try {
    const result = await requestJson("/api/milk-phone-verification/request", {
      method: "POST",
      body: JSON.stringify({ phone: phone.value })
    });
    verificationId = result.verification_id;
    phoneVerificationToken = "";
    verifiedPhoneValue = "";
    verificationCode.value = "";
    verificationCodeSection.hidden = false;
    setVerificationStatus(`Código enviado al número terminado en ${result.phone_hint}.`);
    startResendCountdown(Number(result.resend_after || 60));
    verificationCode.focus();
  } catch (error) {
    requestCodeButton.disabled = false;
    requestCodeButton.textContent = "Enviar código por SMS";
    showError(error.message);
  }
});

verifyCodeButton.addEventListener("click", async () => {
  message.hidden = true;
  if (!verificationId || !verificationCode.reportValidity()) return;
  verifyCodeButton.disabled = true;
  verifyCodeButton.textContent = "Verificando…";
  try {
    const result = await requestJson("/api/milk-phone-verification/verify", {
      method: "POST",
      body: JSON.stringify({
        verification_id: verificationId,
        code: verificationCode.value
      })
    });
    phoneVerificationToken = result.phone_verification_token;
    verifiedPhoneValue = phone.value;
    phone.readOnly = true;
    verificationCodeSection.hidden = true;
    requestCodeButton.disabled = true;
    requestCodeButton.textContent = "Teléfono verificado";
    submitButton.disabled = false;
    setVerificationStatus("✓ Número de teléfono verificado.", true);
  } catch (error) {
    verificationCode.select();
    showError(error.message);
  } finally {
    verifyCodeButton.disabled = false;
    verifyCodeButton.textContent = "Confirmar código";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = true;

  if (!form.reportValidity()) return;
  if (!phoneVerificationToken || phone.value !== verifiedPhoneValue) {
    showError("Verifique el número de teléfono antes de enviar el registro.");
    return;
  }

  const data = new FormData(form);
  const payload = {
    full_name: data.get("full_name"),
    phone: data.get("phone"),
    baby_name: data.get("baby_name"),
    baby_age_months: Number(data.get("baby_age_months")),
    formula_type: data.get("formula_type"),
    formula_other: data.get("formula_other"),
    phone_verification_token: phoneVerificationToken
  };

  submitButton.disabled = true;
  submitButton.textContent = "Guardando registro…";

  try {
    const result = await requestJson("/api/milk-registrations", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    document.getElementById("confirmationNumber").textContent =
      `Número de confirmación: ${result.registration_id}`;
    formSection.hidden = true;
    successSection.hidden = false;
    successSection.focus();
  } catch (error) {
    if (error.status === 401) {
      const next = encodeURIComponent("/milk-giveaway");
      window.location.replace(`/login.html?next=${next}`);
      return;
    }
    showError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar registro";
  }
});

document.getElementById("anotherRegistration").addEventListener("click", () => {
  form.reset();
  resetPhoneVerification();
  updateOtherFormula();
  successSection.hidden = true;
  formSection.hidden = false;
  window.scrollTo({ top: formSection.offsetTop - 20, behavior: "smooth" });
  document.getElementById("fullName").focus();
});

verifySession();
