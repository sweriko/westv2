/**
 * Quick Draw game mode implementation
 * Players face off in a wild west duel where they must wait for the "draw" signal
 * before pulling their revolvers and shooting at each other.
 * Now with support for up to 5 concurrent lobbies/arenas.
 */

import { PhysicsSystem } from './physics.js';

export class QuickDraw {
    constructor(scene, localPlayer, networkManager, soundManager) {
        this.scene = scene;
        this.localPlayer = localPlayer;
        this.networkManager = networkManager;
        this.soundManager = soundManager;
        
        // Game state
        this.inLobby = false;
        this.inDuel = false;
        this.duelOpponentId = null;
        this.duelState = 'none'; // 'none', 'ready', 'countdown', 'draw'
        this.gunLocked = false;
        this.originalCanAim = true;
        // Record the time (in ms) until which the gun remains locked
        this.penaltyEndTime = 0;
        
        // Current active arena index (0-4, -1 means none)
        this.activeArenaIndex = -1;
        
        // Arena configurations
        this.maxArenas = 5; // Support for 5 concurrent lobbies as requested
        this.arenaConfigs = this.createArenaConfigs();
        
        // Initialize physics system for collision detection
        this.physics = new PhysicsSystem();
        
        // Track arena physics bodies
        this.arenaBoundaries = new Array(this.maxArenas).fill(null);
        
        // Initialize portals, duel areas, and network handlers
        this.initPortals();
        this.createDuelAreas();
        this.initNetworkHandlers();
        this.createUI();

        // Make this instance globally accessible for network handlers
        window.quickDraw = this;
    }
    
    /**
     * Create arena configurations with different positions
     */
    createArenaConfigs() {
        const configs = [];
        // Positioning logic - arenas are placed in a row with proper spacing
        
        // Calculate base position - if town dimensions are available, place them outside town
        let baseZ = 0;
        if (window.townDimensions) {
            baseZ = window.townDimensions.length + 50; // Position outside town boundary
        } else {
            baseZ = 100; // Default position if town dimensions aren't available
        }
        
        // Arena spacing - make sure they don't overlap
        const spacingX = 50; // Allow enough space between arenas
        
        // Create 5 arena configs
        for (let i = 0; i < this.maxArenas; i++) {
            // Calculate position - arrange in a row along X axis
            let offsetX = (i - 2) * spacingX; // Center on zero, spread outward
            
            configs.push({
                index: i,
                center: new THREE.Vector3(offsetX, 0, baseZ),
                radius: 15,  // Arena radius
                height: 5,   // Arena height
                portalColor: this.getPortalColor(i),
                active: false, // Whether this arena is currently in use
                portalCollider: null, // Will store collision box for the portal
                duelArea: null, // Will store the THREE.Group for the arena
                portalGroup: null, // Will store the portal mesh group
                duelAreaActive: false // Track if this duel area is currently visible
            });
        }
        
        return configs;
    }
    
    /**
     * Get a unique color for each portal
     */
    getPortalColor(index) {
        const colors = [
            0xFF6B00, // Orange (original)
            0x4CAF50, // Green
            0x2196F3, // Blue
            0x9C27B0, // Purple
            0xFFEB3B  // Yellow
        ];
        
        return colors[index % colors.length];
    }
    
    /**
     * Create UI elements for Quick Draw game mode.
     */
    createUI() {
        // Text overlay for messages
        this.messageOverlay = document.createElement('div');
        this.messageOverlay.id = 'quick-draw-message';
        this.messageOverlay.style.position = 'absolute';
        this.messageOverlay.style.top = '50%';
        this.messageOverlay.style.left = '50%';
        this.messageOverlay.style.transform = 'translate(-50%, -50%)';
        this.messageOverlay.style.color = 'white';
        this.messageOverlay.style.fontSize = '48px';
        this.messageOverlay.style.fontWeight = 'bold';
        this.messageOverlay.style.textAlign = 'center';
        this.messageOverlay.style.display = 'none';
        this.messageOverlay.style.fontFamily = 'Western, Arial, sans-serif';
        this.messageOverlay.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
        this.messageOverlay.style.zIndex = '1000';
        document.getElementById('game-container').appendChild(this.messageOverlay);
        
        // Draw circle animation
        this.drawCircle = document.createElement('div');
        this.drawCircle.id = 'draw-circle';
        this.drawCircle.style.position = 'absolute';
        this.drawCircle.style.top = '50%';
        this.drawCircle.style.left = '50%';
        this.drawCircle.style.transform = 'translate(-50%, -50%) scale(0)';
        this.drawCircle.style.width = '600px';
        this.drawCircle.style.height = '600px';
        this.drawCircle.style.borderRadius = '50%';
        this.drawCircle.style.border = '8px solid #FF0000';
        this.drawCircle.style.boxShadow = '0 0 20px #FF0000';
        this.drawCircle.style.opacity = '0';
        this.drawCircle.style.transition = 'transform 0.3s, opacity 0.3s';
        this.drawCircle.style.pointerEvents = 'none';
        this.drawCircle.style.zIndex = '999';
        this.drawCircle.style.display = 'none';
        document.getElementById('game-container').appendChild(this.drawCircle);
        
        // Add status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.id = 'quick-draw-status';
        this.statusIndicator.style.position = 'absolute';
        this.statusIndicator.style.top = '120px';
        this.statusIndicator.style.left = '20px';
        this.statusIndicator.style.color = 'white';
        this.statusIndicator.style.fontSize = '16px';
        this.statusIndicator.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.statusIndicator.style.padding = '5px';
        this.statusIndicator.style.borderRadius = '5px';
        this.statusIndicator.style.display = 'none';
        document.getElementById('game-container').appendChild(this.statusIndicator);
        
        // Add lobby indicator
        this.lobbyIndicator = document.createElement('div');
        this.lobbyIndicator.id = 'lobby-indicator';
        this.lobbyIndicator.style.position = 'absolute';
        this.lobbyIndicator.style.top = '150px';
        this.lobbyIndicator.style.left = '20px';
        this.lobbyIndicator.style.color = 'white';
        this.lobbyIndicator.style.fontSize = '16px';
        this.lobbyIndicator.style.backgroundColor = 'rgba(255, 107, 0, 0.7)';
        this.lobbyIndicator.style.padding = '8px 12px';
        this.lobbyIndicator.style.borderRadius = '5px';
        this.lobbyIndicator.style.display = 'none';
        document.getElementById('game-container').appendChild(this.lobbyIndicator);
    }
    
