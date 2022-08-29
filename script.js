const maximumTrackLength = 15; // max time for tracks ~ 15s
const varTreshold = 0.0000026; // treshold of variance of amplitude

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const playButton = document.createElement("playButton");
const downloadButton = document.createElement("downloadButton");
const timerLabel = document.getElementById("timerLabel");

let leftchannel = [];
let rightchannel = [];
let recorder = null;
let recordingLength = 0;
let volume = null;
let mediaStream = null;
let sampleRate = 44100;
let context = null;
let blob = null;
let timer = 0;
let seconds = 0;
let mins = 0;
let hours = 0;

startButton.addEventListener("click", () => {
  startButton.classList.toggle("disabled");
  stopButton.classList.toggle("disabled");

  timer = setInterval(timerStarter, 1000); //start Timer
  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;
  navigator.getUserMedia(
    {
      audio: true,
    },
    function (e) {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      mediaStream = context.createMediaStreamSource(e);

      let bufferSize = 2048;
      let numberOfInputChannels = 2;
      let numberOfOutputChannels = 2;
      if (context.createScriptProcessor) {
        recorder = context.createScriptProcessor(
          bufferSize,
          numberOfInputChannels,
          numberOfOutputChannels
        );
      } else {
        recorder = context.createJavaScriptNode(
          bufferSize,
          numberOfInputChannels,
          numberOfOutputChannels
        );
      }

      recorder.onaudioprocess = function (e) {
        leftchannel.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        rightchannel.push(new Float32Array(e.inputBuffer.getChannelData(1)));
        recordingLength += bufferSize;
      };

      mediaStream.connect(recorder);
      recorder.connect(context.destination);
    },
    function (e) {
      console.error(e);
    }
  );
});

