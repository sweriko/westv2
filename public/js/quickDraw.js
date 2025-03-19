/**
 * Quick Draw game mode implementation
 * Players face off in a wild west duel where they must wait for the "draw" signal
 * before pulling their revolvers and shooting at each other.
 */
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
        
        // Duel area position
        this.duelCenter = new THREE.Vector3(50, 0, 50); // Far from main spawn
        
        // Initialize portal, duel area, and network handlers
        this.initPortal();
        this.createDuelArea();
        this.initNetworkHandlers();
        this.createUI();

        // Make this instance globally accessible for network handlers
        window.quickDraw = this;
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
        this.drawCircle.style.width = '600px'; // Much bigger circle (was 300px)
        this.drawCircle.style.height = '600px'; // Much bigger circle (was 300px)
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
    }
    
    /**
     * Initialize the portal near spawn that players can walk into to join the queue.
     */
    initPortal() {
        // Create a visible portal that players can walk into
        const portalGeometry = new THREE.RingGeometry(1, 1.2, 32);
        const portalMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFF6B00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.portal = new THREE.Mesh(portalGeometry, portalMaterial);
        this.portal.position.set(5, 1.5, 5); // Near the spawn point
        this.portal.rotation.y = Math.PI / 2; // Make it vertical
        this.scene.add(this.portal);
        
        // Add text above the portal
        const textCanvas = document.createElement('canvas');
        const context = textCanvas.getContext('2d');
        textCanvas.width = 256;
        textCanvas.height = 64;
        context.fillStyle = 'white';
        context.font = 'bold 28px Arial';
        context.textAlign = 'center';
        context.fillText('QUICK DRAW', 128, 40);
        
        const textTexture = new THREE.Texture(textCanvas);
        textTexture.needsUpdate = true;
        
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const textGeometry = new THREE.PlaneGeometry(2, 0.5);
        this.portalText = new THREE.Mesh(textGeometry, textMaterial);
        this.portalText.position.set(5, 2.5, 5);
        this.portalText.rotation.y = Math.PI / 2;
        this.scene.add(this.portalText);
        
        // Create collision detector for the portal
        this.portalCollider = new THREE.Box3(
            new THREE.Vector3(4.5, 0, 4.5),
            new THREE.Vector3(5.5, 3, 5.5)
        );
        
        // Animate the portal
        this.animatePortal();
        
        // Add instructions
        this.createPortalInstructions();
    }
    
    /**
     * Creates a floating instruction panel above the portal.
     */
    createPortalInstructions() {
        // Create a container for the instructions
        this.instructionsElement = document.createElement('div');
        this.instructionsElement.id = 'portal-instructions';
        this.instructionsElement.style.position = 'absolute';
        this.instructionsElement.style.top = '35%';
        this.instructionsElement.style.left = '50%';
        this.instructionsElement.style.transform = 'translate(-50%, -50%)';
        this.instructionsElement.style.color = 'white';
        this.instructionsElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.instructionsElement.style.padding = '20px';
        this.instructionsElement.style.borderRadius = '10px';
        this.instructionsElement.style.textAlign = 'center';
        this.instructionsElement.style.width = '400px';
        this.instructionsElement.style.display = 'none';
        this.instructionsElement.style.zIndex = '500';
        this.instructionsElement.style.fontFamily = 'Arial, sans-serif';
        
        this.instructionsElement.innerHTML = `
            <h2 style="color:#FF6B00; margin-bottom:10px;">Quick Draw Duel</h2>
            <p>Step into the portal to challenge another player to a classic western showdown!</p>
            <ul style="text-align:left; margin-top:10px; padding-left:20px;">
                <li>Wait for opponent and follow the "READY?" signal</li>
                <li>Keep your gun holstered until you see "DRAW!"</li>
                <li>Drawing too early will lock your gun for 3 seconds</li>
                <li>First player to hit their opponent wins!</li>
            </ul>
        `;
        
        document.getElementById('game-container').appendChild(this.instructionsElement);
        
        // Show instructions when player gets close to portal
        this.portalProximityBox = new THREE.Box3(
            new THREE.Vector3(3, 0, 3),
            new THREE.Vector3(7, 3, 7)
        );
    }
    
    /**
     * Check if player is near the portal and show instructions.
     */
    updatePortalInstructions() {
        if (!this.localPlayer || !this.localPlayer.group || !this.instructionsElement || !this.portalProximityBox) {
            return;
        }
        
        const playerPos = this.localPlayer.group.position.clone();
        const isNearPortal = this.portalProximityBox.containsPoint(playerPos);
        
        if (isNearPortal && !this.inLobby && !this.inDuel) {
            this.instructionsElement.style.display = 'block';
        } else {
            this.instructionsElement.style.display = 'none';
        }
    }
    
    /**
     * Animate the portal with a pulsing effect.
     */
    animatePortal() {
        const duration = 2000; // ms
        const startTime = performance.now();
        
        const animate = (time) => {
            const elapsed = time - startTime;
            const progress = (elapsed % duration) / duration;
            
            const scale = 1 + 0.1 * Math.sin(progress * Math.PI * 2);
            this.portal.scale.set(scale, scale, scale);
            
            const hue = (progress * 60) + 20; // Cycle through orange/red hues
            const color = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
            this.portal.material.color = color;
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Create the duel area where the players will face off.
     */
    createDuelArea() {
        this.duelArea = new THREE.Group();
        
        // Ground platform
        const groundGeometry = new THREE.CircleGeometry(15, 32);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xCD853F, // Sandy color
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.copy(this.duelCenter);
        ground.position.y = 0.01; // Slightly above main ground
        ground.receiveShadow = true;
        this.duelArea.add(ground);
        
        // Invisible boundary walls
        const wallHeight = 3;
        const wallRadius = 15;
        const wallSegments = 16;
        
        for (let i = 0; i < wallSegments; i++) {
            const angle1 = (i / wallSegments) * Math.PI * 2;
            const angle2 = ((i + 1) / wallSegments) * Math.PI * 2;
            
            const x1 = this.duelCenter.x + Math.cos(angle1) * wallRadius;
            const z1 = this.duelCenter.z + Math.sin(angle1) * wallRadius;
            const x2 = this.duelCenter.x + Math.cos(angle2) * wallRadius;
            const z2 = this.duelCenter.z + Math.sin(angle2) * wallRadius;
            
            const wallGeometry = new THREE.BoxGeometry(
                Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2)),
                wallHeight,
                0.1
            );
            
            const wallMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFFFF,
                transparent: true,
                opacity: 0.0 // Invisible
            });
            
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
                (x1 + x2) / 2,
                wallHeight / 2,
                (z1 + z2) / 2
            );
            
            wall.lookAt(this.duelCenter.x, wallHeight / 2, this.duelCenter.z);
            this.duelArea.add(wall);
        }
        
        // Add western-themed props
        this.addDuelProps();
        
        // Initially hide the duel area
        this.duelArea.visible = false;
        this.scene.add(this.duelArea);
    }
    
    /**
     * Add western-themed props to the duel area.
     */
    addDuelProps() {
        // Add cacti around the edge
        const cactusCount = 8;
        
        for (let i = 0; i < cactusCount; i++) {
            const angle = (i / cactusCount) * Math.PI * 2;
            const distance = 12 + Math.random() * 2;
            
            const x = this.duelCenter.x + Math.cos(angle) * distance;
            const z = this.duelCenter.z + Math.sin(angle) * distance;
            
            this.createCactus(x, z);
        }
        
        // Add tumbleweeds, barrels, etc. if desired
    }
    
    /**
     * Create a simple cactus model at the given position.
     */
    createCactus(x, z) {
        const cactusGroup = new THREE.Group();
        
        // Main body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
        const cactusMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 });
        const body = new THREE.Mesh(bodyGeometry, cactusMaterial);
        body.position.y = 1;
        cactusGroup.add(body);
        
        // Add arms
        const armCount = 1 + Math.floor(Math.random() * 2);
        
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
        this.duelArea.add(cactusGroup);
    }
    
    /**
     * Initialize network handlers for Quick Draw game mode.
     */
    initNetworkHandlers() {
        // Extend existing network manager with Quick Draw methods
        this.networkManager.sendQuickDrawJoin = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawJoin'
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
                    opponentId: opponentId
                }));
            }
        };
        
        this.networkManager.sendQuickDrawReady = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawReady'
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
     * Check if a point is inside the duel arena
     * @param {THREE.Vector3} point - The point to check
     * @returns {boolean} - True if the point is inside the arena
     */
    isPointInArena(point) {
        if (!this.duelArea || !this.duelArea.visible) {
            return false;
        }
        
        // The arena is a cylinder, so check if the point is within radius and height
        const dx = point.x - this.duelCenter.x;
        const dz = point.z - this.duelCenter.z;
        const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
        
        // Check if within radius (15 units) and height (0 to 5 units)
        return distanceFromCenter <= 15 && point.y >= 0 && point.y <= 5;
    }
    
    /**
     * Update method called from main animation loop.
     */
    update(deltaTime) {
        // Skip if player not loaded
        if (!this.localPlayer || !this.localPlayer.group) {
            return;
        }
        
        // Check for portal collision when not in lobby or duel
        if (!this.inLobby && !this.inDuel) {
            const playerPos = this.localPlayer.group.position.clone();
            if (this.portalCollider.containsPoint(playerPos)) {
                this.joinQueue();
            }
        }
        
        // Animate portal
        if (this.portal) {
            this.portal.rotation.y += deltaTime * 0.5;
        }
        
        // ENHANCED CHECK: Aggressively check for early weapon drawing during countdown
        if (this.inDuel && this.duelState === 'countdown') {
            // Force the gun to be holstered during countdown
            if (this.localPlayer.isAiming && !this.gunLocked) {
                this.penalizeEarlyDraw();
            }
            
            // Even if not aiming, ensure the gun remains holstered
            this.localPlayer.canAim = false;
            this.localPlayer.revolver.group.visible = false;
        }
        
        // Update portal instructions visibility
        this.updatePortalInstructions();
    }
    
    /**
     * Updates the Quick Draw status indicator.
     */
    updateStatusIndicator() {
        if (!this.statusIndicator) return;
        
        if (this.inLobby) {
            this.statusIndicator.textContent = 'Quick Draw: Waiting for opponent...';
            this.statusIndicator.style.display = 'block';
            this.statusIndicator.style.backgroundColor = 'rgba(33, 150, 243, 0.7)';
        } else if (this.inDuel) {
            let statusText = 'Quick Draw: Duel in progress';
            let bgColor = 'rgba(255, 87, 34, 0.7)';
            
            if (this.duelState === 'ready') {
                statusText = 'Quick Draw: Get ready!';
            } else if (this.duelState === 'countdown') {
                statusText = 'Quick Draw: Wait for the signal...';
            } else if (this.duelState === 'draw') {
                statusText = 'Quick Draw: DRAW!';
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
     * Join the Quick Draw queue.
     */
    joinQueue() {
        if (this.inLobby || this.inDuel) {
            return; // Already in queue or duel
        }
        
        this.inLobby = true;
        this.showMessage('Joining Quick Draw queue...');
        this.updateStatusIndicator();
        
        // Send join request to server
        this.networkManager.sendQuickDrawJoin();
        
        console.log('Joined Quick Draw queue');
    }
    
    /**
     * Handle queue join confirmation from server.
     */
    handleQueueJoin(message) {
        this.showMessage('Waiting for opponent...');
        this.updateStatusIndicator();
        console.log('Quick Draw queue joined, waiting for opponent');
    }
    
    /**
     * Handle match found notification from server.
     */
    handleMatchFound(message) {
        this.inLobby = false;
        this.inDuel = true;
        this.duelOpponentId = message.opponentId;
        this.updateStatusIndicator();
        
        this.showMessage('Opponent found! Preparing duel...');
        
        // Teleport to duel area
        const playerPosition = message.position === 'left' ?
            new THREE.Vector3(this.duelCenter.x - 5, 1.6, this.duelCenter.z) : 
            new THREE.Vector3(this.duelCenter.x + 5, 1.6, this.duelCenter.z);
        
        this.localPlayer.group.position.copy(playerPosition);
        
        // Face the opponent
        if (message.position === 'left') {
            this.localPlayer.group.rotation.y = 0; // Face right
        } else {
            this.localPlayer.group.rotation.y = Math.PI; // Face left
        }
        
        // Make duel area visible
        this.duelArea.visible = true;
        
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
        
        // Show animated circle with CSS animation - MUCH BIGGER
        this.drawCircle.style.display = 'block';
        this.drawCircle.classList.add('draw-circle-animation');
        
        // NO TEXT - just the circle animation
        // Don't show "DRAW!" text anymore
        
        // Enable aiming
        this.localPlayer.canAim = this.originalCanAim;
        
        console.log('DRAW signal triggered - players can now shoot');
        
        // Play sound
        if (this.soundManager) {
            // Play both sounds for dramatic effect
            this.soundManager.playSound("aimclick");
            setTimeout(() => {
                this.soundManager.playSound("shot1");
            }, 100);
        }
        
        // Remove animation class after it completes
        setTimeout(() => {
            this.drawCircle.classList.remove('draw-circle-animation');
            this.drawCircle.style.display = 'none';
        }, 400);
    }
    
    /**
     * Apply a penalty with dramatic red flashing warning.
     */
    penalizeEarlyDraw() {
        if (this.gunLocked) return;
        
        this.gunLocked = true;
        
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
        
        // Add countdown timer text
        let secondsLeft = 3;
        const updateCountdown = () => {
            this.messageOverlay.textContent = `TOO EARLY! Gun locked (${secondsLeft}s)`;
            secondsLeft--;
            
            if (secondsLeft >= 0) {
                this.penaltyTimer = setTimeout(updateCountdown, 1000);
            }
        };
        
        updateCountdown();
        
        // Enable aiming after penalty
        setTimeout(() => {
            if (this.duelState === 'draw') {
                this.localPlayer.canAim = this.originalCanAim;
            }
            this.gunLocked = false;
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
        
        // Reset duel state
        this.duelState = 'none';
        this.inDuel = false;
        this.duelOpponentId = null;
        this.updateStatusIndicator();
        
        // Clear any timers
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.drawTimer) clearTimeout(this.drawTimer);
        if (this.penaltyTimer) clearTimeout(this.penaltyTimer);
        
        // Hide duel area and teleport back to spawn after delay
        setTimeout(() => {
            this.duelArea.visible = false;
            
            // Teleport back to normal spawn
            this.localPlayer.group.position.set(0, 1.6, 0);
            
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
        // Remove portal
        if (this.portal) {
            this.scene.remove(this.portal);
            this.portal.geometry.dispose();
            this.portal.material.dispose();
        }
        
        if (this.portalText) {
            this.scene.remove(this.portalText);
            this.portalText.geometry.dispose();
            this.portalText.material.dispose();
        }
        
        // Remove duel area
        if (this.duelArea) {
            this.scene.remove(this.duelArea);
            // Dispose of geometries and materials
            this.duelArea.traverse(child => {
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
        
        if (this.instructionsElement && this.instructionsElement.parentNode) {
            this.instructionsElement.parentNode.removeChild(this.instructionsElement);
        }
        
        // Clear timers
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.drawTimer) clearTimeout(this.drawTimer);
        if (this.penaltyTimer) clearTimeout(this.penaltyTimer);
    }
}