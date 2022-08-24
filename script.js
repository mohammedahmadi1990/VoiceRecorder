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
  let buffer = new ArrayBuffer(44 + interleaved.length * 2);
  let view = new DataView(buffer);

  writeUTFBytes(view, 0, "RIFF");
  view.setUint32(4, 44 + interleaved.length * 2, true);
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
  view.setUint32(40, interleaved.length * 2, true);

  // PCM samples
  let index = 44;
  let volume = 1;
  let avgx = 0;
  for (let i = 0; i < interleaved.length; i++) {
    view.setInt16(index, interleaved[i] * (0x7fff * volume), true);
    avgx += interleaved[i];
    console.log(interleaved[i]);
    index += 2;
  }
  // console.log(avgx);

  // final blob
  blob = new Blob([view], { type: "audio/wav" });

  // Download + Play
  if (blob == null) {
    return;
  }
  let url = URL.createObjectURL(blob);
  trackCount = 1;

  for (let i = 0; i < trackCount; i++) {
    const a = document.createElement("a");
    a.classList = "list-group-item list-group-item-action splittedItem";
    a.textContent = `Track ${i + 1}`;

    const div = document.createElement("div");
    div.classList = "SplitControls";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.classList = "btn btn-outline-light btn-sm spacer";
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.textContent = "";
    downloadLink.download = "sample.wav";
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
  }
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

const writeUTFBytes = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const timerStarter = () => {
  ++seconds;

  tLabel = "";
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
