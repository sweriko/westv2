export class SoundManager {
  constructor() {
    // Initialize Web Audio API context
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Sound buffers and pools
    this.buffers = {};
    this.soundPools = {};
    this.soundCategories = {
      'weapon': { maxInstances: 3, volume: 1.0 },  // Limit weapon sounds like gunshots
      'impact': { maxInstances: 5, volume: 0.8 },  // Hit sounds
      'footstep': { maxInstances: 6, volume: 0.7 }, // Footstep sounds
      'ui': { maxInstances: 3, volume: 0.6 },      // UI sounds
      'ambient': { maxInstances: 5, volume: 0.5 }, // Background sounds
      'voice': { maxInstances: 2, volume: 1.0 }    // Voice sounds
    };
    
    // Default category mapping for common sounds
    this.soundCategoryMap = {
      'shot': 'weapon',
      'aimclick': 'ui',
      'shellejection': 'weapon',
      'reloading': 'weapon',
      'bellstart': 'ui',
      'woodimpact': 'impact',
      'fleshimpact': 'impact',
      'leftstep': 'footstep',
      'rightstep': 'footstep',
      'jump': 'footstep',
      'headshotmarker': 'ui'
    };
    
    // Main mixer channels
    this.masterGain = this.audioContext.createGain();
    
    // Create audio processing for better sound quality
    this.setupAudioProcessing();
    
    this.categoryGains = {};
    for (const category in this.soundCategories) {
      this.categoryGains[category] = this.audioContext.createGain();
      this.categoryGains[category].gain.value = this.soundCategories[category].volume;
      this.categoryGains[category].connect(this.masterGain);
    }
    
    // For sound cooldowns (prevent sound spam)
    this.soundCooldowns = {};
    
    // Track currently playing sounds by category
    this.activeSounds = {};
    for (const category in this.soundCategories) {
      this.activeSounds[category] = [];
    }
    
    // Set initial master volume
    this.setMasterVolume(0.8);
  }
  
  /**
   * Sets up audio processing chain for better sound
   */
  setupAudioProcessing() {
    // Create a compressor to prevent audio clipping and make overall sound fuller
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;    // Start compressing at -24dB
    this.compressor.knee.value = 10;          // Smooth knee for more natural sound
    this.compressor.ratio.value = 4;          // 4:1 compression ratio
    this.compressor.attack.value = 0.005;     // Fast attack (5ms)
    this.compressor.release.value = 0.1;      // Medium release (100ms)
    
    // Optional: Add a subtle reverb for weapon sounds
    if (this.audioContext.createConvolver) {
      try {
        // Setup convolver for reverb
        this.convolver = this.audioContext.createConvolver();
        
        // Create a simple impulse response for a small reverb
        const sampleRate = this.audioContext.sampleRate;
        const length = Math.floor(sampleRate * 0.5); // 500ms impulse response
        const impulseBuffer = this.audioContext.createBuffer(2, length, sampleRate);
        
        // Fill both channels with an exponentially decaying noise
        for (let channel = 0; channel < 2; channel++) {
          const impulseData = impulseBuffer.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            // Create exponentially decaying noise
            impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
          }
        }
        
        // Set the impulse response
        this.convolver.buffer = impulseBuffer;
        
        // Create a send gain for the reverb
        this.reverbSend = this.audioContext.createGain();
        this.reverbSend.gain.value = 0.1; // Very subtle reverb
        
        // Connect reverb to the chain
        this.reverbSend.connect(this.convolver);
        this.convolver.connect(this.compressor);
        console.log("Reverb effect initialized");
      } catch (e) {
        console.warn("Failed to initialize reverb", e);
        // Fallback: No reverb
        this.reverbSend = null;
        this.convolver = null;
      }
    }
    
    // Connect the audio chain
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.audioContext.destination);
    
    console.log("Audio processing chain configured");
  }
  
  /**
   * Sets the master volume for all sounds
   * @param {number} value - Volume from 0 to 1
   */
  setMasterVolume(value) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, value));
  }
  
  /**
   * Sets the volume for a specific sound category
   * @param {string} category - Category name
   * @param {number} value - Volume from 0 to 1
   */
  setCategoryVolume(category, value) {
    if (this.categoryGains[category]) {
      this.categoryGains[category].gain.value = Math.max(0, Math.min(1, value));
    }
  }
  
  /**
   * Gets the appropriate category for a sound
   * @param {string} name - Sound name
   * @returns {string} Category name
   */
  _getSoundCategory(name) {
    return this.soundCategoryMap[name] || 'ambient';
  }
  
  /**
   * Loads an audio file and caches it.
   * @param {string} name - Sound key.
   * @param {string} url - Audio file URL.
   * @param {string} category - Optional override for the sound category
   */
  loadSound(name, url, category = null) {
    // If category is provided, map this sound to that category
    if (category && this.soundCategories[category]) {
      this.soundCategoryMap[name] = category;
    }
    
    // Load sound using fetch for Web Audio API
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Network response failed for sound ${name}: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        this.buffers[name] = audioBuffer;
        console.log(`Loaded sound "${name}" as AudioBuffer from ${url}`);
        
        // Initialize sound pool for this sound
        const soundCategory = this._getSoundCategory(name);
        const poolSize = this.soundCategories[soundCategory].maxInstances;
        
        // Create pool for this sound
        this.soundPools[name] = Array(poolSize).fill().map(() => ({
          source: null,
          gainNode: null,
          panner: null,
          active: false,
          startTime: 0
        }));
      })
      .catch(error => {
        console.error(`Error loading sound buffer "${name}" from ${url}:`, error);
      });
  }
  
  /**
   * Registers a sound as preloaded - used when sounds were preloaded during the name entry
   * @param {string} name - Sound key to register
   * @param {string} category - Optional override for the sound category
   */
  registerPreloadedSound(name, category = null) {
    // If category is provided, map this sound to that category
    if (category && this.soundCategories[category]) {
      this.soundCategoryMap[name] = category;
    }
    
    // Detect URL based on name
    const url = `sounds/${name}.mp3`;
    
    // When a sound is played, it will be lazy-loaded on first play
    console.log(`Registered preloaded sound "${name}" (will be loaded on first play)`);
    
    // Initialize sound pool for this sound
    const soundCategory = this._getSoundCategory(name);
    const poolSize = this.soundCategories[soundCategory].maxInstances;
    
    // Create pool for this sound
    this.soundPools[name] = Array(poolSize).fill().map(() => ({
      source: null,
      gainNode: null,
      panner: null,
      active: false,
      startTime: 0
    }));
  }
  
  /**
   * Adds a preloaded audio buffer directly to the SoundManager
   * @param {string} name - Sound name
   * @param {AudioBuffer} buffer - Preloaded audio buffer
   * @param {string} category - Optional category override 
   */
  addPreloadedBuffer(name, buffer, category = null) {
    // If category is provided, map this sound to that category
    if (category && this.soundCategories[category]) {
      this.soundCategoryMap[name] = category;
    }
    
    // Store the buffer directly
    this.buffers[name] = buffer;
    console.log(`Added preloaded audio buffer for "${name}"`);
    
    // Initialize sound pool for this sound
    const soundCategory = this._getSoundCategory(name);
    const poolSize = this.soundCategories[soundCategory].maxInstances;
    
    // Create pool for this sound
    this.soundPools[name] = Array(poolSize).fill().map(() => ({
      source: null,
      gainNode: null,
      panner: null,
      active: false,
      startTime: 0
    }));
  }
  
  /**
   * Cleanups and returns an available sound object from the pool
   * @param {string} name - Sound name
   * @returns {Object|null} Sound object from pool or null if none available
   */
  _getAvailableSoundFromPool(name) {
    if (!this.soundPools[name]) return null;
    
    const now = this.audioContext.currentTime;
    let oldestSoundIndex = -1;
    let oldestStartTime = Infinity;
    
    // First try to find an inactive sound
    for (let i = 0; i < this.soundPools[name].length; i++) {
      const sound = this.soundPools[name][i];
      
      // If sound is not active, use it
      if (!sound.active) {
        return sound;
      }
      
      // Keep track of the oldest sound in case we need to override it
      if (sound.startTime < oldestStartTime) {
        oldestStartTime = sound.startTime;
        oldestSoundIndex = i;
      }
    }
    
    // If we get here, all sounds are active, so use the oldest one
    if (oldestSoundIndex >= 0) {
      const sound = this.soundPools[name][oldestSoundIndex];
      
      // Stop the current sound if it's playing
      if (sound.source) {
        try {
          sound.source.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
      }
      
      return sound;
    }
    
    return null;
  }
  
  /**
   * Manage active sounds for a category, stopping older sounds if needed
   * @param {string} category - Sound category
   * @param {Object} soundObj - Sound object from pool
   */
  _manageActiveSoundsForCategory(category, soundObj) {
    const maxInstances = this.soundCategories[category].maxInstances;
    
    // Add this sound to the active sounds for this category
    this.activeSounds[category].push(soundObj);
    
    // If we have too many active sounds in this category, stop the oldest ones
    if (this.activeSounds[category].length > maxInstances) {
      // Sort by start time (oldest first)
      this.activeSounds[category].sort((a, b) => a.startTime - b.startTime);
      
      // Stop the oldest sounds to get back to the max
      while (this.activeSounds[category].length > maxInstances) {
        const oldestSound = this.activeSounds[category].shift();
        
        if (oldestSound && oldestSound.source) {
          try {
            oldestSound.source.stop();
          } catch (e) {
            // Ignore errors if already stopped
          }
          oldestSound.active = false;
        }
      }
    }
  }
  
  /**
   * Plays a sound with optional volume control
   * @param {string} name - The name of the sound to play
   * @param {number} cooldown - Minimum time between sound plays (ms)
   * @param {number} volume - Volume multiplier for this sound (0-1)
   * @param {boolean} loop - Whether the sound should loop
   * @returns {Object|null} Sound object for further control or null if not played
   */
  playSound(name, cooldown = 0, volume = 1.0, loop = false) {
    // Check if sound exists and is not on cooldown
    if (!this.soundPools[name]) {
      console.warn(`Sound "${name}" not found in sound pool`);
      return null;
    }
    
    // Check if on cooldown
    if (cooldown > 0) {
      const now = Date.now();
      const lastPlayed = this.soundCooldowns[name] || 0;
      if (now - lastPlayed < cooldown) {
        return null;
      }
      this.soundCooldowns[name] = now;
    }
    
    // Check if sound buffer is loaded
    if (!this.buffers[name]) {
      // If this is a registered preloaded sound, load it now
      if (this.soundPools[name]) {
        // Remove verbose lazy loading log
        // Determine URL from name
        const url = `sounds/${name}.mp3`;
        
        // Return a promise that resolves when the sound is loaded and played
        return new Promise((resolve, reject) => {
          fetch(url)
            .then(response => {
              if (!response.ok) {
                throw new Error(`Network response failed for sound ${name}: ${response.status} ${response.statusText}`);
              }
              return response.arrayBuffer();
            })
            .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
              this.buffers[name] = audioBuffer;
              // Remove verbose lazy loaded log
              
              // Now play the sound and resolve the promise
              const sound = this._playSoundFromBuffer(name, volume, loop);
              resolve(sound);
            })
            .catch(error => {
              console.error(`Error lazy loading sound "${name}":`, error);
              reject(error);
            });
        });
      } else {
        console.warn(`Sound "${name}" buffer not loaded yet`);
        return null;
      }
    }
    
    return this._playSoundFromBuffer(name, volume, loop);
  }
  
  /**
   * Internal method to play a sound from an already loaded buffer
   * @private
   * @param {string} name - Sound name
   * @param {number} volume - Volume multiplier
   * @param {boolean} loop - Whether to loop
   * @returns {Object} Sound object
   */
  _playSoundFromBuffer(name, volume = 1.0, loop = false) {
    // Get sound category
    const category = this._getSoundCategory(name);
    
    // Get a sound object from the pool
    const soundObj = this._getAvailableSoundFromPool(name);
    
    if (!soundObj) {
      console.warn(`No available sound in pool for "${name}"`);
      return null;
    }
    
    // Create a sound source
    const source = this.audioContext.createBufferSource();
    source.buffer = this.buffers[name];
    source.loop = loop;
    
    // Create a gain node for volume control
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = Math.min(1.0, Math.max(0, volume)); // Clamp volume
    
    // Connect source to gain, and gain to the appropriate category gain
    source.connect(gainNode);
    
    // Connect to the reverb send if available and this is a weapon sound
    if (this.reverbSend && category === 'weapon') {
      gainNode.connect(this.reverbSend);
    }
    
    // Connect to the correct category gain
    gainNode.connect(this.categoryGains[category]);
    
    // Make sure we resume the audio context if suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    // Track the sound for category management
    this._manageActiveSoundsForCategory(category, soundObj);
    
    // Start playing and save references
    source.start(0);
    soundObj.source = source;
    soundObj.gainNode = gainNode;
    soundObj.active = true;
    soundObj.startTime = this.audioContext.currentTime;
    
    // Setup cleanup when the sound ends
    source.onended = () => {
      soundObj.active = false;
      soundObj.source = null;
      
      // Remove from active sounds
      const categorySounds = this.activeSounds[category];
      const index = categorySounds.indexOf(soundObj);
      if (index !== -1) {
        categorySounds.splice(index, 1);
      }
    };
    
    return soundObj;
  }
  
  /**
   * Plays a sound at a given 3D position using the Web Audio API.
   * @param {string} name - Sound key.
   * @param {THREE.Vector3} position - 3D position for the sound.
   * @param {number} cooldown - Optional cooldown in milliseconds.
   * @param {number} volume - Optional volume multiplier.
   * @param {boolean} loop - Whether the sound should loop
   * @param {boolean} spatialize - Whether to apply 3D audio positioning (default: true)
   * @returns {Object} - Sound object for reference
   */
  playSoundAt(name, position, cooldown = 0, volume = 1.0, loop = false, spatialize = true) {
    if (!this.buffers[name]) {
      // Only log this error once per sound name to reduce log spam
      if (!this._reportedMissingSounds) {
        this._reportedMissingSounds = new Set();
      }
      
      if (!this._reportedMissingSounds.has(name)) {
        console.error(`Sound "${name}" not loaded.`);
        this._reportedMissingSounds.add(name);
      }
      return;
    }
    
    // Check cooldown if specified
    if (cooldown > 0) {
      const now = Date.now();
      if (this.soundCooldowns[name] && now - this.soundCooldowns[name] < cooldown) {
        // Still in cooldown period
        return;
      }
      this.soundCooldowns[name] = now;
    }
    
    // Get sound category
    const category = this._getSoundCategory(name);
    
    // Get an available sound from the pool
    const soundObj = this._getAvailableSoundFromPool(name);
    if (!soundObj) {
      console.warn(`No available sound objects for ${name}`);
      return;
    }
    
    try {
      // Clean up previous nodes if they exist
      if (soundObj.gainNode) {
        soundObj.gainNode.disconnect();
      }
      if (soundObj.panner) {
        soundObj.panner.disconnect();
      }
      
      // Create new audio nodes
      soundObj.source = this.audioContext.createBufferSource();
      soundObj.source.buffer = this.buffers[name];
      soundObj.source.loop = loop;
      
      // Create gain node for individual volume control
      soundObj.gainNode = this.audioContext.createGain();
      soundObj.gainNode.gain.value = volume;
      
      // For spatialized audio, create and configure a panner node
      if (spatialize) {
        // Create 3D panner node with improved settings
        soundObj.panner = this.audioContext.createPanner();
        soundObj.panner.panningModel = 'HRTF';
        soundObj.panner.distanceModel = 'inverse';
        
        // Adjust reference distance based on sound type for better perception
        if (category === 'weapon') {
          // For weapon sounds, add a subtle highpass filter to make them sharper
          soundObj.filter = this.audioContext.createBiquadFilter();
          soundObj.filter.type = 'highpass';
          soundObj.filter.frequency.value = 80; // Cut very low frequencies
          
          // Gunshots should sound closer and louder
          soundObj.panner.refDistance = 2;
          soundObj.panner.maxDistance = 10000;
          soundObj.panner.rolloffFactor = 0.8; // Reduced rolloff for weapons
          
          // Connect source -> filter -> panner -> gain
          soundObj.source.connect(soundObj.filter);
          soundObj.filter.connect(soundObj.panner);
          
          // If reverb is available, send a portion of the sound to reverb
          if (this.reverbSend && this.convolver) {
            // Create a gain node for reverb send amount
            soundObj.reverbAmount = this.audioContext.createGain();
            soundObj.reverbAmount.gain.value = 0.15; // 15% reverb
            
            // Send from filter to reverb
            soundObj.filter.connect(soundObj.reverbAmount);
            soundObj.reverbAmount.connect(this.reverbSend);
          }
        } else if (category === 'impact') {
          // Impact sounds should be distinct
          soundObj.panner.refDistance = 1.5;
          soundObj.panner.maxDistance = 5000;
          soundObj.panner.rolloffFactor = 1;
          
          // Connect source -> panner
          soundObj.source.connect(soundObj.panner);
        } else {
          // Default settings for other sounds
          soundObj.panner.refDistance = 1;
          soundObj.panner.maxDistance = 10000;
          soundObj.panner.rolloffFactor = 1;
          
          // Connect source -> panner
          soundObj.source.connect(soundObj.panner);
        }
        
        // Omnidirectional cone settings
        soundObj.panner.coneInnerAngle = 360;
        soundObj.panner.coneOuterAngle = 0;
        soundObj.panner.coneOuterGain = 0;
        soundObj.panner.setPosition(position.x, position.y, position.z);
        
        // Connect panner -> gain
        soundObj.panner.connect(soundObj.gainNode);
      } else {
        // Add similar processing for non-spatialized sounds
        if (category === 'weapon') {
          // For weapon sounds, add a subtle highpass filter
          soundObj.filter = this.audioContext.createBiquadFilter();
          soundObj.filter.type = 'highpass';
          soundObj.filter.frequency.value = 80;
          
          // Connect source -> filter -> gain
          soundObj.source.connect(soundObj.filter);
          soundObj.filter.connect(soundObj.gainNode);
          
          // If reverb is available, send a portion of the sound to reverb
          if (this.reverbSend && this.convolver) {
            // Create a gain node for reverb send amount
            soundObj.reverbAmount = this.audioContext.createGain();
            soundObj.reverbAmount.gain.value = 0.15; // 15% reverb
            
            // Send from filter to reverb
            soundObj.filter.connect(soundObj.reverbAmount);
            soundObj.reverbAmount.connect(this.reverbSend);
          }
        } else {
          // Non-spatialized audio connects directly to gain
          soundObj.source.connect(soundObj.gainNode);
        }
      }
      
      // Final connection to category gain
      soundObj.gainNode.connect(this.categoryGains[category]);
      
      // Mark as active and track start time
      soundObj.active = true;
      soundObj.startTime = this.audioContext.currentTime;
      
      // Start playing
      soundObj.source.start(0);
      
      // When the sound ends, mark it as inactive
      soundObj.source.onended = () => {
        soundObj.active = false;
        // Remove from active sounds list
        const index = this.activeSounds[category].indexOf(soundObj);
        if (index !== -1) {
          this.activeSounds[category].splice(index, 1);
        }
      };
      
      // Manage active sounds for this category
      this._manageActiveSoundsForCategory(category, soundObj);
      
      // Return the sound object for reference
      return soundObj;
    } catch (error) {
      console.error(`Error playing positional sound "${name}":`, error);
      soundObj.active = false;
      return null;
    }
  }
  
  /**
   * Updates the position of the listener in 3D space
   * @param {THREE.Vector3} position - Position of the listener
   * @param {THREE.Vector3} front - Front direction vector
   * @param {THREE.Vector3} up - Up direction vector
   */
  updateListenerPosition(position, front, up) {
    if (!position || !front || !up) return;
    
    try {
      const listener = this.audioContext.listener;
      
      // Set position
      if (listener.positionX) {
        // Modern browsers with AudioListener object
        listener.positionX.setValueAtTime(position.x, this.audioContext.currentTime);
        listener.positionY.setValueAtTime(position.y, this.audioContext.currentTime);
        listener.positionZ.setValueAtTime(position.z, this.audioContext.currentTime);
        
        // Set orientation (forward and up vectors)
        listener.forwardX.setValueAtTime(front.x, this.audioContext.currentTime);
        listener.forwardY.setValueAtTime(front.y, this.audioContext.currentTime);
        listener.forwardZ.setValueAtTime(front.z, this.audioContext.currentTime);
        listener.upX.setValueAtTime(up.x, this.audioContext.currentTime);
        listener.upY.setValueAtTime(up.y, this.audioContext.currentTime);
        listener.upZ.setValueAtTime(up.z, this.audioContext.currentTime);
      } else {
        // Older browsers with deprecated methods
        listener.setPosition(position.x, position.y, position.z);
        listener.setOrientation(front.x, front.y, front.z, up.x, up.y, up.z);
      }
    } catch (error) {
      console.error('Error updating listener position:', error);
    }
  }
  
  /**
   * Stops all currently playing sounds in a category
   * @param {string} category - Sound category to stop
   */
  stopCategorySounds(category) {
    if (!this.activeSounds[category]) return;
    
    for (const sound of this.activeSounds[category]) {
      if (sound.source) {
        try {
          sound.source.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
        sound.active = false;
      }
    }
    
    // Clear the active sounds array for this category
    this.activeSounds[category] = [];
  }
  
  /**
   * Stops all currently playing sounds
   */
  stopAllSounds() {
    for (const category in this.activeSounds) {
      this.stopCategorySounds(category);
    }
  }
  
  /**
   * Optimized method for footstep sounds
   * @param {string} foot - 'left' or 'right'
   * @param {THREE.Vector3} position - 3D position
   * @param {number} volume - Volume
   */
  playFootstep(foot, position, volume = 1.0) {
    const soundName = foot === 'left' ? 'leftstep' : 'rightstep';
    
    // Footsteps use a mix of non-spatial and spatial audio for better perception
    // Play a direct sound at lower volume
    this.playSound(soundName, 50, volume * 0.4);
    
    // And a spatial sound at the foot position
    this.playSoundAt(soundName, position, 50, volume * 0.7);
  }
}