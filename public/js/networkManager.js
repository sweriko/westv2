/**
 * Network Manager for handling server communications
 */
export class NetworkManager {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.otherPlayers = new Map();
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onPlayerUpdate = null;
    this.onMessageReceived = null;
    
    // Initialize connection
    this.connect();
  }
  
  /**
   * Connect to the game server
   */
  connect() {
    try {
      this.socket = new WebSocket(this.serverUrl);
      
      this.socket.onopen = () => {
        console.log("Connected to server");
        this.connected = true;
      };
      
      this.socket.onclose = () => {
        console.log("Disconnected from server");
        this.connected = false;
        
        // Attempt to reconnect after a delay
        setTimeout(() => this.connect(), 5000);
      };
      
      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };
    } catch (err) {
      console.error("Failed to connect to server:", err);
    }
  }
  
  /**
   * Handle incoming messages from the server
   * @param {Object} message - The message from the server
   */
  handleMessage(message) {
    // Handle debug visualization messages
    if (message.type === 'debugBoxVisualization') {
      this.createDebugBox(message.box, message.color || 0xFF0000, message.duration || 5000);
    }
    
    if (message.type === 'debugSphereVisualization') {
      this.createDebugSphere(message.position, message.radius || 0.5, message.color || 0xFF0000, message.duration || 5000);
    }
    
    // Call the onMessageReceived callback if defined
    if (this.onMessageReceived) {
      this.onMessageReceived(message);
    }
  }
  
  /**
   * Send a message to the server
   * @param {Object} message - The message to send
   */
  sendMessage(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn("Cannot send message, not connected to server");
    }
  }
  
  /**
   * Creates a debug box for visualization
   * @param {Object} box - Box parameters {x, y, z, width, height, length}
   * @param {number} color - Color in hex format
   * @param {number} duration - Duration in ms before removal
   */
  createDebugBox(box, color = 0xFF0000, duration = 5000) {
    if (!window.scene) return;
    
    console.log(`Creating debug box at (${box.x.toFixed(2)}, ${box.y.toFixed(2)}, ${box.z.toFixed(2)}) with dimensions ${box.width.toFixed(2)}x${box.height.toFixed(2)}x${box.length.toFixed(2)}`);
    
    // Create geometry and material
    const geometry = new THREE.BoxGeometry(box.width, box.height, box.length);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5,
      wireframe: false
    });
    
    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(box.x, box.y, box.z);
    window.scene.add(mesh);
    
    // Create wireframe for better visibility
    const wireGeometry = new THREE.BoxGeometry(box.width, box.height, box.length);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    const wireMesh = new THREE.Mesh(wireGeometry, wireMaterial);
    mesh.add(wireMesh);
    
    // Schedule removal after duration
    setTimeout(() => {
      if (window.scene) {
        window.scene.remove(mesh);
        geometry.dispose();
        material.dispose();
        wireGeometry.dispose();
        wireMaterial.dispose();
      }
    }, duration);
    
    return mesh;
  }
  
  /**
   * Creates a debug sphere for visualization
   * @param {Object} position - Position {x, y, z}
   * @param {number} radius - Sphere radius
   * @param {number} color - Color in hex format
   * @param {number} duration - Duration in ms before removal
   */
  createDebugSphere(position, radius = 0.5, color = 0xFF0000, duration = 5000) {
    if (!window.scene) return;
    
    console.log(`Creating debug sphere at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) with radius ${radius.toFixed(2)}`);
    
    // Create geometry and material
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.7
    });
    
    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    window.scene.add(mesh);
    
    // Schedule removal after duration
    setTimeout(() => {
      if (window.scene) {
        window.scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      }
    }, duration);
    
    return mesh;
  }
  
  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
} 