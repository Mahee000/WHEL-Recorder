class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Threshold to open the gate (approx -46dB). Anything below this is considered noise/hiss.
    this.threshold = 0.005; 
    
    this.isOpen = false;
    this.envelope = 0;
    
    // Smoothing factors to prevent clicking when the gate opens/closes
    this.attack = 0.1;   // Fast attack (open quickly when speaking)
    this.release = 0.02; // Slower release (fade out smoothly when stopping)
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0 || !output || output.length === 0) return true;

    // Find the maximum amplitude in this block (usually 128 samples)
    let maxAmp = 0;
    for (let channel = 0; channel < input.length; channel++) {
      if (!input[channel]) continue;
      for (let i = 0; i < input[channel].length; i++) {
        const absVal = Math.abs(input[channel][i]);
        if (absVal > maxAmp) maxAmp = absVal;
      }
    }

    // Determine gate state based on threshold
    if (maxAmp > this.threshold) {
      this.isOpen = true;
    } else {
      this.isOpen = false;
    }

    // Apply envelope and output
    for (let i = 0; i < input[0].length; i++) {
      if (this.isOpen) {
        this.envelope += (1.0 - this.envelope) * this.attack;
      } else {
        this.envelope += (0.0 - this.envelope) * this.release;
      }

      const activeChannels = Math.min(input.length, output.length);
      for (let channel = 0; channel < activeChannels; channel++) {
        if (output[channel] && input[channel]) {
          output[channel][i] = input[channel][i] * this.envelope;
        }
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
