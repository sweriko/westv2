/**
 * Game settings management
 * Handles user preferences that can be configured in-game
 */

// Default settings
const defaultSettings = {
    volume: 0.7,
    sensitivity: 0.5,
    showFPS: false
};

// Initialize settings object
let gameSettings = {...defaultSettings};

// Load settings from localStorage
export function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('westv2-settings');
        if (savedSettings) {
            // Merge saved settings with defaults (so new settings get default values)
            gameSettings = {...defaultSettings, ...JSON.parse(savedSettings)};
            console.log('Game settings loaded from localStorage');
        }
    } catch (e) {
        console.error('Error loading settings:', e);
        // In case of error, use defaults
        gameSettings = {...defaultSettings};
    }
    return gameSettings;
}

// Save settings to localStorage
export function saveSettings() {
    try {
        localStorage.setItem('westv2-settings', JSON.stringify(gameSettings));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// Get a specific setting
export function getSetting(key) {
    return gameSettings[key];
}

// Update a specific setting
export function updateSetting(key, value) {
    gameSettings[key] = value;
    saveSettings();
    return gameSettings;
}

// Toggle a boolean setting
export function toggleSetting(key) {
    if (typeof gameSettings[key] === 'boolean') {
        gameSettings[key] = !gameSettings[key];
        saveSettings();
    }
    return gameSettings[key];
}

// Create settings UI
export function createSettingsUI() {
    // Create container
    const container = document.createElement('div');
    container.id = 'settings-panel';
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.color = 'white';
    container.style.padding = '10px';
    container.style.borderRadius = '5px';
    container.style.zIndex = '1000';
    container.style.fontFamily = 'monospace';
    container.style.fontSize = '12px';
    container.style.display = 'none'; // Hidden by default
    
    // Create title
    const title = document.createElement('div');
    title.textContent = 'Game Settings';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.style.textAlign = 'center';
    container.appendChild(title);
    
    // Add settings options
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.width = '100%';
    closeButton.style.marginTop = '10px';
    closeButton.style.padding = '5px';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '3px';
    closeButton.style.backgroundColor = '#666';
    closeButton.style.color = 'white';
    closeButton.style.cursor = 'pointer';
    
    closeButton.addEventListener('click', () => {
        container.style.display = 'none';
    });
    
    container.appendChild(closeButton);
    document.body.appendChild(container);
    
    // Settings button (always visible)
    const settingsButton = document.createElement('button');
    settingsButton.textContent = '⚙️';
    settingsButton.id = 'settings-button';
    settingsButton.style.position = 'fixed';
    settingsButton.style.bottom = '20px';
    settingsButton.style.left = '20px';
    settingsButton.style.width = '40px';
    settingsButton.style.height = '40px';
    settingsButton.style.borderRadius = '50%';
    settingsButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    settingsButton.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    settingsButton.style.color = 'white';
    settingsButton.style.fontSize = '20px';
    settingsButton.style.cursor = 'pointer';
    settingsButton.style.zIndex = '1001';
    
    settingsButton.addEventListener('click', () => {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });
    
    document.body.appendChild(settingsButton);
}

// Initialize settings when module loads
loadSettings();

// Export settings object
export const settings = gameSettings; 