    /**
     * Initialize all portals - one for each arena
     */
    initPortals() {
        for (let i = 0; i < this.maxArenas; i++) {
            this.initPortal(i);
        }
    }
    
    /**
     * Initialize a portal for a specific arena
     * @param {number} arenaIndex - The arena index (0-4)
     */
    initPortal(arenaIndex) {
        const config = this.arenaConfigs[arenaIndex];
        const portalGroup = new THREE.Group();
        
        // Create a visible portal that players can walk into
        const portalGeometry = new THREE.RingGeometry(1, 1.2, 32);
        const portalMaterial = new THREE.MeshBasicMaterial({ 
            color: config.portalColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const portal = new THREE.Mesh(portalGeometry, portalMaterial);
        
        // Position each portal differently in the town
        // Calculate a position based on arenaIndex
        // If town dimensions are available, use them for positioning
        if (window.townDimensions) {
            const streetWidth = window.townDimensions.streetWidth;
            const townLength = window.townDimensions.length;
            
            // Spread portals along the street
            const zSpacing = townLength * 0.6 / this.maxArenas; 
            const zOffset = -townLength * 0.3 + arenaIndex * zSpacing;
            
            // Alternate portals on left and right side of the street
            const xPos = (arenaIndex % 2 === 0) ? -streetWidth * 0.3 : streetWidth * 0.3;
            
            portal.position.set(xPos, 1.5, zOffset);
        } else {
            // Default positions if town dimensions aren't available
            const xPos = (arenaIndex % 2 === 0) ? -5 : 5;
            const zPos = -10 + arenaIndex * 5;
            portal.position.set(xPos, 1.5, zPos);
        }
        
        portal.rotation.y = Math.PI / 2; // Make it vertical
        portalGroup.add(portal);
        
        // Add text above the portal
        const textCanvas = document.createElement('canvas');
        const context = textCanvas.getContext('2d');
        textCanvas.width = 256;
        textCanvas.height = 64;
        context.fillStyle = 'white';
        context.font = 'bold 28px Arial';
        context.textAlign = 'center';
        context.fillText(`QUICK DRAW ${arenaIndex + 1}`, 128, 40);
        
        const textTexture = new THREE.Texture(textCanvas);
        textTexture.needsUpdate = true;
        
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const textGeometry = new THREE.PlaneGeometry(2, 0.5);
        const portalText = new THREE.Mesh(textGeometry, textMaterial);
        portalText.position.copy(portal.position);
        portalText.position.y += 1.0; // Position above the portal
        portalText.rotation.y = Math.PI / 2;
        portalGroup.add(portalText);
        
        // Create collision detector for the portal - adjust based on portal position
        const portalPos = portal.position;
        const portalCollider = new THREE.Box3(
            new THREE.Vector3(portalPos.x - 0.5, portalPos.y - 1.5, portalPos.z - 0.5),
            new THREE.Vector3(portalPos.x + 0.5, portalPos.y + 1.5, portalPos.z + 0.5)
        );
        
        // Store in arena config
        config.portalCollider = portalCollider;
        config.portalGroup = portalGroup;
        
        // Animate the portal
        this.animatePortal(portal, arenaIndex);
        
        // Add instructions
        this.createPortalInstructions(portal.position, arenaIndex);
        
        this.scene.add(portalGroup);
    }
    
    /**
     * Creates a floating instruction panel for a specific arena portal
     * @param {THREE.Vector3} portalPosition - The position of the portal
     * @param {number} arenaIndex - The arena index (0-4)
     */
    createPortalInstructions(portalPosition, arenaIndex) {
        // Create a container for the instructions (will be shown on demand in updatePortalInstructions)
        const instructionsId = `portal-instructions-${arenaIndex}`;
        
        // Check if it already exists
        let instructionsElement = document.getElementById(instructionsId);
        if (!instructionsElement) {
            instructionsElement = document.createElement('div');
            instructionsElement.id = instructionsId;
            instructionsElement.className = 'portal-instructions';
            instructionsElement.style.position = 'absolute';
            instructionsElement.style.top = '35%';
            instructionsElement.style.left = '50%';
            instructionsElement.style.transform = 'translate(-50%, -50%)';
            instructionsElement.style.color = 'white';
            instructionsElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
            instructionsElement.style.padding = '20px';
            instructionsElement.style.borderRadius = '10px';
            instructionsElement.style.textAlign = 'center';
            instructionsElement.style.width = '400px';
            instructionsElement.style.display = 'none';
            instructionsElement.style.zIndex = '500';
            instructionsElement.style.fontFamily = 'Arial, sans-serif';
            
            instructionsElement.innerHTML = `
                <h2 style="color:#FF6B00; margin-bottom:10px;">Quick Draw Duel ${arenaIndex + 1}</h2>
                <p>Step into the portal to challenge another player to a classic western showdown!</p>
                <ul style="text-align:left; margin-top:10px; padding-left:20px;">
                    <li>Wait for opponent and follow the "READY?" signal</li>
                    <li>Keep your gun holstered until you see "DRAW!"</li>
                    <li>Drawing too early will lock your gun for 3 seconds</li>
                    <li>First player to hit their opponent wins!</li>
                </ul>
            `;
            
            document.getElementById('game-container').appendChild(instructionsElement);
        }
        
        // Show instructions when player gets close to portal
        // Adjust the proximity box based on portal position
        const proximityBox = new THREE.Box3(
            new THREE.Vector3(portalPosition.x - 2, portalPosition.y - 2, portalPosition.z - 2),
            new THREE.Vector3(portalPosition.x + 2, portalPosition.y + 2, portalPosition.z + 2)
        );
        
        // Store the box reference and element in the arena config
        this.arenaConfigs[arenaIndex].portalProximityBox = proximityBox;
        this.arenaConfigs[arenaIndex].instructionsElement = instructionsElement;
    }
    
    /**
     * Check if player is near any portal and show appropriate instructions
     */
    updatePortalInstructions() {
        if (!this.localPlayer || !this.localPlayer.group) {
            return;
        }
        
        const playerPos = this.localPlayer.group.position.clone();
        let nearAnyPortal = false;
        let nearPortalIndex = -1;
        
        // Check each portal
        for (let i = 0; i < this.maxArenas; i++) {
            const config = this.arenaConfigs[i];
            // Skip if no proximity box
            if (!config.portalProximityBox) continue;
            
            const isNearPortal = config.portalProximityBox.containsPoint(playerPos);
            
            if (isNearPortal && !this.inLobby && !this.inDuel) {
                nearAnyPortal = true;
                nearPortalIndex = i;
                
                // Show this portal's instructions
                if (config.instructionsElement) {
                    config.instructionsElement.style.display = 'block';
                }
            } else {
                // Hide instructions for this portal
                if (config.instructionsElement) {
                    config.instructionsElement.style.display = 'none';
                }
            }
        }
        
        // Update any UI that depends on being near a portal
        if (nearAnyPortal) {
            // Additional UI updates could go here
        }
    }
    
    /**
     * Animate a specific portal with a pulsing effect
     * @param {THREE.Mesh} portal - The portal mesh to animate
     * @param {number} arenaIndex - The arena index for color variations
     */
    animatePortal(portal, arenaIndex) {
        const duration = 2000; // ms
        const startTime = performance.now();
        const baseHue = (arenaIndex * 60) % 360; // Different base hue for each portal
        
        const animate = (time) => {
            const elapsed = time - startTime;
            const progress = (elapsed % duration) / duration;
            
            const scale = 1 + 0.1 * Math.sin(progress * Math.PI * 2);
            portal.scale.set(scale, scale, scale);
            
            const hue = (progress * 30) + baseHue; // Cycle through hues based on arena index
            const color = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
            portal.material.color = color;
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Create all duel areas
     */
    createDuelAreas() {
        for (let i = 0; i < this.maxArenas; i++) {
            this.createDuelArea(i);
        }
    }
    
    /**
     * Create a duel area for a specific arena index
     * @param {number} arenaIndex - The arena index (0-4)
     */
    createDuelArea(arenaIndex) {
        const config = this.arenaConfigs[arenaIndex];
        const duelArea = new THREE.Group();
        
        // Ground platform
        const groundGeometry = new THREE.CircleGeometry(config.radius, 32);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xCD853F, // Sandy color
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.copy(config.center);
        ground.position.y = 0.01; // Slightly above main ground
        ground.receiveShadow = true;
        duelArea.add(ground);
        
        // Add western-themed props
        this.addDuelProps(duelArea, arenaIndex);
        
        // Initially hide the duel area
        duelArea.visible = false;
        this.scene.add(duelArea);
        
        // Store in arena config
        config.duelArea = duelArea;
    }
    
    /**
     * Add western-themed props to a specific duel area
     * @param {THREE.Group} duelArea - The duel area group to add props to
     * @param {number} arenaIndex - The arena index for variations
     */
    addDuelProps(duelArea, arenaIndex) {
        const config = this.arenaConfigs[arenaIndex];
        
        // Add cacti around the edge with variations based on arenaIndex
        const cactusCount = 6 + arenaIndex % 3; // Vary cactus count by arena
        
        for (let i = 0; i < cactusCount; i++) {
            const angle = (i / cactusCount) * Math.PI * 2;
            const distance = 12 + Math.random() * 2;
            
            const x = config.center.x + Math.cos(angle) * distance;
            const z = config.center.z + Math.sin(angle) * distance;
            
            this.createCactus(x, z, duelArea, arenaIndex);
        }
        
        // Add arena number marker in the center
        this.createArenaMarker(config.center, arenaIndex, duelArea);
    }
    
    /**
     * Create a central marker showing the arena number
     * @param {THREE.Vector3} center - The center position of the arena
     * @param {number} arenaIndex - The arena index (0-4)
     * @param {THREE.Group} duelArea - The duel area group to add the marker to
     */
    createArenaMarker(center, arenaIndex, duelArea) {
        // Create a standalone sign post
        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
        const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const post = new THREE.Mesh(postGeometry, woodMaterial);
        post.position.set(center.x, 1, center.z);
        duelArea.add(post);
        
        // Create a sign with the arena number
        const signGeometry = new THREE.BoxGeometry(1, 0.7, 0.1);
        const signMaterial = new THREE.MeshStandardMaterial({ color: 0xA0522D });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(center.x, 1.8, center.z);
        duelArea.add(sign);
        
        // Create a texture for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        context.fillStyle = 'white';
        context.font = 'bold 40px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`#${arenaIndex + 1}`, 64, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Apply texture to a plane in front of the sign
        const textGeometry = new THREE.PlaneGeometry(0.8, 0.5);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(center.x, 1.8, center.z + 0.06);
        duelArea.add(textMesh);
    }
    
    /**
     * Create a simple cactus model at the given position with variations based on arena index
     * @param {number} x - X position
     * @param {number} z - Z position
     * @param {THREE.Group} duelArea - The duel area group to add the cactus to
     * @param {number} arenaIndex - Arena index for variations
     */
    createCactus(x, z, duelArea, arenaIndex) {
        const cactusGroup = new THREE.Group();
        
        // Different cactus colors based on arena index
        const cactusColors = [
            0x2E8B57, // Sea green (default)
            0x006400, // Dark green
            0x228B22, // Forest green
            0x3CB371, // Medium sea green
            0x32CD32  // Lime green
        ];
        
        const cactusColor = cactusColors[arenaIndex % cactusColors.length];
        
        // Main body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
        const cactusMaterial = new THREE.MeshStandardMaterial({ color: cactusColor });
        const body = new THREE.Mesh(bodyGeometry, cactusMaterial);
        body.position.y = 1;
        cactusGroup.add(body);
        
        // Add arms
        const armCount = (arenaIndex % 3) + 1; // 1, 2, or 3 arms based on arena index
        
        for (let i = 0; i < armCount; i++) {
            const armGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
            const arm = new THREE.Mesh(armGeometry, cactusMaterial);
            
            const angle = Math.random() * Math.PI * 2;
            const height = 0.5 + Math.random() * 1;
            
            arm.position.set(
                Math.cos(angle) * 0.3,
                height,
                Math.sin(angle) * 0.3
            );
            
            arm.rotation.z = Math.PI / 4 * (Math.random() > 0.5 ? 1 : -1);
            arm.rotation.y = angle;
            
            cactusGroup.add(arm);
        }
        
        cactusGroup.position.set(x, 0, z);
        cactusGroup.castShadow = true;
        duelArea.add(cactusGroup);
    }
    
    /**
     * Initialize network handlers for Quick Draw game mode.
     */
    initNetworkHandlers() {
        // Extend existing network manager with Quick Draw methods
        this.networkManager.sendQuickDrawJoin = (arenaIndex) => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawJoin',
                    arenaIndex: arenaIndex
                }));
            }
        };
        
