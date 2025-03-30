/**
 * Logger - A simple configurable logging system for the game
 * Allows toggling debug logs globally to reduce console spam
 */
export class Logger {
  constructor() {
    // Default log levels
    this.levels = {
      error: true,   // Always show errors
      warn: true,    // Always show warnings
      info: false,   // Toggle general info logs
      debug: false,  // Toggle verbose debug logs
      physics: false // Toggle physics-related logs
    };
    
    // Initialize from localStorage if available
    this.loadSettings();
  }
  
  /**
   * Load logger settings from localStorage
   */
  loadSettings() {
    try {
      const savedSettings = localStorage.getItem('logger_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        this.levels = { ...this.levels, ...parsed };
      }
    } catch (e) {
      console.error('Error loading logger settings:', e);
    }
  }
  
  /**
   * Save current settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('logger_settings', JSON.stringify(this.levels));
    } catch (e) {
      console.error('Error saving logger settings:', e);
    }
  }
  
  /**
   * Set a specific log level
   * @param {string} level - Level name
   * @param {boolean} enabled - Whether to enable it
   */
  setLevel(level, enabled) {
    if (level in this.levels) {
      this.levels[level] = enabled;
      this.saveSettings();
    }
  }
  
  /**
   * Log an error message (always shown)
   * @param {...any} args - Arguments to log
   */
  error(...args) {
    console.error(...args);
  }
  
  /**
   * Log a warning message (always shown)
   * @param {...any} args - Arguments to log
   */
  warn(...args) {
    console.warn(...args);
  }
  
  /**
   * Log an info message (can be toggled)
   * @param {...any} args - Arguments to log
   */
  info(...args) {
    if (this.levels.info) {
      console.log(...args);
    }
  }
  
  /**
   * Log a debug message (can be toggled)
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.levels.debug) {
      console.log(...args);
    }
  }
  
  /**
   * Log a physics-related message (can be toggled)
   * @param {...any} args - Arguments to log
   */
  physics(...args) {
    if (this.levels.physics) {
      console.log(...args);
    }
  }
  
  /**
   * Create a simple UI for toggling log levels
   * @param {HTMLElement} container - Container element
   */
  createUI(container) {
    const div = document.createElement('div');
    div.className = 'logger-controls';
    div.style.position = 'fixed';
    div.style.bottom = '10px';
    div.style.right = '10px';
    div.style.backgroundColor = 'rgba(0,0,0,0.7)';
    div.style.padding = '10px';
    div.style.borderRadius = '5px';
    div.style.color = 'white';
    div.style.zIndex = '1000';
    div.style.fontSize = '12px';
    
    const title = document.createElement('div');
    title.textContent = 'Debug Logs';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '5px';
    div.appendChild(title);
    
    // Create toggle for each log level
    Object.keys(this.levels).forEach(level => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '3px';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.levels[level];
      checkbox.addEventListener('change', () => {
        this.setLevel(level, checkbox.checked);
      });
      
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${level}`));
      div.appendChild(label);
    });
    
    container.appendChild(div);
  }
}

// Create global logger instance
const logger = new Logger();

// Replace console functions with logger if enabled
if (typeof window !== 'undefined') {
  window.logger = logger;
}

export default logger; 