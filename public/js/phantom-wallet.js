// Phantom Wallet Adapter for Solana
const phantomWalletAdapter = {
    // Keep track of connected wallet and public key
    wallet: null,
    publicKey: null,
    isConnected: false,
    
    // Event callback handlers
    onConnect: null,
    onDisconnect: null,
    onError: null,
    
    // Network manager reference for sending wallet data to server
    networkManager: null,
    
    // Initialize the adapter
    init(networkManager) {
        // Store network manager reference if provided
        if (networkManager) {
            this.networkManager = networkManager;
        }
        
        // Create the UI components
        this.createConnectButton();
        
        // Check if Phantom is installed
        if (!this.isPhantomInstalled()) {
            console.warn("Phantom wallet is not installed");
            this.updateConnectButtonStatus(false, "Install Phantom");
            return false;
        }
        
        // Setup event listeners for Phantom provider
        const provider = window.phantom?.solana;
        if (provider) {
            provider.on('connect', (publicKey) => {
                this.handleConnect(publicKey);
            });
            
            provider.on('disconnect', () => {
                this.handleDisconnect();
            });
            
            provider.on('accountChanged', (publicKey) => {
                if (publicKey) {
                    this.handleConnect(publicKey);
                } else {
                    this.handleDisconnect();
                }
            });
        }
        
        return true;
    },
    
    // Set the network manager after initialization (if needed)
    setNetworkManager(networkManager) {
        this.networkManager = networkManager;
        
        // If we're already connected, send the wallet address to the server
        if (this.isConnected && this.publicKey && this.networkManager) {
            this.sendWalletAddressToServer();
        }
    },
    
    // Send the wallet address to the server for NFT verification
    sendWalletAddressToServer() {
        if (!this.networkManager || !this.publicKey) return;
        
        console.log(`Sending wallet address to server: ${this.publicKey}`);
        
        // Use the network manager to send the wallet address
        if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
            this.networkManager.socket.send(JSON.stringify({
                type: 'walletConnect',
                walletAddress: this.publicKey
            }));
        } else {
            console.warn('Unable to send wallet address: WebSocket not connected');
        }
    },
    
    // Check if Phantom wallet is installed
    isPhantomInstalled() {
        const provider = window.phantom?.solana;
        return provider && provider.isPhantom;
    },
    
    // Connect to the wallet
    async connect() {
        try {
            if (!this.isPhantomInstalled()) {
                window.open('https://phantom.app/', '_blank');
                return;
            }
            
            // Connect to the wallet
            const provider = window.phantom?.solana;
            const response = await provider.connect();
            
            // Handle connection
            this.handleConnect(response.publicKey);
            
            return this.publicKey;
        } catch (error) {
            console.error("Error connecting to Phantom wallet:", error);
            this.updateConnectButtonStatus(false);
            
            // Fire error event
            if (typeof this.onError === 'function') {
                this.onError(error);
            }
            
            // Dispatch custom error event
            document.dispatchEvent(new CustomEvent('walletError', {
                detail: { error }
            }));
            
            return null;
        }
    },
    
    // Handle successful wallet connection
    handleConnect(publicKey) {
        const provider = window.phantom?.solana;
        this.wallet = provider;
        this.publicKey = publicKey.toString();
        this.isConnected = true;
        
        // Update button status
        this.updateConnectButtonStatus(true);
        
        console.log("Connected to wallet:", this.publicKey);
        
        // Send the wallet address to the server
        this.sendWalletAddressToServer();
        
        // Fire connect callback
        if (typeof this.onConnect === 'function') {
            this.onConnect(this.publicKey);
        }
        
        // Dispatch custom connect event
        document.dispatchEvent(new CustomEvent('walletConnected', {
            detail: { publicKey: this.publicKey }
        }));
    },
    
    // Disconnect from the wallet
    async disconnect() {
        if (this.wallet) {
            await this.wallet.disconnect();
            this.handleDisconnect();
        }
    },
    
    // Handle wallet disconnection
    handleDisconnect() {
        this.wallet = null;
        this.publicKey = null;
        this.isConnected = false;
        
        // Update button status
        this.updateConnectButtonStatus(false);
        console.log("Disconnected from wallet");
        
        // Fire disconnect callback
        if (typeof this.onDisconnect === 'function') {
            this.onDisconnect();
        }
        
        // Dispatch custom disconnect event
        document.dispatchEvent(new CustomEvent('walletDisconnected'));
    },
    
    // Create the connect button UI
    createConnectButton() {
        // Create the button container
        const container = document.createElement('div');
        container.id = 'phantom-connect-container';
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.zIndex = '999999'; // Much higher z-index
        
        // Create the button
        const button = document.createElement('button');
        button.id = 'phantom-connect-button';
        button.textContent = 'Connect';
        button.style.backgroundColor = '#8c5cf5'; // Purple color
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '20px';
        button.style.padding = '8px 16px';
        button.style.cursor = 'pointer';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.fontWeight = 'bold';
        button.style.fontSize = '14px';
        button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
        button.style.transition = 'background-color 0.2s ease';
        button.style.pointerEvents = 'auto'; // Ensure clicks are registered
        
        // Add hover effect
        button.onmouseover = () => {
            button.style.backgroundColor = '#7a4fe0';
        };
        button.onmouseout = () => {
            button.style.backgroundColor = this.isConnected ? '#4caf50' : '#8c5cf5';
        };
        
        // Add click event
        button.onclick = async () => {
            if (this.isConnected) {
                await this.disconnect();
            } else {
                await this.connect();
            }
        };
        
        // Add button to container
        container.appendChild(button);
        
        // Add container to document
        document.body.appendChild(container);
    },
    
    // Update the connect button status
    updateConnectButtonStatus(connected, text) {
        const button = document.getElementById('phantom-connect-button');
        if (!button) return;
        
        if (connected) {
            button.textContent = this.publicKey 
                ? `${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`
                : 'Connected';
            button.style.backgroundColor = '#4caf50'; // Green color
        } else {
            button.textContent = text || 'Connect';
            button.style.backgroundColor = '#8c5cf5'; // Purple color
        }
    },
    
    // Sign and send transaction
    async signAndSendTransaction(transaction) {
        if (!this.isConnected || !this.wallet) {
            console.error("Wallet not connected");
            return null;
        }
        
        try {
            // Sign the transaction
            const signedTransaction = await this.wallet.signTransaction(transaction);
            
            // Send the transaction
            const signature = await window.solana.request({
                method: "sendTransaction",
                params: {
                    transaction: signedTransaction.serialize(),
                },
            });
            
            return signature;
        } catch (error) {
            console.error("Error signing transaction:", error);
            
            // Fire error event
            if (typeof this.onError === 'function') {
                this.onError(error);
            }
            
            // Dispatch custom error event
            document.dispatchEvent(new CustomEvent('walletError', {
                detail: { error }
            }));
            
            return null;
        }
    },
    
    // Get the connected wallet balance
    async getBalance() {
        if (!this.isConnected || !this.publicKey) {
            console.error("Wallet not connected");
            return null;
        }
        
        try {
            // Create a connection to the Solana network
            const connection = new solanaWeb3.Connection(
                solanaWeb3.clusterApiUrl('mainnet-beta'),
                'confirmed'
            );
            
            // Get the wallet balance
            const balance = await connection.getBalance(
                new solanaWeb3.PublicKey(this.publicKey)
            );
            
            // Convert lamports to SOL
            return balance / 1000000000; // 1 SOL = 1,000,000,000 lamports
        } catch (error) {
            console.error("Error getting balance:", error);
            return null;
        }
    }
};

// Export the adapter
export default phantomWalletAdapter; 