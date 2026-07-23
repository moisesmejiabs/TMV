const form = document.getElementById("milkRegistrationForm");
const formSection = document.getElementById("formSection");
const successSection = document.getElementById("successSection");
const message = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const otherFormulaField = document.getElementById("otherFormulaField");
const formulaOther = document.getElementById("formulaOther");

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

async function verifySession() {
  try {
    const user = await requestJson("/api/me");
    document.getElementById("userGreeting").textContent =
      `Sesión iniciada como ${user.name || user.email}`;
    formSection.hidden = false;
  } catch {
    location.replace(`/login.html?next=${encodeURIComponent("/milk-giveaway")}`);
  }
}

form.addEventListener("change", (event) => {
  if (event.target.name === "formula_type") updateOtherFormula();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = true;
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  submitButton.disabled = true;
  submitButton.textContent = "Guardando registro…";

  try {
    const result = await requestJson("/api/milk-registrations", {
      method: "POST",
      body: JSON.stringify({
        full_name: data.get("full_name"),
        phone: data.get("phone"),
        baby_name: data.get("baby_name"),
        baby_age_months: Number(data.get("baby_age_months")),
        formula_type: data.get("formula_type"),
        formula_other: data.get("formula_other")
      })
    });
    document.getElementById("confirmationNumber").textContent =
      `Número de confirmación: ${result.registration_id}`;
    formSection.hidden = true;
    successSection.hidden = false;
    successSection.focus();
  } catch (error) {
    if (error.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent("/milk-giveaway")}`);
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
  updateOtherFormula();
  successSection.hidden = true;
  formSection.hidden = false;
  document.getElementById("fullName").focus();
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  location.replace("/login.html");
});

verifySession();
