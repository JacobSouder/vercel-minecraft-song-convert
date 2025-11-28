const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");
const buildBtn = document.getElementById("buildBtn");
const statusEl = document.getElementById("status");

const packNameInput = document.getElementById("packName");
const packDescInput = document.getElementById("packDesc");
const engineVersionInput = document.getElementById("engineVersion");

let files = [];

fileInput.addEventListener("change", (e) => {
  files = Array.from(e.target.files || []);
  renderFileList();
});

function renderFileList() {
  if (!files.length) {
    fileListEl.innerHTML = "<i>No files selected.</i>";
    return;
  }
  fileListEl.innerHTML = files
    .map((f, i) => `<div>${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)</div>`)
    .join("");
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

buildBtn.addEventListener("click", async () => {
  if (!files.length) {
    alert("Add some MP3 files first.");
    return;
  }

  const packName = packNameInput.value.trim() || "Custom Music Pack";
  const packDesc = packDescInput.value.trim() || "Custom music pack";
  const engineVer = engineVersionInput.value.trim() || "1.21.0";

  const formData = new FormData();
  formData.append("packName", packName);
  formData.append("packDesc", packDesc);
  formData.append("engineVersion", engineVer);

  files.forEach((file) => {
    formData.append("tracks", file, file.name);
  });

  buildBtn.disabled = true;
  setStatus("Uploading and building pack on server...");

  try {
    const res = await fetch("/api/build-pack", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("API error:", text);
      setStatus("Error from server. Check console.");
      buildBtn.disabled = false;
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom_music.mcpack";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Done! .mcpack downloaded.");
  } catch (err) {
    console.error(err);
    setStatus("Network or server error. Check console.");
  } finally {
    buildBtn.disabled = false;
  }
});
