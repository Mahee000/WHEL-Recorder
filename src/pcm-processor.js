class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Pre-allocated Float32 audio ring buffer (5 seconds of stereo audio)
    this.bufferSize = 48000 * 2 * 5;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    
    // Measuring input sample rate
    this.totalInputSamples = 0;
    this.totalOutputSamples = 0;
    this.measuredInputRate = 0; // 0 means unmeasured (default to output rate)
    
    this.port.onmessage = (event) => {
      const rawData = event.data; // ArrayBuffer of Int16
      if (!rawData) return;
      const int16Data = new Int16Array(rawData);
      
      // Convert Int16 to Float32 and write to circular buffer
      for (let i = 0; i < int16Data.length; i++) {
        const floatSample = int16Data[i] / 32768.0;
        const targetIndex = (this.writeIndex + i) % this.bufferSize;
        this.inputBuffer[targetIndex] = floatSample;
      }
      
      this.writeIndex = (this.writeIndex + int16Data.length) % this.bufferSize;
      
      // Accumulate input samples count (stereo frames = samples / 2)
      this.totalInputSamples += int16Data.length / 2;
    };
  }

  findNearestStandardRate(rate) {
    // WASAPI capture rates are standard hardware rates. Restrict to valid hardware rates.
    const standardRates = [44100, 48000, 88200, 96000, 176400, 192000];
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
      
      // Only calibrate if we received a steady stream of data (rate > 40000)
      // Otherwise, keep the previous rate (prevents lags from throwing off the sample rate)
      if (rawInputRate > 40000) {
        this.measuredInputRate = this.findNearestStandardRate(rawInputRate);
      }
      
      // Reset counters for next window
      this.totalInputSamples = 0;
      this.totalOutputSamples = 0;
    }

    const inRate = this.measuredInputRate || outRate;

    // Recalculate available samples to prevent any floating point drift
    let availableSamples = this.writeIndex - this.readIndex;
    if (availableSamples < 0) availableSamples += this.bufferSize;

    // Dynamic latency adjustment (drift correction)
    // Target buffer size: 80ms of stereo audio to keep latency extremely low
    const targetSamples = outRate * 2 * 0.08;
    let driftAdjustment = 1.0;
    if (availableSamples > targetSamples * 1.5) {
      // Speed up slightly to catch up latency
      driftAdjustment = 1.03;
    } else if (availableSamples < targetSamples * 0.5) {
      // Slow down slightly to prevent buffer underflow
      driftAdjustment = 0.97;
    }

    const playbackRatio = (inRate / outRate) * driftAdjustment;
    let writeCount = 0;

    while (writeCount < sampleCount) {
      const availableFrames = Math.floor(availableSamples / 2);
      
      // If we don't have enough input samples to interpolate, output silence
      if (availableFrames < 2) {
        for (let c = 0; c < channelCount; c++) {
          output[c][writeCount] = 0;
        }
        writeCount++;
        continue;
      }

      // Linear interpolation indices
      const currentFrameIndex = this.readIndex / 2;
      const index0 = Math.floor(currentFrameIndex);
      const index1 = (index0 + 1) % (this.bufferSize / 2);
      const t = currentFrameIndex - index0;

      const bufferIdx0 = index0 * 2;
      const bufferIdx1 = index1 * 2;

      // Left Channel
      const l0 = this.inputBuffer[bufferIdx0];
      const l1 = this.inputBuffer[bufferIdx1];
      const leftVal = l0 + t * (l1 - l0);

      // Right Channel
      const r0 = this.inputBuffer[bufferIdx0 + 1];
      const r1 = this.inputBuffer[bufferIdx1 + 1];
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
      const advance = 2 * playbackRatio;
      this.readIndex = (this.readIndex + advance) % this.bufferSize;
      
      // Update availableSamples
      availableSamples = Math.max(0, availableSamples - advance);
      writeCount++;
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
