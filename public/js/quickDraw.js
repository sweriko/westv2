/**
 * Quick Draw game mode implementation
 * Players face off in a wild west duel where they must wait for the "draw" signal
 * before pulling their revolvers and shooting at each other.
 * Now with direct player-to-player challenges directly on the town map.
 */

import { PhysicsSystem } from './physics.js';
import { createOptimizedSmokeEffect } from './input.js';

export class QuickDraw {
    constructor(scene, localPlayer, networkManager, soundManager) {
        this.scene = scene;
        this.localPlayer = localPlayer;
        this.networkManager = networkManager;
        this.soundManager = soundManager;
        
        // Detect mobile devices if not already set
        if (window.isMobileDevice === undefined) {
            window.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        }
        
        // Initialize mouse tracking for right-click detection
        if (!window.mouseDown) {
            window.mouseDown = { left: false, right: false };
            
            document.addEventListener('mousedown', (event) => {
                if (event.button === 0) {
                    window.mouseDown.left = true;
                } else if (event.button === 2) {
                    window.mouseDown.right = true;
                }
            });
            
            document.addEventListener('mouseup', (event) => {
                if (event.button === 0) {
                    window.mouseDown.left = false;
                } else if (event.button === 2) {
                    window.mouseDown.right = false;
                }
            });
            
            // Also track when pointer leaves window
            document.addEventListener('pointerleave', () => {
                window.mouseDown.left = false;
                window.mouseDown.right = false;
            });
        }
        
        // Game state
        this.inLobby = false;
        this.inDuel = false;
        this.duelOpponentId = null;
        this.duelState = 'none'; // 'none', 'ready', 'countdown', 'draw'
        this.gunLocked = false;
        this.originalCanAim = true;
        // Record the time (in ms) until which the gun remains locked
        this.penaltyEndTime = 0;
        
        // Direct challenge system
        this.playerProximityRadius = 5; // 5 units radius for challenge detection
        this.nearbyPlayers = new Map(); // Map of nearby player IDs to their data
        this.challengePromptActive = false; // Whether the challenge prompt is active
        this.pendingChallenge = null; // Store info about pending challenge
        this.challengeAccepted = false; // Whether a challenge has been accepted
        this.challengeUIVisible = false; // Whether challenge UI is visible
        
        // Initialize physics system for collision detection
        this.physics = new PhysicsSystem();
        
        // Initialize the network handlers and challenge UI
        this.initNetworkHandlers();
        this.createUI();
        this.createChallengeUI();

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
        
        // Health bar container
        this.healthBarContainer = document.createElement('div');
        this.healthBarContainer.id = 'health-bar-container';
        this.healthBarContainer.style.position = 'absolute';
        this.healthBarContainer.style.top = '20px';
        this.healthBarContainer.style.left = '50%';
        this.healthBarContainer.style.transform = 'translateX(-50%)';
        this.healthBarContainer.style.width = '300px';
        this.healthBarContainer.style.height = '30px';
        this.healthBarContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.healthBarContainer.style.borderRadius = '5px';
        this.healthBarContainer.style.padding = '5px';
        this.healthBarContainer.style.display = 'none';
        this.healthBarContainer.style.zIndex = '1000';
        
        // Health bar
        this.healthBar = document.createElement('div');
        this.healthBar.id = 'health-bar';
        this.healthBar.style.width = '100%';
        this.healthBar.style.height = '100%';
        this.healthBar.style.backgroundColor = '#00FF00';
        this.healthBar.style.borderRadius = '3px';
        this.healthBar.style.transition = 'width 0.3s ease-in-out';
        
        // Health text
        this.healthText = document.createElement('div');
        this.healthText.id = 'health-text';
        this.healthText.style.position = 'absolute';
        this.healthText.style.top = '50%';
        this.healthText.style.left = '50%';
        this.healthText.style.transform = 'translate(-50%, -50%)';
        this.healthText.style.color = 'white';
        this.healthText.style.fontSize = '14px';
        this.healthText.style.fontWeight = 'bold';
        this.healthText.style.textShadow = '1px 1px 2px black';
        this.healthText.textContent = '100 HP';
        
        // Assemble health bar
        this.healthBarContainer.appendChild(this.healthBar);
        this.healthBarContainer.appendChild(this.healthText);
        document.getElementById('game-container').appendChild(this.healthBarContainer);
    }
    
