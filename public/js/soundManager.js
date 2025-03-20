export class SoundManager {
  constructor() {
    // For non-positional playback
    this.sounds = {};
    // For positional playback using Web Audio API
    this.buffers = {};
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
    } catch (error) {
      console.error(`Error loading sound "${name}" from ${url}:`, error);
    }
    
    // Also load using fetch for positional audio
    fetch(url)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        this.buffers[name] = audioBuffer;
      })
      .catch(error => {
        console.error(`Error loading sound buffer "${name}" from ${url}:`, error);
      });
  }
  
  /**
   * Plays a cached sound by cloning the HTMLAudioElement.
   * @param {string} name - Sound key.
   */
  playSound(name) {
    if (this.sounds[name]) {
      const audioClone = this.sounds[name].cloneNode();
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
   */
  playSoundAt(name, position) {
    if (!this.buffers[name]) {
      console.error(`Positional sound "${name}" not found in buffers.`);
      return;
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
      
      source.connect(panner);
      panner.connect(this.audioContext.destination);
      source.start(0);
    } catch (error) {
      console.error(`Error playing positional sound "${name}":`, error);
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
