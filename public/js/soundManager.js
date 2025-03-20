export class SoundManager {
  constructor() {
    // For non-positional playback
    this.sounds = {};
    // For positional playback using Web Audio API
    this.buffers = {};
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // For footstep optimization - preload audio nodes for footsteps
    this.footstepSources = {
      left: [],
      right: []
    };
    this.footstepPoolSize = 3; // Number of audio nodes to cycle through
    this.currentFootstepIndex = 0;
    
    // For sound cooldowns (prevent sound spam)
    this.soundCooldowns = {};
  }
  
  /**
   * Loads an audio file and caches it.
   * Loads both as an HTMLAudioElement (for simple playback)
   * and as an AudioBuffer (for positional audio).
   * @param {string} name - Sound key.
   * @param {string} url - Audio file URL.
   */
  loadSound(name, url) {
    try {
      // Load using HTMLAudioElement for non-positional playback
      const audio = new Audio();
      audio.src = url;
      audio.load();
      this.sounds[name] = audio;
      
      console.log(`Loaded sound "${name}" as HTMLAudioElement from ${url}`);
    } catch (error) {
      console.error(`Error loading sound "${name}" from ${url}:`, error);
    }
    
    // Also load using fetch for positional audio
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
        
        // Preload footstep sources if this is a footstep sound
        if (name === 'leftstep' || name === 'rightstep') {
          const footType = name === 'leftstep' ? 'left' : 'right';
          console.log(`Preloading ${footType} footstep sources`);
          // Create a pool of audio sources for footsteps
          for (let i = 0; i < this.footstepPoolSize; i++) {
            this.footstepSources[footType][i] = {
              source: null,
              gainNode: this.audioContext.createGain(),
              panner: this.audioContext.createPanner()
            };
            
            // Set up the audio chain
            this.footstepSources[footType][i].gainNode.connect(this.audioContext.destination);
            this.footstepSources[footType][i].panner.connect(this.footstepSources[footType][i].gainNode);
            
            // Configure panner for 3D audio
            this.footstepSources[footType][i].panner.panningModel = 'HRTF';
            this.footstepSources[footType][i].panner.distanceModel = 'inverse';
            this.footstepSources[footType][i].panner.refDistance = 1;
            this.footstepSources[footType][i].panner.maxDistance = 10000;
            this.footstepSources[footType][i].panner.rolloffFactor = 1;
          }
        }
      })
      .catch(error => {
        console.error(`Error loading sound buffer "${name}" from ${url}:`, error);
      });
  }
  
  /**
   * Plays a cached sound by cloning the HTMLAudioElement.
   * @param {string} name - Sound key.
   * @param {number} cooldown - Optional cooldown in milliseconds to prevent rapid repetition.
   * @param {number} volume - Optional volume multiplier (0-1)
   */
  playSound(name, cooldown = 0, volume = 1.0) {
    if (this.sounds[name]) {
      // Check cooldown if specified
      if (cooldown > 0) {
        const now = Date.now();
        if (this.soundCooldowns[name] && now - this.soundCooldowns[name] < cooldown) {
          // Still in cooldown period
          return;
        }
        this.soundCooldowns[name] = now;
      }
      
      const audioClone = this.sounds[name].cloneNode();
      // Apply volume adjustment
      audioClone.volume = Math.max(0, Math.min(1, volume));
      
      audioClone.play().catch(error => {
        console.error(`Error playing sound "${name}":`, error);
      });
    } else {
      console.error(`Sound "${name}" not found in cache.`);
    }
  }
  
  /**
   * Plays a sound at a given 3D position using the Web Audio API.
   * @param {string} name - Sound key.
   * @param {THREE.Vector3} position - 3D position for the sound.
   * @param {number} cooldown - Optional cooldown in milliseconds.
   * @param {number} volume - Optional volume multiplier.
   */
  playSoundAt(name, position, cooldown = 0, volume = 1.0) {
    if (!this.buffers[name]) {
      console.error(`Positional sound "${name}" not found in buffers.`);
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
    
    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.buffers[name];
      
      const panner = this.audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 0;
      panner.coneOuterGain = 0;
      panner.setPosition(position.x, position.y, position.z);
      
      // Add volume control gain node
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;
      
      source.connect(panner);
      panner.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      source.start(0);
    } catch (error) {
      console.error(`Error playing positional sound "${name}":`, error);
    }
  }
  
  /**
   * Efficiently plays footstep sounds by reusing audio nodes.
   * Optimized for frequent calls during walking.
   * @param {string} foot - 'left' or 'right' to determine which sound to play.
   * @param {THREE.Vector3} position - 3D position for the sound.
   * @param {number} volume - Volume multiplier based on movement speed.
   */
  playFootstep(foot, position, volume = 1.0) {
    const footType = foot === 'left' ? 'left' : 'right';
    const soundName = foot === 'left' ? 'leftstep' : 'rightstep';
    
    if (!this.buffers[soundName]) {
      console.error(`Footstep sound "${soundName}" not found in buffers.`);
      return;
    }
    
    try {
      // Get the next footstep source from the pool
      const sourceObj = this.footstepSources[footType][this.currentFootstepIndex];
      this.currentFootstepIndex = (this.currentFootstepIndex + 1) % this.footstepPoolSize;
      
      // If there's an existing source playing, stop it
      if (sourceObj.source !== null) {
        try {
          sourceObj.source.stop();
        } catch (e) {
          // Ignore errors if the source was already stopped
        }
      }
      
      // Create a new source
      sourceObj.source = this.audioContext.createBufferSource();
      sourceObj.source.buffer = this.buffers[soundName];
      
      // Update position and volume
      sourceObj.panner.setPosition(position.x, position.y, position.z);
      sourceObj.gainNode.gain.value = volume;
      
      // Connect and play
      sourceObj.source.connect(sourceObj.panner);
      sourceObj.source.start(0);
    } catch (error) {
      console.error(`Error playing footstep sound "${soundName}":`, error);
    }
  }
  
  /**
   * Plays a sequence: after sound1 ends, sound2 plays.
   * @param {string} sound1 - First sound key.
   * @param {string} sound2 - Second sound key.
   */
  playSoundSequence(sound1, sound2) {
    if (this.sounds[sound1]) {
      const audioClone = this.sounds[sound1].cloneNode();
      audioClone.play().then(() => {
        audioClone.addEventListener('ended', () => {
          this.playSound(sound2);
        });
      }).catch(error => {
        console.error(`Error playing sound "${sound1}":`, error);
      });
    } else {
      console.error(`Sound "${sound1}" not found in cache.`);
    }
  }
}