let files = [];

document.getElementById("fileInput").addEventListener("change", (e) => {
  files = Array.from(e.target.files);
  renderList();
});

function renderList() {
  const list = document.getElementById("fileList");
  if (!files.length) {
    list.innerHTML = "<i>No files yet.</i>";
    return;
  }
  list.innerHTML = files.map(f => `<div>${f.name}</div>`).join("");
}

function uuid() {
  return crypto.randomUUID();
}

async function mp3ToOgg(arrayBuffer) {
  const audioData = await decodeAudioData(arrayBuffer);

  const sampleRate = audioData.sampleRate;
  const numChannels = audioData.numberOfChannels;
  const length = audioData.length;

  const encoder = new AudioEncoder({
    output: () => {},
    error: e => console.error(e)
  });

  encoder.configure({
    codec: "vorbis",
    sampleRate,
    numberOfChannels: numChannels
  });

  const oggChunks = [];

  encoder.onoutput = chunk => {
    oggChunks.push(chunk.copyTo());
  };

  const frame = new AudioData({
    format: "f32-planar",
    sampleRate,
    numberOfFrames: length,
    numberOfChannels: numChannels,
    timestamp: 0,
    data: audioData
  });

  encoder.encode(frame);
  await encoder.flush();
  encoder.close();

  return new Blob(oggChunks, { type: "audio/ogg" });
}

document.getElementById("buildBtn").addEventListener("click", async () => {
  if (!files.length) {
    alert("Add some MP3 files first.");
    return;
  }

  const status = document.getElementById("status");
  status.textContent = "Converting...";

  const zip = new JSZip();
  const folder = zip.folder("sounds/music/custom");

  const manifest = {
    format_version: 2,
    header: {
      name: "Custom Music Pack",
      description: "Overrides all Minecraft music.",
      uuid: uuid(),
      version: [1,0,0],
      min_engine_version: [1,21,0]
    },
    modules: [{
      type: "resources",
      uuid: uuid(),
      version: [1,0,0]
    }]
  };

  const defs = {
    format_version: "1.14.0",
    sound_definitions: {}
  };

  const events = [
    "music.game",
    "music.overworld.plains",
    "music.overworld.deep_dark",
    "music.overworld.dripstone_caves",
    "music.overworld.swamp",
    "music.nether",
    "music.end"
  ];

  for (const file of files) {
    status.textContent = `Converting ${file.name}...`;

    const oggBlob = await mp3ToOgg(await file.arrayBuffer());
    const oggArray = new Uint8Array(await oggBlob.arrayBuffer());

    const name = file.name.replace(".mp3", "");
    folder.file(name + ".ogg", oggArray);

    events.forEach(ev => {
      if (!defs.sound_definitions[ev]) {
        defs.sound_definitions[ev] = {
          category: "music",
          sounds: []
        };
      }
      defs.sound_definitions[ev].sounds.push({
        name: `sounds/music/custom/${name}`,
        stream: true
      });
    });
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("sound_definitions.json", JSON.stringify(defs, null, 2));

  status.textContent = "Building pack...";

  const blob = await zip.generateAsync({type:"blob"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "custom_music.mcpack";
  a.click();

  status.textContent = "Done!";
});
