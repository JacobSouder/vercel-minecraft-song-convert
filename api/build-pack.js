const Busboy = require("busboy");
const JSZip = require("jszip");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable, Writable } = require("stream");
const { v4: uuidv4 } = require("uuid");

ffmpeg.setFfmpegPath(ffmpegPath);

function bufferToReadable(buffer) {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

function convertMp3ToOgg(buffer) {
  return new Promise((resolve, reject) => {
    const input = bufferToReadable(buffer);
    const chunks = [];

    const output = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    ffmpeg(input)
      .audioCodec("libvorbis")
      .format("ogg")
      .on("error", (err) => reject(err))
      .on("end", () => {
        resolve(Buffer.concat(chunks));
      })
      .pipe(output, { end: true });
  });
}

function parseEngineVersion(str) {
  const parts = (str || "").split(".").map((p) => parseInt(p, 10));
  if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
    return [parts[0], parts[1], parts[2]];
  }
  return [1, 21, 0];
}

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }

  const busboy = new Busboy({ headers: req.headers });

  const tracks = []; // { filename, buffer }
  let packName = "Custom Music Pack";
  let packDesc = "Custom music pack";
  let engineVersionStr = "1.21.0";

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "packName") packName = val;
    if (fieldname === "packDesc") packDesc = val;
    if (fieldname === "engineVersion") engineVersionStr = val;
  });

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const chunks = [];
    file.on("data", (data) => chunks.push(data));
    file.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (fieldname === "tracks" && buffer.length > 0) {
        tracks.push({ filename, buffer });
      }
    });
  });

  busboy.on("finish", async () => {
    if (!tracks.length) {
      res.statusCode = 400;
      return res.end("No tracks uploaded.");
    }

    try {
      const zip = new JSZip();
      const soundsFolder = zip.folder("sounds").folder("music").folder("custom");

      const packVer = [1, 0, 0];
      const engineVer = parseEngineVersion(engineVersionStr);

      const headerUuid = uuidv4();
      const moduleUuid = uuidv4();

      const manifest = {
        format_version: 2,
        header: {
          name: packName,
          description: packDesc,
          uuid: headerUuid,
          version: packVer,
          min_engine_version: engineVer,
        },
        modules: [
          {
            type: "resources",
            uuid: moduleUuid,
            version: packVer,
          },
        ],
      };

      const soundDefs = {};
      const events = [
        "music.game",
        "music.overworld.plains",
        "music.overworld.lush_caves",
        "music.overworld.dripstone_caves",
        "music.overworld.deep_dark",
        "music.overworld.swamp",
        "music.overworld.jungle",
        "music.nether",
        "music.nether.basalt_deltas",
        "music.nether.nether_wastes",
        "music.nether.crimson_forest",
        "music.nether.warped_forest",
        "music.nether.soul_sand_valley",
        "music.end",
        "music.credits",
      ];

      for (const ev of events) {
        soundDefs[ev] = {
          category: "music",
          sounds: [],
        };
      }

      // Convert and add files
      for (let i = 0; i < tracks.length; i++) {
        const { filename, buffer } = tracks[i];
        const baseName = filename.replace(/\.[^.]+$/, "").trim();

        // convert MP3 → OGG
        const oggBuffer = await convertMp3ToOgg(buffer);

        soundsFolder.file(`${baseName}.ogg`, oggBuffer);

        const soundPath = `sounds/music/custom/${baseName}`;
        events.forEach((ev) => {
          soundDefs[ev].sounds.push({
            name: soundPath,
            stream: true,
          });
        });
      }

      const soundDefinitionsJson = {
        format_version: "1.14.0",
        sound_definitions: soundDefs,
      };

      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file(
        "sound_definitions.json",
        JSON.stringify(soundDefinitionsJson, null, 2)
      );

      const mcpackBuffer = await zip.generateAsync({ type: "nodebuffer" });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="custom_music.mcpack"'
      );
      return res.end(mcpackBuffer);
    } catch (err) {
      console.error("Error building pack:", err);
      res.statusCode = 500;
      return res.end("Internal Server Error while building pack.");
    }
  });

  req.pipe(busboy);
};