        this.networkManager.sendQuickDrawLeave = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawLeave'
                }));
            }
        };
        
        this.networkManager.sendQuickDrawShoot = (opponentId) => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                console.log(`Sending Quick Draw hit notification to server: player ${this.localPlayer.id} hit player ${opponentId}`);
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawShoot',
                    opponentId: opponentId,
                    arenaIndex: this.activeArenaIndex
                }));
            }
        };
        
        this.networkManager.sendQuickDrawReady = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawReady',
                    arenaIndex: this.activeArenaIndex
                }));
            }
        };
        
        // Hook into the existing socket onmessage handler
        const originalOnMessage = this.networkManager.socket.onmessage;
        this.networkManager.socket.onmessage = (event) => {
            // Call original handler
            if (originalOnMessage) {
                originalOnMessage(event);
            }
            
            try {
                const message = JSON.parse(event.data);
                
                // Handle Quick Draw specific messages
                switch (message.type) {
                    case 'quickDrawJoin':
                        this.handleQueueJoin(message);
                        break;
                    case 'quickDrawMatch':
                        this.handleMatchFound(message);
                        break;
                    case 'quickDrawReady':
                        this.showReadyMessage();
                        break;
                    case 'quickDrawCountdown':
                        this.startDuelCountdown();
                        break;
                    case 'quickDrawDraw':
                        this.triggerDraw();
                        break;
                    case 'quickDrawEnd':
                        this.endDuel(message.winnerId);
                        break;
                }
            } catch (err) {
                console.error('Error parsing Quick Draw message:', err);
            }
        };
    }
    
    /**
     * Creates an invisible cylindrical boundary for a specific QuickDraw arena
     * @param {number} arenaIndex - The arena index (0-4)
     */
    createQuickDrawArenaBoundary(arenaIndex) {
        if (!this.physics) return null;
        
        const config = this.arenaConfigs[arenaIndex];
        
        // Create the physics boundary for this arena
        const arenaBody = this.physics.createQuickDrawArenaBoundary(
            config.center,
            config.radius,
            config.height
        );
        
        // Store the arena body for this arena
        this.arenaBoundaries[arenaIndex] = arenaBody;
        
        return arenaBody;
    }
    
    /**
     * Removes a specific QuickDraw arena boundary
     * @param {number} arenaIndex - The arena index (0-4)
     */
    removeQuickDrawArenaBoundary(arenaIndex) {
        if (!this.physics) return;
        
        // If there's a boundary for this arena, remove it
        if (this.arenaBoundaries[arenaIndex]) {
            this.physics.removeQuickDrawArenaBoundary();
            this.arenaBoundaries[arenaIndex] = null;
        }
    }
    
    /**
     * Check if a point is inside any active arena
     * @param {THREE.Vector3} point - The point to check
     * @returns {boolean} - True if inside an active arena
     */
    isPointInArena(point) {
        // First check if any arena is active
        if (this.activeArenaIndex < 0 || !this.arenaConfigs[this.activeArenaIndex].duelAreaActive) {
            return false;
        }
        
        const config = this.arenaConfigs[this.activeArenaIndex];
        
        // Use the physics system to check if the point is inside the active arena boundary
        if (this.physics && this.physics.isPointInArenaBoundary) {
            return this.physics.isPointInArenaBoundary(point);
        }
        
        // Fallback to simple cylindrical check if physics is not available
        const dx = point.x - config.center.x;
        const dz = point.z - config.center.z;
        const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
        
        // Check if within radius and height
        return distanceFromCenter <= config.radius && point.y >= 0 && point.y <= config.height;
    }
    
    /**
     * Check if a point is inside a specific arena
     * @param {THREE.Vector3} point - The point to check
     * @param {number} arenaIndex - The arena index to check
     * @returns {boolean} - True if inside the specified arena
     */
    isPointInSpecificArena(point, arenaIndex) {
        if (arenaIndex < 0 || arenaIndex >= this.maxArenas) {
            return false;
        }
        
        const config = this.arenaConfigs[arenaIndex];
        
        // Simple cylindrical check
        const dx = point.x - config.center.x;
        const dz = point.z - config.center.z;
        const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
        
        // Check if within radius and height
        return distanceFromCenter <= config.radius && point.y >= 0 && point.y <= config.height;
    }
    
    /**
     * Update method called from main animation loop.
     */
    update(deltaTime) {
        // Skip if player not loaded
        if (!this.localPlayer || !this.localPlayer.group) {
            return;
        }
        
        // Update physics system
        if (this.physics) {
            this.physics.update(deltaTime);
            
            // If the player is in the arena, enforce arena boundary collision
            if (this.inDuel && this.activeArenaIndex >= 0 && this.arenaBoundaries[this.activeArenaIndex]) {
                const playerPos = this.localPlayer.group.position.clone();
                const config = this.arenaConfigs[this.activeArenaIndex];
                const isInArena = this.isPointInSpecificArena(playerPos, this.activeArenaIndex);
                
                if (!isInArena) {
                    // If player is outside the arena but should be inside, push them back in
                    const dirToCenter = new THREE.Vector3(
                        config.center.x - playerPos.x,
                        0,
                        config.center.z - playerPos.z
                    ).normalize();
                    
                    // Move player back inside
                    this.localPlayer.group.position.x += dirToCenter.x * 0.1;
                    this.localPlayer.group.position.z += dirToCenter.z * 0.1;
                }
            }
        }
        
        // Check for portal collisions when not in lobby or duel
        if (!this.inLobby && !this.inDuel) {
            const playerPos = this.localPlayer.group.position.clone();
            
            // Check each portal for collision
            for (let i = 0; i < this.maxArenas; i++) {
                const config = this.arenaConfigs[i];
                if (!config.portalCollider) continue;
                
                if (config.portalCollider.containsPoint(playerPos)) {
                    this.joinQueue(i);
                    break;
                }
            }
        }
        
        // Animate portals
        for (let i = 0; i < this.maxArenas; i++) {
            const config = this.arenaConfigs[i];
            if (config.portalGroup) {
                // Could add additional animations here if needed
            }
        }
        
        // If in countdown phase, check for early aiming
        if (this.inDuel && this.duelState === 'countdown') {
            if (this.localPlayer.isAiming && !this.gunLocked) {
                this.penalizeEarlyDraw();
            }
        }
        
        // Enforce penalty lock regardless of duel state if penalty is active
        if (performance.now() < this.penaltyEndTime) {
            this.localPlayer.canAim = false;
            this.localPlayer.isAiming = false;
            this.localPlayer.revolver.group.visible = false;
        }
        
        // Update portal instruction visibility
        this.updatePortalInstructions();
    }
    
    /**
     * Updates the Quick Draw status indicator.
     */
    updateStatusIndicator() {
        if (!this.statusIndicator) return;
        
        if (this.inLobby) {
            const arenaNum = this.activeArenaIndex + 1;
            this.statusIndicator.textContent = `Quick Draw Arena ${arenaNum}: Waiting for opponent...`;
            this.statusIndicator.style.display = 'block';
            this.statusIndicator.style.backgroundColor = 'rgba(33, 150, 243, 0.7)';
        } else if (this.inDuel) {
            const arenaNum = this.activeArenaIndex + 1;
            let statusText = `Quick Draw Arena ${arenaNum}: Duel in progress`;
            let bgColor = 'rgba(255, 87, 34, 0.7)';
            
            if (this.duelState === 'ready') {
                statusText = `Quick Draw Arena ${arenaNum}: Get ready!`;
            } else if (this.duelState === 'countdown') {
                statusText = `Quick Draw Arena ${arenaNum}: Wait for the signal...`;
            } else if (this.duelState === 'draw') {
                statusText = `Quick Draw Arena ${arenaNum}: DRAW!`;
                bgColor = 'rgba(244, 67, 54, 0.7)';
            }
            
            this.statusIndicator.textContent = statusText;
            this.statusIndicator.style.display = 'block';
            this.statusIndicator.style.backgroundColor = bgColor;
        } else {
            this.statusIndicator.style.display = 'none';
        }
    }
    
    /**
     * Join the Quick Draw queue for a specific arena.
     * @param {number} arenaIndex - The arena index to join (0-4)
     */
    joinQueue(arenaIndex) {
        if (this.inLobby || this.inDuel) {
            return; // Already in queue or duel
        }
        
        if (arenaIndex < 0 || arenaIndex >= this.maxArenas) {
            console.error(`Invalid arena index: ${arenaIndex}`);
            return;
        }
        
        this.inLobby = true;
        this.activeArenaIndex = arenaIndex;
        
        // Update the player's lobby index
        this.localPlayer.setQuickDrawLobby(arenaIndex);
        
        this.showMessage(`Joining Quick Draw Arena ${arenaIndex + 1} queue...`);
        this.updateStatusIndicator();
        
        // Send join request to server with arena index
        this.networkManager.sendQuickDrawJoin(arenaIndex);
        
        console.log(`Joined Quick Draw queue for arena ${arenaIndex + 1}`);
    }
    
    /**
     * Handle queue join confirmation from server.
     */
    handleQueueJoin(message) {
        // Make sure the arena index matches what we expect
        if (message.arenaIndex !== undefined && message.arenaIndex !== this.activeArenaIndex) {
            this.activeArenaIndex = message.arenaIndex;
            this.localPlayer.setQuickDrawLobby(message.arenaIndex);
        }
        
        this.showMessage(`Waiting for opponent in Arena ${this.activeArenaIndex + 1}...`);
        this.updateStatusIndicator();
        console.log(`Quick Draw queue joined for arena ${this.activeArenaIndex + 1}, waiting for opponent`);
    }
    
    /**
     * Handle match found notification from server.
     */
    handleMatchFound(message) {
        this.inLobby = false;
        this.inDuel = true;
        this.duelOpponentId = message.opponentId;
        
        // Make sure we're using the correct arena
        if (message.arenaIndex !== undefined) {
            this.activeArenaIndex = message.arenaIndex;
            this.localPlayer.setQuickDrawLobby(message.arenaIndex);
        }
        
        this.updateStatusIndicator();
        
        this.showMessage(`Opponent found! Preparing duel in Arena ${this.activeArenaIndex + 1}...`);
        
        const config = this.arenaConfigs[this.activeArenaIndex];
        
        // Teleport to the correct duel area
        // For "left" side, spawn on the left; for "right", spawn on the right
        const playerPosition = message.position === 'left' ?
            new THREE.Vector3(config.center.x - 5, 1.6, config.center.z) : 
            new THREE.Vector3(config.center.x + 5, 1.6, config.center.z);
        
        this.localPlayer.group.position.copy(playerPosition);
        
        // Invert player orientation by 180°:
        // For left side, set rotation.y to (Math.PI/2 + Math.PI) = 3π/2; for right, (-Math.PI/2 + Math.PI) = π/2
        if (message.position === 'left') {
            this.localPlayer.group.rotation.y = 3 * Math.PI / 2;
        } else {
            this.localPlayer.group.rotation.y = Math.PI / 2;
        }
        
        // Make the correct duel area visible
        if (config.duelArea) {
            config.duelArea.visible = true;
            config.duelAreaActive = true;
        }
        
        // Create the arena physics boundary
        this.createQuickDrawArenaBoundary(this.activeArenaIndex);
        
        // Disable weapon drawing immediately and forcefully
        this.originalCanAim = this.localPlayer.canAim !== false;
        this.localPlayer.canAim = false;
        this.localPlayer.isAiming = false;
        this.localPlayer.revolver.group.visible = false;
        
        // Tell server we're ready after a moment
        setTimeout(() => {
            this.networkManager.sendQuickDrawReady();
        }, 1000);
    }
    
    /**
     * Show the "READY?" message with enhanced typography.
     */
    showReadyMessage() {
        this.duelState = 'ready';
        this.updateStatusIndicator();
        this.messageOverlay.textContent = 'READY?';
        this.messageOverlay.style.display = 'block';
        this.messageOverlay.style.fontSize = '64px';
        this.messageOverlay.style.color = '#FFFFFF';
        
        // Use a slight scale animation
        this.messageOverlay.style.transition = 'transform 0.2s ease-in-out';
        this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
        
        // Trigger animation
        setTimeout(() => {
            this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1.1)';
            setTimeout(() => {
                this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 200);
        }, 10);
        
        // Hide after 1 second
        setTimeout(() => {
            this.hideMessage();
        }, 1000);
    }
    
    /**
     * Start the countdown phase of the duel.
     */
    startDuelCountdown() {
        this.duelState = 'countdown';
        this.updateStatusIndicator();
        this.hideMessage();
        
        // Explicitly disable aiming during countdown
        this.localPlayer.canAim = false;
        
        console.log('Duel countdown started - waiting for draw signal');
    }
    
    /**
     * Trigger the "DRAW!" signal with just the expanding circle.
     */
    triggerDraw() {
        this.duelState = 'draw';
        this.updateStatusIndicator();
        
        // Show animated circle with CSS animation
        this.drawCircle.style.display = 'block';
        this.drawCircle.classList.add('draw-circle-animation');
        
        // Only enable aiming if the penalty period has expired.
        if (performance.now() >= this.penaltyEndTime) {
            this.localPlayer.canAim = this.originalCanAim;
        } else {
            console.log("Penalty still active; gun remains locked.");
        }
        
        console.log('DRAW signal triggered - players can now shoot (if not penalized)');
        
        // Play bell start sound instead of a gunshot
        if (this.soundManager) {
            this.soundManager.playSound("bellstart");
        }
        
        // Remove animation class after it completes
        setTimeout(() => {
            this.drawCircle.classList.remove('draw-circle-animation');
            this.drawCircle.style.display = 'none';
        }, 400);
    }
    
    /**
     * Apply a penalty with dramatic red flashing warning.
     * Once triggered, records a penalty end time so that gun drawing remains locked
     * for a full 3 seconds even if the "DRAW!" signal comes.
     */
    penalizeEarlyDraw() {
        if (this.gunLocked) return;
        
        this.gunLocked = true;
        this.penaltyEndTime = performance.now() + 3000;
        
        // Show the message with a warning style
        this.showMessage('TOO EARLY!', 3000);
        this.messageOverlay.classList.add('gun-locked-warning');
        
        // Disable aiming for penalty duration
        this.localPlayer.canAim = false;
        this.localPlayer.isAiming = false;
        this.localPlayer.revolver.group.visible = false;
        
        // Add a subtle screen flash
        const penaltyFlash = document.createElement('div');
        penaltyFlash.style.position = 'absolute';
        penaltyFlash.style.top = '0';
        penaltyFlash.style.left = '0';
        penaltyFlash.style.width = '100%';
        penaltyFlash.style.height = '100%';
        penaltyFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        penaltyFlash.style.opacity = '0';
        penaltyFlash.style.transition = 'opacity 0.3s ease-in-out';
        penaltyFlash.style.pointerEvents = 'none';
        penaltyFlash.style.zIndex = '990';
        document.getElementById('game-container').appendChild(penaltyFlash);
        
        // Flash the screen
        setTimeout(() => {
            penaltyFlash.style.opacity = '1';
            setTimeout(() => {
                penaltyFlash.style.opacity = '0';
                setTimeout(() => {
                    if (penaltyFlash.parentNode) {
                        penaltyFlash.parentNode.removeChild(penaltyFlash);
                    }
                }, 300);
            }, 200);
        }, 10);
        
        // Play error sound
        if (this.soundManager) {
            this.soundManager.playSound("aimclick");
        }
        
        // Countdown timer text update
        let secondsLeft = 3;
        const updateCountdown = () => {
            this.messageOverlay.textContent = `TOO EARLY! Gun locked (${secondsLeft}s)`;
            secondsLeft--;
            
            if (secondsLeft >= 0) {
                this.penaltyTimer = setTimeout(updateCountdown, 1000);
            }
        };
        updateCountdown();
        
        // After 3 seconds, clear the penalty
        setTimeout(() => {
            this.gunLocked = false;
            this.penaltyEndTime = 0;
            this.hideMessage();
            this.messageOverlay.classList.remove('gun-locked-warning');
        }, 3000);
    }
    
    /**
     * End the duel with enhanced win/lose UI effects.
     */
    endDuel(winnerId) {
        const isWinner = winnerId === this.localPlayer.id;
        
        // Show winner/loser message with dramatic styling
        if (isWinner) {
            this.showMessage('YOU WIN!', 2000);
            this.messageOverlay.classList.add('quick-draw-winner');
            
            // Add a subtle victory flash
            const victoryFlash = document.createElement('div');
            victoryFlash.style.position = 'absolute';
            victoryFlash.style.top = '0';
            victoryFlash.style.left = '0';
            victoryFlash.style.width = '100%';
            victoryFlash.style.height = '100%';
            victoryFlash.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
            victoryFlash.style.opacity = '0';
            victoryFlash.style.transition = 'opacity 0.5s ease-in-out';
            victoryFlash.style.pointerEvents = 'none';
            victoryFlash.style.zIndex = '990';
            document.getElementById('game-container').appendChild(victoryFlash);
            
            setTimeout(() => {
                victoryFlash.style.opacity = '1';
                setTimeout(() => {
                    victoryFlash.style.opacity = '0';
                    setTimeout(() => {
                        if (victoryFlash.parentNode) {
                            victoryFlash.parentNode.removeChild(victoryFlash);
                        }
                    }, 500);
                }, 1000);
            }, 10);
        } else {
            this.showMessage('YOU LOSE!', 2000);
            this.messageOverlay.classList.add('quick-draw-loser');
            
            // Add a defeat flash for the loser
            const defeatFlash = document.createElement('div');
            defeatFlash.style.position = 'absolute';
            defeatFlash.style.top = '0';
            defeatFlash.style.left = '0';
            defeatFlash.style.width = '100%';
            defeatFlash.style.height = '100%';
            defeatFlash.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
            defeatFlash.style.opacity = '0';
            defeatFlash.style.transition = 'opacity 0.5s ease-in-out';
            defeatFlash.style.pointerEvents = 'none';
            defeatFlash.style.zIndex = '990';
            document.getElementById('game-container').appendChild(defeatFlash);
            
            setTimeout(() => {
                defeatFlash.style.opacity = '1';
                setTimeout(() => {
                    defeatFlash.style.opacity = '0';
                    setTimeout(() => {
                        if (defeatFlash.parentNode) {
                            defeatFlash.parentNode.removeChild(defeatFlash);
                        }
                    }, 500);
                }, 1000);
            }, 10);
        }
        
        // Store the current arena index before resetting
        const endedArenaIndex = this.activeArenaIndex;
        
        // Reset duel state
        this.duelState = 'none';
        this.inDuel = false;
        this.duelOpponentId = null;
        this.updateStatusIndicator();
        
        // Clean up the physics boundary
        this.removeQuickDrawArenaBoundary(endedArenaIndex);
        
        // Clear any timers
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.drawTimer) clearTimeout(this.drawTimer);
        if (this.penaltyTimer) clearTimeout(this.penaltyTimer);
        
        // Hide the active duel area and teleport back to spawn after delay
        setTimeout(() => {
            // Make sure we're hiding the correct duel area
            if (endedArenaIndex >= 0 && endedArenaIndex < this.maxArenas) {
                const config = this.arenaConfigs[endedArenaIndex];
                if (config.duelArea) {
                    config.duelArea.visible = false;
                    config.duelAreaActive = false;
                }
            }
            
            // Teleport back to normal spawn
            this.localPlayer.spawnPlayerRandomly();
            
            // Re-enable normal controls
            this.localPlayer.canAim = this.originalCanAim;
            this.gunLocked = false;
            
            // Reset health
            this.localPlayer.health = 100;
            if (typeof window.updateHealthUI === 'function') {
                window.updateHealthUI(this.localPlayer);
            }
            
            // Reset message styling
            this.messageOverlay.classList.remove('quick-draw-winner', 'quick-draw-loser');
            
            // Reset active arena and Quick Draw lobby
            this.activeArenaIndex = -1;
            this.localPlayer.setQuickDrawLobby(-1);
        }, 2000);
    }
    
    /**
     * Helper to show a message in the center of the screen.
     */
    showMessage(message, duration = 0) {
        this.messageOverlay.textContent = message;
        this.messageOverlay.style.display = 'block';
        
        if (duration > 0) {
            setTimeout(() => {
                this.hideMessage();
            }, duration);
        }
    }
    
    /**
     * Hide the message overlay.
     */
    hideMessage() {
        this.messageOverlay.style.display = 'none';
    }
    
    /**
     * Cleanup resources.
     */
    cleanup() {
        // Remove portals and indicators for each arena
        for (let i = 0; i < this.maxArenas; i++) {
            const config = this.arenaConfigs[i];
            
            // Remove portal
            if (config.portalGroup) {
                this.scene.remove(config.portalGroup);
                config.portalGroup.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
            
            // Remove duel area
            if (config.duelArea) {
                this.scene.remove(config.duelArea);
                config.duelArea.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
            
            // Remove instruction elements
            if (config.instructionsElement && config.instructionsElement.parentNode) {
                config.instructionsElement.parentNode.removeChild(config.instructionsElement);
            }
            
            // Remove physics boundary
            this.removeQuickDrawArenaBoundary(i);
        }
        
        // Clean up physics
        if (this.physics) {
            this.physics.cleanup();
        }
        
        // Remove UI elements
        if (this.messageOverlay && this.messageOverlay.parentNode) {
            this.messageOverlay.parentNode.removeChild(this.messageOverlay);
        }
        
        if (this.drawCircle && this.drawCircle.parentNode) {
            this.drawCircle.parentNode.removeChild(this.drawCircle);
        }
        
        if (this.statusIndicator && this.statusIndicator.parentNode) {
            this.statusIndicator.parentNode.removeChild(this.statusIndicator);
        }
        
        if (this.lobbyIndicator && this.lobbyIndicator.parentNode) {
            this.lobbyIndicator.parentNode.removeChild(this.lobbyIndicator);
        }
        
        // Clear timers
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.drawTimer) clearTimeout(this.drawTimer);
        if (this.penaltyTimer) clearTimeout(this.penaltyTimer);
    }
}