    /**
     * Create UI elements specific to the direct challenge system
     */
    createChallengeUI() {
        // Challenge prompt - shown when near another player
        this.challengePrompt = document.createElement('div');
        this.challengePrompt.id = 'quick-draw-challenge-prompt';
        this.challengePrompt.style.position = 'absolute';
        this.challengePrompt.style.top = '75%';
        this.challengePrompt.style.left = '50%';
        this.challengePrompt.style.transform = 'translate(-50%, -50%)';
        this.challengePrompt.style.color = 'white';
        this.challengePrompt.style.fontSize = '24px';
        this.challengePrompt.style.fontWeight = 'bold';
        this.challengePrompt.style.textAlign = 'center';
        this.challengePrompt.style.padding = '15px 20px';
        this.challengePrompt.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.challengePrompt.style.borderRadius = '10px';
        this.challengePrompt.style.display = 'none';
        this.challengePrompt.style.zIndex = '1000';
        this.challengePrompt.textContent = 'Press E to challenge to a Quick Draw duel';
        document.getElementById('game-container').appendChild(this.challengePrompt);
        
        // Challenge invitation - shown when receiving a challenge
        this.challengeInvitation = document.createElement('div');
        this.challengeInvitation.id = 'quick-draw-invitation';
        this.challengeInvitation.style.position = 'absolute';
        this.challengeInvitation.style.top = '40%';
        this.challengeInvitation.style.left = '50%';
        this.challengeInvitation.style.transform = 'translate(-50%, -50%)';
        this.challengeInvitation.style.color = 'white';
        this.challengeInvitation.style.fontSize = '28px';
        this.challengeInvitation.style.fontWeight = 'bold';
        this.challengeInvitation.style.textAlign = 'center';
        this.challengeInvitation.style.padding = '20px 25px';
        this.challengeInvitation.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        this.challengeInvitation.style.borderRadius = '10px';
        this.challengeInvitation.style.border = '2px solid #FF6B00';
        this.challengeInvitation.style.boxShadow = '0 0 15px rgba(255, 107, 0, 0.7)';
        this.challengeInvitation.style.display = 'none';
        this.challengeInvitation.style.zIndex = '1100';
        this.challengeInvitation.innerHTML = `
            <div style="margin-bottom: 15px">Player X challenges you to a Quick Draw duel!</div>
            <div style="display: flex; justify-content: space-around; margin-top: 10px;">
                <div style="background-color: #4CAF50; padding: 10px 20px; border-radius: 5px;">Press Enter to accept</div>
                <div style="background-color: #F44336; padding: 10px 20px; border-radius: 5px;">Press T to decline</div>
            </div>
        `;
        document.getElementById('game-container').appendChild(this.challengeInvitation);
        
        // Add keyboard event listener for challenge interactions
        document.addEventListener('keydown', (event) => this.handleChallengeKeypress(event));
    }
    
