class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferQueue = [];
    this.readOffset = 0;
    this.port.onmessage = (event) => {
      // event.data is a Buffer or ArrayBuffer containing 16-bit PCM data (Int16)
      const rawData = event.data;
      const int16Data = new Int16Array(rawData);
      this.bufferQueue.push(int16Data);
      
      // Keep buffer queue size reasonable (prevent memory leaks if audio stalls)
      if (this.bufferQueue.length > 100) {
        this.bufferQueue.shift();
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channelCount = output.length; // usually 2 for stereo
    const sampleCount = output[0].length; // usually 128

    let writeCount = 0;

    while (writeCount < sampleCount) {
      if (this.bufferQueue.length === 0) {
        // Fill remaining output buffer with silence
        for (let channel = 0; channel < channelCount; channel++) {
          for (let i = writeCount; i < sampleCount; i++) {
            output[channel][i] = 0;
          }
        }
        break;
      }

      const currentChunk = this.bufferQueue[0];
      const chunkLength = currentChunk.length;

      // Fill output buffer sample-by-sample
      while (this.readOffset < chunkLength && writeCount < sampleCount) {
        if (channelCount === 2 && this.readOffset + 1 < chunkLength) {
          // Stereo interleaved PCM: [L, R, L, R, ...]
          output[0][writeCount] = currentChunk[this.readOffset] / 32768.0;
          output[1][writeCount] = currentChunk[this.readOffset + 1] / 32768.0;
          this.readOffset += 2;
        } else {
          // Mono PCM or single leftover sample fallback
          const val = currentChunk[this.readOffset] / 32768.0;
          for (let c = 0; c < channelCount; c++) {
            output[c][writeCount] = val;
          }
          this.readOffset += 1;
        }
        writeCount++;
      }

      // If we finished processing this chunk, move to next
      if (this.readOffset >= chunkLength) {
        this.bufferQueue.shift();
        this.readOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