stopButton.addEventListener("click", () => {
  stopButton.classList.toggle("disabled");
  startButton.classList.toggle("disabled");

  clearInterval(timer); //STOP TIMER
  recorder.disconnect(context.destination);
  mediaStream.disconnect(recorder);

  let leftBuffer = flattenArray(leftchannel, recordingLength);
  let rightBuffer = flattenArray(rightchannel, recordingLength);
  let interleaved = interleave(leftBuffer, rightBuffer);

  let duration = seconds + mins * 60 + hours * 3600;
  let maxSec = (maximumTrackLength - 1) * (interleaved.length / duration);
  let silenceInterval = 1; // Minimum duration of silence
  let frame = Math.ceil(silenceInterval * (interleaved.length / duration));

  let interleaves = [];
  let silenceStart = [];
  let silenceEnd = [];
  let sCounter = -1;
  let from = 0;
  let to = frame;
  let prevTo = 101;

  while (to < interleaved.length) {
    let section = interleaved.slice(from, to);
    let varr = calculateVariance(section);

    if (varr < varTreshold) {
      if (from - prevTo <= 100) {
        silenceEnd[sCounter] = to;
        prevTo = to;
      } else {
        sCounter++;
        silenceStart[sCounter] = from;
        silenceEnd[sCounter] = to;
        prevTo = to;
      }
    }
    from += frame + 1;
    to += frame + 1;
  }

  // Detected Silence Status
  for (let is = 0; is < silenceStart.length; is++) {
    console.log(
      `Silence ${is + 1} detected from: ${Math.floor(
        duration * (silenceStart[is] / interleaved.length)
      )} to: ${Math.floor(duration * (silenceEnd[is] / interleaved.length))}`
    );
  }

  let j = 0;
  let finalFlag = false;
  let tmp = [];
  tmp.push(interleaved[0]);
  for (let is = 1; is < interleaved.length; is++) {
    if (is == silenceStart[j]) {
      if (tmp.length != 0) {
        interleaves.push(tmp);
        tmp = [];
        finalFlag = false;
      }
      is = Math.floor(silenceEnd[j]) + 1;
      if (silenceStart.length > j) {
        j++;
      }
    } else {
      if (tmp.length <= maxSec) {
        tmp.push(interleaved[is]);
        finalFlag = true;
      } else {
        interleaves.push(tmp);
        tmp = [];
        finalFlag = false;
      }
    }
  }
  if (finalFlag) {
    interleaves.push(tmp);
  }

  interleaves.forEach((interleaveI, ii) => {
    let buffer = new ArrayBuffer(44 + interleaveI.length * 2);
    let view = new DataView(buffer);

    writeUTFBytes(view, 0, "RIFF");
    view.setUint32(4, 44 + interleaveI.length * 2, true);
    writeUTFBytes(view, 8, "WAVE");

    writeUTFBytes(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunkSize
    view.setUint16(20, 1, true); // wFormatTag
    view.setUint16(22, 2, true); // wChannels: stereo (2 channels)
    view.setUint32(24, sampleRate, true); // dwSamplesPerSec
    view.setUint32(28, sampleRate * 4, true); // dwAvgBytesPerSec
    view.setUint16(32, 4, true); // wBlockAlign
    view.setUint16(34, 16, true); // wBitsPerSample

    writeUTFBytes(view, 36, "data");
    view.setUint32(40, interleaveI.length * 2, true);

    // PCM samples
    let index = 44;
    let volume = 1;

    for (let i = 0; i < interleaveI.length; i++) {
      view.setInt16(index, interleaveI[i] * (0x7fff * volume), true);
      index += 2;
    }

    // final blob
    blob = new Blob([view], { type: "audio/mp3" });

    // Download + Play Buttons in the track list
    if (blob == null) {
      return;
    }
    let url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.classList = "list-group-item list-group-item-action splittedItem";
    a.textContent = `Track ${ii + 1 > 9 ? ii : "0" + (ii + 1)}`;

    const div = document.createElement("div");
    div.classList = "SplitControls";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.classList = "btn btn-outline-light btn-sm spacer";
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.textContent = "";
    downloadLink.download = `Track${ii + 1 > 9 ? ii : "0" + (ii + 1)}.mp3`;
    downloadLink.style = "text-decoration:none;";
    downloadButton.appendChild(downloadLink);

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.classList = "btn btn-outline-light btn-sm spacer";
    let audio = new Audio(url);
    audio.id = `audio`;
    playButton.appendChild(audio);
    const playLink = document.createElement("a");
    playLink.textContent = "⏵";
    playLink.style = "text-decoration:none;";
    playLink.onclick = () => {
      audio.play();
    };
    playButton.appendChild(playLink);

    div.appendChild(downloadButton);
    div.appendChild(playButton);
    a.appendChild(div);
    document.getElementById("soundTracks").appendChild(a);
  });
});

const flattenArray = (channelBuffer, recordingLength) => {
  let result = new Float32Array(recordingLength);
  let offset = 0;
  for (let i = 0; i < channelBuffer.length; i++) {
    let buffer = channelBuffer[i];
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
};

// Interleave left & right channels
const interleave = (leftChannel, rightChannel) => {
  let length = leftChannel.length + rightChannel.length;
  let result = new Float32Array(length);

  let inputIndex = 0;

  for (let index = 0; index < length; ) {
    result[index++] = leftChannel[inputIndex];
    result[index++] = rightChannel[inputIndex];
    inputIndex++;
  }
  return result;
};

// Write as byte
const writeUTFBytes = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Timer
const timerStarter = () => {
  ++seconds;

  if (seconds > 59) {
    seconds = 0;
    mins++;
    if (mins > 59) {
      mins = 0;
      hours++;
    }
  }

  timerLabel.innerHTML = `${hours < 10 ? "0" + hours : hours}:${
    mins < 10 ? "0" + mins : mins
  }:${seconds < 10 ? "0" + seconds : seconds}`;
};

// Calculate the average of all the numbers
const calculateMean = (values) => {
  const mean = values.reduce((sum, current) => sum + current) / values.length;
  return mean;
};

// Calculate variance
const calculateVariance = (values) => {
  const average = calculateMean(values);
  const squareDiffs = values.map((value) => {
    const diff = value - average;
    return diff * diff;
  });
  const variance = calculateMean(squareDiffs);
  return variance;
};

// Calculate stand deviation
const calculateSD = (values) => {
  return Math.sqrt(calculateVariance(values));
};
