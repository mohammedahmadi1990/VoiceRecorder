import lame from "lame";
import splitAudio from "split-audio-silence-master";
import fs from "fs";

const segments = await splitAudio(fs.createReadStream("./file.mp3"));

segments.forEach((segment) => {
  if (!segment.isSilence) {
    const bufferStream = segment
      .toMP3Stream()
      .pipe(fs.createWriteStream(`./${segements.id}.mp3}`));
  }
});
