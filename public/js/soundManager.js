export class SoundManager {
    constructor() {
      this.sounds = {};
    }
    
    /**
     * Loads an audio file and caches it.
     * @param {string} name - Sound key.
     * @param {string} url - Audio file URL.
     */
    loadSound(name, url) {
      try {
        const audio = new Audio();
        audio.src = url;
        audio.load();
        this.sounds[name] = audio;
      } catch (error) {
        console.error(`Error loading sound "${name}" from ${url}:`, error);
      }
    }
    
    /**
     * Plays a cached sound by cloning the node.
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
  