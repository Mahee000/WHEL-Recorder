class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Flat queue of Float32 audio samples (L, R, L, R, ...)
    this.inputBuffer = new Float32Array(0);
    this.readIndex = 0;
    
    // Measuring input sample rate
    this.totalInputSamples = 0;
    this.totalOutputSamples = 0;
    this.measuredInputRate = 0; // 0 means unmeasured (default to output rate)
    
    this.port.onmessage = (event) => {
      const rawData = event.data; // ArrayBuffer of Int16
      if (!rawData) return;
      const int16Data = new Int16Array(rawData);
      
      // Convert Int16 to Float32
      const floatData = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        floatData[i] = int16Data[i] / 32768.0;
      }
      
      // Append to inputBuffer
      const newBuffer = new Float32Array(this.inputBuffer.length + floatData.length);
      newBuffer.set(this.inputBuffer);
      newBuffer.set(floatData, this.inputBuffer.length);
      this.inputBuffer = newBuffer;
      
      // Accumulate input samples count (stereo frames = samples / 2)
      this.totalInputSamples += floatData.length / 2;
      
      // Prevent memory leaks: cap inputBuffer size (5 seconds of stereo audio)
      const maxBufferSize = 48000 * 2 * 5;
      if (this.inputBuffer.length > maxBufferSize) {
        const discardSize = this.inputBuffer.length - maxBufferSize;
        this.inputBuffer = this.inputBuffer.slice(discardSize);
        this.readIndex = Math.max(0, this.readIndex - discardSize);
      }
    };
  }

  findNearestStandardRate(rate) {
    const standardRates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000];
    let nearest = standardRates[0];
    let minDiff = Math.abs(rate - nearest);
    for (let i = 1; i < standardRates.length; i++) {
      const diff = Math.abs(rate - standardRates[i]);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = standardRates[i];
      }
    }
    return nearest;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channelCount = output.length; // usually 2 for stereo
    const sampleCount = output[0].length; // usually 128
    const outRate = sampleRate; // output sample rate of the AudioContext (e.g. 48000)

    // Update output sample count
    this.totalOutputSamples += sampleCount;
    
    // First calibration happens faster (0.2s), subsequent calibrations use a 1s window
    const calibrationLimit = this.measuredInputRate ? outRate : (outRate * 0.2);
    if (this.totalOutputSamples >= calibrationLimit) {
      const ratio = this.totalInputSamples / this.totalOutputSamples;
      const rawInputRate = ratio * outRate;
      
      let roundedRate = outRate;
      if (rawInputRate > 4000) {
        roundedRate = this.findNearestStandardRate(rawInputRate);
      }
      
      this.measuredInputRate = roundedRate;
      
      // Reset counters for next window
      this.totalInputSamples = 0;
      this.totalOutputSamples = 0;
    }

    const inRate = this.measuredInputRate || outRate;
    const playbackRatio = inRate / outRate;

    let writeCount = 0;
    const inputFrames = this.inputBuffer.length / 2;

    while (writeCount < sampleCount) {
      const currentFrameIndex = this.readIndex / 2;
      
      // If we don't have enough input samples to interpolate, output silence
      if (currentFrameIndex + 1 >= inputFrames) {
        for (let c = 0; c < channelCount; c++) {
          output[c][writeCount] = 0;
        }
        writeCount++;
        continue;
      }

      // Linear interpolation indices
      const index0 = Math.floor(currentFrameIndex);
      const index1 = index0 + 1;
      const t = currentFrameIndex - index0;

      // Left Channel
      const l0 = this.inputBuffer[index0 * 2];
      const l1 = this.inputBuffer[index1 * 2];
      const leftVal = l0 + t * (l1 - l0);

      // Right Channel
      const r0 = this.inputBuffer[index0 * 2 + 1];
      const r1 = this.inputBuffer[index1 * 2 + 1];
      const rightVal = r0 + t * (r1 - r0);

      if (channelCount === 2) {
        output[0][writeCount] = leftVal;
        output[1][writeCount] = rightVal;
      } else {
        // Mono fallback
        const monoVal = (leftVal + rightVal) / 2;
        for (let c = 0; c < channelCount; c++) {
          output[c][writeCount] = monoVal;
        }
      }

      // Advance readIndex by 2 (stereo) scaled by ratio
      this.readIndex += 2 * playbackRatio;
      writeCount++;
    }

    // Clean up inputBuffer: discard fully read samples
    const readFrameIndex = Math.floor(this.readIndex / 2);
    if (readFrameIndex > 0) {
      const discardSamples = readFrameIndex * 2;
      this.inputBuffer = this.inputBuffer.slice(discardSamples);
      this.readIndex -= discardSamples;
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