    /**
     * Handle keypresses for the challenge system
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleChallengeKeypress(event) {
        // Skip if not in game or if player is in lobby/duel
        if (!this.localPlayer || this.inLobby || this.inDuel) return;
        
        switch (event.code) {
            case 'KeyE':
                // Send challenge when near a player
                if (this.challengePromptActive) {
                    this.sendChallenge();
                }
                break;
                
            case 'Enter':
                // Accept invitation
                if (this.pendingChallenge) {
                    this.acceptChallenge();
                }
                break;
                
            case 'KeyT':
                // Decline invitation
                if (this.pendingChallenge) {
                    this.declineChallenge();
                }
                break;
        }
    }
    
    /**
     * Initialize network handlers for Quick Draw game mode.
     */
    initNetworkHandlers() {
        // Methods for direct challenges
        this.networkManager.sendQuickDrawChallenge = (targetPlayerId) => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawChallenge',
                    targetPlayerId: targetPlayerId
                }));
            }
        };
        
        this.networkManager.sendQuickDrawAccept = (challengerId) => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawAccept',
                    challengerId: challengerId
                }));
            }
        };
        
        this.networkManager.sendQuickDrawDecline = (challengerId) => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawDecline',
                    challengerId: challengerId
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
        
        this.networkManager.sendQuickDrawPenalty = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'quickDrawPenalty'
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
                    case 'playerHealthUpdate':
                        if (this.inDuel) {
                            // Update own health if it's us
                            if (message.playerId === this.localPlayer.id) {
                                this.updateHealthBar(message.health);
                                
                                // Show hit feedback if damaged
                                if (message.damage > 0) {
                                    this.showHitFeedback(message.damage);
                                }
                            }
                            // Update opponent's health if needed (could be extended for UI)
                            else if (message.playerId === this.duelOpponentId) {
                                // Could update opponent health bar if we had one
                            }
                        }
                        break;
                    // Challenge system message handlers
                    case 'quickDrawChallengeReceived':
                        this.handleChallengeReceived(message);
                        break;
                    case 'quickDrawChallengeAccepted':
                        this.handleChallengeAccepted(message);
                        break;
                    case 'quickDrawChallengeDeclined':
                        this.handleChallengeDeclined(message);
                        break;
                }
            } catch (err) {
                console.error('Error parsing Quick Draw message:', err);
            }
        };
    }

    /**
     * Updates the list of nearby players for challenge feature
     */
    updateNearbyPlayers() {
        // Skip if in duel or lobby already
        if (this.inDuel || this.inLobby || this.pendingChallenge) return;
        
        const playerPos = this.localPlayer.group.position.clone();
        this.nearbyPlayers.clear();
        this.challengePromptActive = false;
        
        // Check if any other players are within the challenge radius
        if (this.networkManager && this.networkManager.otherPlayers) {
            for (const [playerId, playerData] of this.networkManager.otherPlayers) {
                // Skip players who are in a quick draw already or don't have position
                if (!playerData.position || playerData.quickDrawLobbyIndex >= 0 || 
                    playerData.inQuickDrawDuel) continue;
                
                // Calculate distance to player
                const otherPos = new THREE.Vector3(
                    playerData.position.x,
                    playerData.position.y,
                    playerData.position.z
                );
                
                const distance = playerPos.distanceTo(otherPos);
                
                // If within challenge radius, add to nearby players
                if (distance <= this.playerProximityRadius) {
                    this.nearbyPlayers.set(playerId, {
                        id: playerId,
                        distance: distance,
                        position: otherPos
                    });
                    
                    this.challengePromptActive = true;
                }
            }
        }
        
        // Update UI based on nearby players
        this.updateChallengeUI();
    }

    /**
     * Updates the challenge UI based on nearby players
     */
    updateChallengeUI() {
        if (!this.challengePrompt) return;
        
        // Show/hide challenge prompt based on whether there are nearby players
        if (this.challengePromptActive && !this.challengeUIVisible) {
            this.challengePrompt.style.display = 'block';
            this.challengeUIVisible = true;
        } else if (!this.challengePromptActive && this.challengeUIVisible) {
            this.challengePrompt.style.display = 'none';
            this.challengeUIVisible = false;
        }
    }

    /**
     * Send a challenge to the nearest player
     */
    sendChallenge() {
        if (this.nearbyPlayers.size === 0) return;
        
        // Find the nearest player
        let nearestPlayerId = null;
        let nearestDistance = Infinity;
        
        for (const [playerId, data] of this.nearbyPlayers) {
            if (data.distance < nearestDistance) {
                nearestDistance = data.distance;
                nearestPlayerId = playerId;
            }
        }
        
        if (nearestPlayerId) {
            // Hide the challenge prompt
            this.challengePrompt.style.display = 'none';
            this.challengeUIVisible = false;
            
            // Show "Challenge sent" message
            this.showMessage('Challenge sent!', 2000);
            
            // Send challenge to server
            this.networkManager.sendQuickDrawChallenge(nearestPlayerId);
            
            console.log(`Quick Draw challenge sent to player ${nearestPlayerId}`);
        }
    }

    /**
     * Handle receiving a challenge from another player
     * @param {Object} message - The challenge message
     */
    handleChallengeReceived(message) {
        if (this.inDuel || this.inLobby) {
            // Automatically decline if already in a duel or lobby
            this.networkManager.sendQuickDrawDecline(message.challengerId);
            return;
        }
        
        // Store the pending challenge
        this.pendingChallenge = {
            challengerId: message.challengerId,
            challengerPosition: message.challengerPosition
        };
        
        // Show the challenge invitation
        this.challengeInvitation.innerHTML = `
            <div style="margin-bottom: 15px">Player ${message.challengerId} challenges you to a Quick Draw duel!</div>
            <div style="display: flex; justify-content: space-around; margin-top: 10px;">
                <div style="background-color: #4CAF50; padding: 10px 20px; border-radius: 5px;">Press Enter to accept</div>
                <div style="background-color: #F44336; padding: 10px 20px; border-radius: 5px;">Press T to decline</div>
            </div>
        `;
        this.challengeInvitation.style.display = 'block';
        
        // Play notification sound
        if (this.soundManager) {
            this.soundManager.playSound("bellstart");
        }
        
        console.log(`Received Quick Draw challenge from player ${message.challengerId}`);
    }

    /**
     * Accept a pending challenge
     */
    acceptChallenge() {
        if (!this.pendingChallenge) return;
        
        // Hide the invitation
        this.challengeInvitation.style.display = 'none';
        
        // Send acceptance to server
        this.networkManager.sendQuickDrawAccept(this.pendingChallenge.challengerId);
        
        // Show message
        this.showMessage('Challenge accepted!', 1000);
        
        console.log(`Accepted Quick Draw challenge from player ${this.pendingChallenge.challengerId}`);
        
        // Wait for server to respond with match details
        // Challenge will be cleared when match is found
    }

    /**
     * Decline a pending challenge
     */
    declineChallenge() {
        if (!this.pendingChallenge) return;
        
        // Hide the invitation
        this.challengeInvitation.style.display = 'none';
        
        // Send decline to server
        this.networkManager.sendQuickDrawDecline(this.pendingChallenge.challengerId);
        
        // Clear the pending challenge
        this.pendingChallenge = null;
        
        console.log('Declined Quick Draw challenge');
    }

    /**
     * Handle challenge accepted by other player
     * @param {Object} message - The acceptance message
     */
    handleChallengeAccepted(message) {
        // Show message
        this.showMessage('Challenge accepted!', 1000);
        
        console.log(`Player ${message.targetId} accepted your Quick Draw challenge`);
        
        // Wait for server to respond with match details
    }

    /**
     * Handle challenge declined by other player
     * @param {Object} message - The decline message
     */
    handleChallengeDeclined(message) {
        // Show message
        this.showMessage('Challenge declined', 2000);
        
        console.log(`Player ${message.targetId} declined your Quick Draw challenge`);
    }

    /**
     * Show the "READY?" message with enhanced typography.
     */
    showReadyMessage() {
        this.duelState = 'ready';
        this.updateStatusIndicator();
        
        // For iOS/Safari and mobile devices - create a fixed fullscreen message
        if (window.isMobileDevice || /iPad|iPhone|iPod/.test(navigator.userAgent)) {
            // Create iOS-friendly fullscreen overlay for READY message
            const readyOverlay = document.createElement('div');
            readyOverlay.style.position = 'fixed';
            readyOverlay.style.top = '0';
            readyOverlay.style.left = '0';
            readyOverlay.style.width = '100%';
            readyOverlay.style.height = '100%';
            readyOverlay.style.display = 'flex';
            readyOverlay.style.alignItems = 'center';
            readyOverlay.style.justifyContent = 'center';
            readyOverlay.style.backgroundColor = 'rgba(255, 193, 7, 0.3)';
            readyOverlay.style.zIndex = '9999';
            
            // Create text element inside the overlay
            const readyText = document.createElement('div');
            readyText.textContent = 'READY?';
            readyText.style.fontSize = '120px';
            readyText.style.fontWeight = 'bold';
            readyText.style.fontFamily = 'Arial, sans-serif';
            readyText.style.color = 'white';
            readyText.style.textShadow = '0 0 20px #FFC107, 0 0 40px #FFC107';
            
            readyOverlay.appendChild(readyText);
            document.body.appendChild(readyOverlay);
            
            // Use a simple animation for better visibility
            setTimeout(() => {
                readyText.style.transition = 'transform 0.2s ease-in-out';
                readyText.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    readyText.style.transform = 'scale(1)';
                }, 200);
            }, 100);
            
            // Remove overlay after 1 second
            setTimeout(() => {
                if (readyOverlay.parentNode) {
                    readyOverlay.parentNode.removeChild(readyOverlay);
                }
            }, 1000);
        }
        
        // Also show in standard message overlay as backup
        this.messageOverlay.textContent = 'READY?';
        this.messageOverlay.style.display = 'block';
        
        // Enhanced styling for desktop
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
        
        // Enable aiming if not penalized
        if (this.penaltyEndTime <= Date.now()) {
            this.localPlayer.canAim = true;
        }
        
        // Play gun draw sound
        if (this.soundManager) {
            this.soundManager.playSound("draw", 1.0);
        }
        
        // Show the DRAW! message
        if (window.isMobileDevice || /iPad|iPhone|iPod/.test(navigator.userAgent)) {
            // Create iOS-friendly fullscreen overlay for DRAW message
            const drawOverlay = document.createElement('div');
            drawOverlay.style.position = 'fixed';
            drawOverlay.style.top = '0';
            drawOverlay.style.left = '0';
            drawOverlay.style.width = '100%';
            drawOverlay.style.height = '100%';
            drawOverlay.style.display = 'flex';
            drawOverlay.style.alignItems = 'center';
            drawOverlay.style.justifyContent = 'center';
            drawOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
            drawOverlay.style.zIndex = '9999';
            
            // Create text element inside the overlay
            const drawText = document.createElement('div');
            drawText.textContent = 'DRAW!';
            drawText.style.fontSize = '150px';
            drawText.style.fontWeight = 'bold';
            drawText.style.fontFamily = 'Western, Arial, sans-serif';
            drawText.style.color = 'white';
            drawText.style.textShadow = '0 0 30px #FF0000, 0 0 60px #FF0000';
            
            drawOverlay.appendChild(drawText);
            document.body.appendChild(drawOverlay);
            
            // Use a simple animation for better visibility
            setTimeout(() => {
                drawText.style.transition = 'transform 0.1s ease-in-out';
                drawText.style.transform = 'scale(1.3)';
                setTimeout(() => {
                    drawText.style.transform = 'scale(1)';
                }, 100);
            }, 50);
            
            // Remove overlay after 1 second
            setTimeout(() => {
                if (drawOverlay.parentNode) {
                    drawOverlay.parentNode.removeChild(drawOverlay);
                }
            }, 1000);
        }
        
        // Show in standard message overlay as backup
        this.messageOverlay.textContent = 'DRAW!';
        this.messageOverlay.style.display = 'block';
        this.messageOverlay.style.fontSize = '72px';
        this.messageOverlay.style.color = '#FF0000';
        this.messageOverlay.style.textShadow = '0 0 20px #FF0000';
        
        // Animate message
        this.messageOverlay.style.transition = 'transform 0.1s ease-in-out';
        this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
        
        setTimeout(() => {
            this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1.2)';
            setTimeout(() => {
                this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 100);
        }, 10);
        
        // Hide message after 1 second
        setTimeout(() => {
            this.hideMessage();
        }, 1000);
        
        // Animate the draw circle
        this.drawCircle.style.display = 'block';
        this.drawCircle.style.opacity = '0';
        this.drawCircle.style.transform = 'translate(-50%, -50%) scale(0)';
        
        // Start animation after a short delay
        setTimeout(() => {
            this.drawCircle.style.opacity = '1';
            this.drawCircle.style.transform = 'translate(-50%, -50%) scale(1)';
            
            // Fade out and hide after animation
            setTimeout(() => {
                this.drawCircle.style.opacity = '0';
                
                // Hide after fade out
                setTimeout(() => {
                    this.drawCircle.style.display = 'none';
                }, 300);
            }, 800);
        }, 10);
    }

    /**
     * Checks the Quick Draw state and updates game elements accordingly
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
        // Skip if player not initialized
        if (!this.localPlayer || !this.localPlayer.group) return;
        
        // Update nearby players for challenges
        this.updateNearbyPlayers();
        
        // Update status indicator
        this.updateStatusIndicator();
        
        // If penalized, keep gun locked until penalty expires
        if (this.penaltyEndTime > 0) {
            if (Date.now() < this.penaltyEndTime) {
                // Keep gun locked
                this.localPlayer.canAim = false;
            } else {
                // Penalty expired, unlock gun if in draw phase
                if (this.duelState === 'draw') {
                    this.localPlayer.canAim = true;
                }
                
                // Clear penalty
                this.penaltyEndTime = 0;
            }
        }
        
        // Check for early draw (using mouse down) during countdown
        if (this.duelState === 'countdown' && !this.penaltyEndTime) {
            if ((window.mouseDown && (window.mouseDown.left || window.mouseDown.right)) || this.localPlayer.isAiming) {
                this.penalizeEarlyDraw();
            }
        }
    }

    /**
     * Updates the Quick Draw status indicator.
     */
    updateStatusIndicator() {
        if (!this.statusIndicator) return;
        
        // Show/hide based on duel state
        if (this.inDuel || this.inLobby) {
            this.statusIndicator.style.display = 'block';
            let statusText = '';
            
            if (this.inLobby) {
                statusText = 'Quick Draw: Waiting for players...';
            } else if (this.inDuel) {
                switch (this.duelState) {
                    case 'ready':
                        statusText = 'Quick Draw: Get ready!';
                        break;
                    case 'countdown':
                        statusText = 'Quick Draw: Wait for the signal!';
                        break;
                    case 'draw':
                        statusText = 'Quick Draw: DRAW!';
                        break;
                    default:
                        statusText = 'Quick Draw: Duel in progress';
                }
            }
            
            this.statusIndicator.textContent = statusText;
        } else {
            this.statusIndicator.style.display = 'none';
        }
    }

    /**
     * Handle match found notification from server.
     */
    handleMatchFound(message) {
        this.inDuel = true;
        this.inLobby = false;
        this.duelOpponentId = message.opponentId;
        this.duelState = 'none';
        this.pendingChallenge = null;
        
        // Store original player movement and aiming states
        this.originalCanAim = this.localPlayer.canAim;
        this.originalCanMove = this.localPlayer.canMove;
        
        // Store original position to return after the duel
        this.originalPosition = {
            x: this.localPlayer.group.position.x,
            y: this.localPlayer.group.position.y,
            z: this.localPlayer.group.position.z
        };
        this.originalRotation = this.localPlayer.group.rotation.y;
        
        // Disable player movement and aiming during the duel
        this.localPlayer.canAim = false;
        this.localPlayer.canMove = false;
        
        // Force-lock player movement to prevent any accidental movement
        if (message.movementLocked === true) {
            // Completely block any movement input
            this.localPlayer.forceLockMovement = true;
            
            // Backup original move method and replace with empty function
            if (!this.localPlayer._origMove) {
                this.localPlayer._origMove = this.localPlayer.move;
                this.localPlayer.move = () => {}; // No-op function
            }
        }
        
        console.log(`Quick Draw match found! Your opponent is player ${message.opponentId}`);
        
        // Teleport player to the start position
        if (message.startPosition) {
            // First move to new position, ensuring player feet are on ground
            // The player's eye level is at group.position, and feet are 2.72 units below
            const eyeLevel = message.startPosition.y;
            
            this.localPlayer.group.position.set(
                message.startPosition.x,
                eyeLevel, // Use server-provided eye level directly
                message.startPosition.z
            );
            
            // Debug log the player height
            console.log(`Player position set to: (${message.startPosition.x.toFixed(2)}, ${eyeLevel.toFixed(2)}, ${message.startPosition.z.toFixed(2)})`);
            console.log(`Feet should be at y=${(eyeLevel-2.72).toFixed(2)}`);
            
            // Set rotation to face the opponent
            if (message.startRotation !== undefined) {
                // Apply the exact rotation from the server
                console.log(`Setting player rotation to: ${message.startRotation.toFixed(4)} radians (${(message.startRotation * 180 / Math.PI).toFixed(1)}°)`);
                
                // In THREE.js, rotation.y represents rotation around the Y-axis (in radians)
                // The server calculates this angle to make players face each other
                this.localPlayer.group.rotation.y = message.startRotation;
                
                // Debug visualization - draw a direction arrow for 5 seconds
                this.showFacingDirection(message.startPosition, message.startRotation);
            }
        }
        
        // Show health bar with full health
        this.updateHealthBar(100);
        this.healthBarContainer.style.display = 'block';
        
        // Update status indicator and show match found message
        this.updateStatusIndicator();
        this.showMessage(`Duel vs. Player ${message.opponentId}`, 2000);
        
        // Mark as ready after showing message
        setTimeout(() => {
            this.networkManager.sendQuickDrawReady();
        }, 2000);
    }
    
    /**
     * Show a temporary arrow indicating which way the player is facing
     * @param {Object} position - The player position
     * @param {number} rotation - The player rotation in radians
     */
    showFacingDirection(position, rotation) {
        // Create a group to hold all debug objects
        const debugGroup = new THREE.Group();
        
        // Create direction arrow with more visibility
        const arrowLength = 8; // Longer arrow
        const arrowGeometry = new THREE.ConeGeometry(0.5, arrowLength, 8);
        const arrowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00FF00,
            transparent: true,
            opacity: 0.8
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        
        // Position the arrow at player position, slightly above ground
        arrow.position.set(0, 2, 0); // Local position within group
        
        // Rotate arrow to match player rotation
        // By default, the cone points up along Y axis, so we need to rotate it to point along Z axis first
        arrow.rotation.x = Math.PI / 2;
        
        // Add line showing forward direction
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xFFFF00,
            linewidth: 3
        });
        const linePoints = [];
        linePoints.push(new THREE.Vector3(0, 0.5, 0));
        linePoints.push(new THREE.Vector3(0, 0.5, arrowLength * 1.2)); // Slightly longer than arrow
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        
        // Create text label showing rotation angle
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 256;
        textCanvas.height = 128;
        const context = textCanvas.getContext('2d');
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, textCanvas.width, textCanvas.height);
        context.font = 'bold 24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Calculate angle in degrees for display
        const angleDegrees = (rotation * 180 / Math.PI).toFixed(1);
        context.fillText(`Rotation: ${angleDegrees}°`, textCanvas.width / 2, textCanvas.height / 2);
        
        const texture = new THREE.CanvasTexture(textCanvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(5, 2.5, 1);
        sprite.position.set(0, 4, 0); // Position above arrow
        
        // Add all elements to the debug group
        debugGroup.add(arrow);
        debugGroup.add(line);
        debugGroup.add(sprite);
        
        // Position and rotate the entire group
        debugGroup.position.copy(position);
        debugGroup.rotation.y = rotation;
        
        // Add to scene
        this.scene.add(debugGroup);
        
        // Add temporary sphere at player position as reference
        const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFF0000,
            transparent: true,
            opacity: 0.6
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(position.x, position.y + 0.5, position.z);
        this.scene.add(sphere);
        
        // Create a label for "Player Position"
        const posCanvas = document.createElement('canvas');
        posCanvas.width = 256;
        posCanvas.height = 64;
        const posContext = posCanvas.getContext('2d');
        posContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
        posContext.fillRect(0, 0, posCanvas.width, posCanvas.height);
        posContext.font = 'bold 20px Arial';
        posContext.fillStyle = 'white';
        posContext.textAlign = 'center';
        posContext.textBaseline = 'middle';
        posContext.fillText('Player Position', posCanvas.width / 2, posCanvas.height / 2);
        
        const posTexture = new THREE.CanvasTexture(posCanvas);
        const posMaterial = new THREE.SpriteMaterial({
            map: posTexture,
            transparent: true
        });
        const posSprite = new THREE.Sprite(posMaterial);
        posSprite.scale.set(4, 1, 1);
        posSprite.position.set(position.x, position.y + 1.5, position.z);
        this.scene.add(posSprite);
        
        console.log(`Debug direction arrow created at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) with rotation ${rotation.toFixed(4)} rad (${angleDegrees}°)`);
        
        // Remove after 5 seconds
        setTimeout(() => {
            this.scene.remove(debugGroup);
            this.scene.remove(sphere);
            this.scene.remove(posSprite);
        }, 5000);
    }
    
    /**
     * Updates the health bar with the current health value
     * @param {number} health - Health value (0-100)
     */
    updateHealthBar(health) {
        // Ensure health is within valid range
        health = Math.max(0, Math.min(100, health));
        
        // Update health bar width
        this.healthBar.style.width = `${health}%`;
        
        // Update color based on health amount
        if (health > 60) {
            this.healthBar.style.backgroundColor = '#00FF00'; // Green
        } else if (health > 30) {
            this.healthBar.style.backgroundColor = '#FFA500'; // Orange
        } else {
            this.healthBar.style.backgroundColor = '#FF0000'; // Red
        }
        
        // Update text
        this.healthText.textContent = `${health} HP`;
    }

    /**
     * Apply a penalty with dramatic red flashing warning.
     * Once triggered, records a penalty end time so that gun drawing remains locked
     * for a full 3 seconds even if the "DRAW!" signal comes.
     */
    penalizeEarlyDraw() {
        // Lock gun for 3 seconds
        this.penaltyEndTime = Date.now() + 3000;
        this.localPlayer.canAim = false;
        
        // Force holster any weapon that might be drawn
        if (this.localPlayer.isAiming) {
            this.localPlayer.isAiming = false;
            
            // Play the holstering animation
            if (this.localPlayer.viewmodel) {
                this.localPlayer.viewmodel.playHolsterAnim();
                
                // Hide viewmodel after holster animation completes
                setTimeout(() => {
                    if (this.localPlayer.viewmodel) {
                        this.localPlayer.viewmodel.group.visible = false;
                    }
                }, 500);
            }
        }
        
        // Show the penalty message
        this.showMessage('TOO EARLY! Penalty!', 2000);
        
        // Create a flashing red overlay for penalty
        const penaltyOverlay = document.createElement('div');
        penaltyOverlay.style.position = 'absolute';
        penaltyOverlay.style.top = '0';
        penaltyOverlay.style.left = '0';
        penaltyOverlay.style.width = '100%';
        penaltyOverlay.style.height = '100%';
        penaltyOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        penaltyOverlay.style.zIndex = '999';
        penaltyOverlay.style.animation = 'penalty-flash 0.5s 3';
        
        // Add animation style
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes penalty-flash {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        // Add to game container and remove after penalty
        document.getElementById('game-container').appendChild(penaltyOverlay);
        
        // Play penalty sound
        if (this.soundManager) {
            this.soundManager.playSound("wrong", 0.7);
        }
        
        // Remove overlay after penalty animation
        setTimeout(() => {
            if (penaltyOverlay.parentNode) {
                penaltyOverlay.parentNode.removeChild(penaltyOverlay);
            }
        }, 1500);
        
        // Send penalty to server for validation
        if (this.networkManager && typeof this.networkManager.sendQuickDrawPenalty === 'function') {
            this.networkManager.sendQuickDrawPenalty();
        }
    }

    /**
     * End the duel with enhanced win/lose UI effects.
     */
    endDuel(winnerId) {
        // Update state
        this.duelState = 'none';
        
        // Determine if player won or lost
        const playerWon = winnerId === this.localPlayer.id;
        
        // For iOS/Safari and mobile devices - create a fixed fullscreen overlay
        if (window.isMobileDevice || /iPad|iPhone|iPod/.test(navigator.userAgent)) {
            // Create iOS-friendly fullscreen overlay
            const resultOverlay = document.createElement('div');
            resultOverlay.style.position = 'fixed';
            resultOverlay.style.top = '0';
            resultOverlay.style.left = '0';
            resultOverlay.style.width = '100%';
            resultOverlay.style.height = '100%';
            resultOverlay.style.display = 'flex';
            resultOverlay.style.alignItems = 'center';
            resultOverlay.style.justifyContent = 'center';
            resultOverlay.style.backgroundColor = playerWon ? 'rgba(0, 128, 0, 0.4)' : 'rgba(128, 0, 0, 0.4)';
            resultOverlay.style.zIndex = '9999';
            
            // Create text element inside the overlay
            const resultText = document.createElement('div');
            resultText.textContent = playerWon ? 'VICTORY!' : 'DEFEAT';
            resultText.style.fontSize = '130px';
            resultText.style.fontWeight = 'bold';
            resultText.style.fontFamily = 'Western, Arial, sans-serif';
            resultText.style.color = 'white';
            resultText.style.textShadow = playerWon 
                ? '0 0 30px #00FF00, 0 0 60px #00FF00' 
                : '0 0 30px #FF0000, 0 0 60px #FF0000';
            
            resultOverlay.appendChild(resultText);
            document.body.appendChild(resultOverlay);
            
            // Use a simple animation for better visibility
            setTimeout(() => {
                resultText.style.transition = 'transform 0.3s ease-in-out';
                resultText.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    resultText.style.transform = 'scale(1)';
                }, 300);
            }, 100);
            
            // Remove overlay after 3 seconds
            setTimeout(() => {
                if (resultOverlay.parentNode) {
                    resultOverlay.parentNode.removeChild(resultOverlay);
                }
            }, 3000);
        }
        
        // Show in standard message overlay as backup
        this.messageOverlay.textContent = playerWon ? 'VICTORY!' : 'DEFEAT';
        this.messageOverlay.style.display = 'block';
        this.messageOverlay.style.fontSize = '72px';
        this.messageOverlay.style.color = playerWon ? '#00FF00' : '#FF0000';
        this.messageOverlay.style.textShadow = playerWon 
            ? '0 0 20px #00FF00' 
            : '0 0 20px #FF0000';
        
        // Animate message
        this.messageOverlay.style.transition = 'transform 0.2s ease-in-out';
        this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
        
        setTimeout(() => {
            this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1.3)';
            setTimeout(() => {
                this.messageOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 200);
        }, 10);
        
        // Play victory/defeat sound
        if (this.soundManager) {
            if (playerWon) {
                this.soundManager.playSound("victory", 0.7);
            } else {
                this.soundManager.playSound("defeat", 0.7);
            }
        }
        
        // Hide message after 3 seconds
        setTimeout(() => {
            this.hideMessage();
            
            // Reset player state
            this.inDuel = false;
            this.duelOpponentId = null;
            
            // Hide health bar
            this.healthBarContainer.style.display = 'none';
            
            // Restore original movement methods if they were force-locked
            if (this.localPlayer._origMove) {
                this.localPlayer.move = this.localPlayer._origMove;
                this.localPlayer._origMove = null;
                this.localPlayer.forceLockMovement = false;
            }
            
            // Restore original movement and aiming states
            this.localPlayer.canAim = this.originalCanAim;
            this.localPlayer.canMove = this.originalCanMove;
            
            // Return to original position
            if (this.originalPosition) {
                this.localPlayer.group.position.set(
                    this.originalPosition.x,
                    this.originalPosition.y,
                    this.originalPosition.z
                );
                this.localPlayer.group.rotation.y = this.originalRotation;
            }
            
            // Update UI
            this.updateStatusIndicator();
            
        }, 3000);
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
        
        if (this.healthBarContainer && this.healthBarContainer.parentNode) {
            this.healthBarContainer.parentNode.removeChild(this.healthBarContainer);
        }
        
        // Clear timers
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.drawTimer) clearTimeout(this.drawTimer);
        if (this.penaltyTimer) clearTimeout(this.penaltyTimer);
        
        // Remove challenge UI elements
        if (this.challengePrompt && this.challengePrompt.parentNode) {
            this.challengePrompt.parentNode.removeChild(this.challengePrompt);
        }
        
        if (this.challengeInvitation && this.challengeInvitation.parentNode) {
            this.challengeInvitation.parentNode.removeChild(this.challengeInvitation);
        }
    }
    
    /**
     * Checks if a point is within the active arena.
     * This is a compatibility method for player.js boundary checks.
     * Now that we're using direct challenges on the map, this always returns true.
     * @param {THREE.Vector3} position - The position to check
     * @param {number} arenaIndex - The arena index
     * @returns {boolean} - True, since there are no arena boundaries to enforce
     */
    isPointInArena(position, arenaIndex) {
        // Since we're not using arenas anymore, always return true
        // to prevent boundary collision detection from restricting movement
        return true;
    }

    /**
     * Show feedback when player is hit during a duel
     * @param {number} damage - The amount of damage taken
     */
    showHitFeedback(damage) {
        // Create flash effect for hit feedback
        const hitOverlay = document.createElement('div');
        hitOverlay.style.position = 'absolute';
        hitOverlay.style.top = '0';
        hitOverlay.style.left = '0';
        hitOverlay.style.width = '100%';
        hitOverlay.style.height = '100%';
        hitOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        hitOverlay.style.pointerEvents = 'none';
        hitOverlay.style.zIndex = '999';
        hitOverlay.style.animation = 'hit-flash 0.2s ease-out';
        
        // Add animation style
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes hit-flash {
                0% { opacity: 0.7; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        // Add to game container
        document.getElementById('game-container').appendChild(hitOverlay);
        
        // Remove overlay after animation
        setTimeout(() => {
            if (hitOverlay.parentNode) {
                hitOverlay.parentNode.removeChild(hitOverlay);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 200);
        
        // Show damage number
        if (damage > 0) {
            const damageText = document.createElement('div');
            damageText.textContent = `-${damage}`;
            damageText.style.position = 'absolute';
            damageText.style.top = '30%';
            damageText.style.left = '50%';
            damageText.style.transform = 'translate(-50%, -50%)';
            damageText.style.color = '#FF4444';
            damageText.style.fontSize = '32px';
            damageText.style.fontWeight = 'bold';
            damageText.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.7)';
            damageText.style.pointerEvents = 'none';
            damageText.style.zIndex = '1100';
            damageText.style.opacity = '1';
            damageText.style.transition = 'opacity 1s, transform 1s';
            
            document.getElementById('game-container').appendChild(damageText);
            
            // Animate and remove after animation
            setTimeout(() => {
                damageText.style.opacity = '0';
                damageText.style.transform = 'translate(-50%, -100%)';
                
                setTimeout(() => {
                    if (damageText.parentNode) {
                        damageText.parentNode.removeChild(damageText);
                    }
                }, 1000);
            }, 50);
        }
        
        // Play hit sound
        if (this.soundManager) {
            this.soundManager.playSound("hurt", 0.7);
        }
    }
}