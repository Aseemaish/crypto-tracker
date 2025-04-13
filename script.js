document.addEventListener('DOMContentLoaded', () => {
    const cryptoContainer = document.getElementById('crypto-container');
    const searchBox = document.getElementById('search-box');
    const statusDiv = document.getElementById('status');

    // --- Configuration ---
    // Symbols to display initially (Binance pairs, e.g., BTCUSDT)
    const initialSymbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBBUSD', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT',
        'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'SHIBUSDT', 'AVAXUSDT', 'TRXUSDT'
    ];
    // Mapping for display names (optional, but nicer)
    const cryptoNames = {
        'BTCUSDT': 'Bitcoin', 'ETHUSDT': 'Ethereum', 'BNBBUSD': 'BNB',
        'SOLUSDT': 'Solana', 'ADAUSDT': 'Cardano', 'XRPUSDT': 'XRP',
        'DOGEUSDT': 'Dogecoin', 'DOTUSDT': 'Polkadot', 'MATICUSDT': 'Polygon',
        'SHIBUSDT': 'Shiba Inu', 'AVAXUSDT': 'Avalanche', 'TRXUSDT': 'TRON'
        // Add more mappings if you add symbols
    };
    // --------------------

    let allCryptoData = []; // Holds data for all initially fetched cryptos
    let webSocket = null;
    const previousPrices = {}; // Store previous prices for flash effect

    // --- 1. Fetch Initial Data via REST API ---
    async function fetchInitialData() {
        statusDiv.textContent = 'Fetching initial prices...';
        cryptoContainer.innerHTML = '<div class="loading-placeholder">Loading initial prices...</div>'; // Show placeholder

        try {
            // Use 24hr ticker endpoint to get initial prices and symbols
            const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            allCryptoData = data
                .filter(ticker => initialSymbols.includes(ticker.symbol)) // Keep only the ones we want initially
                .map(ticker => ({
                    symbol: ticker.symbol,
                    name: cryptoNames[ticker.symbol] || ticker.symbol.replace('USDT', '').replace('BUSD',''), // Use mapped name or derive
                    price: parseFloat(ticker.lastPrice), // Use lastPrice for initial display
                    element: null // Will hold reference to the DOM element
                }))
                .sort((a, b) => initialSymbols.indexOf(a.symbol) - initialSymbols.indexOf(b.symbol)); // Keep original order

            renderCards(allCryptoData); // Display the initial cards
            statusDiv.textContent = 'Connecting to real-time feed...';
            connectWebSocket(); // Connect to WebSocket after initial render

        } catch (error) {
            console.error("Error fetching initial data:", error);
            statusDiv.textContent = 'Error fetching initial data.';
            statusDiv.style.color = 'red';
            cryptoContainer.innerHTML = '<div class="loading-placeholder error-message">Could not load initial prices. Please check connection or try again later.</div>';
        }
    }

    // --- 2. Render Crypto Cards ---
    function renderCards(cryptoArray) {
        cryptoContainer.innerHTML = ''; // Clear previous content or placeholder
        if (cryptoArray.length === 0) {
             cryptoContainer.innerHTML = '<div class="loading-placeholder">No matching cryptocurrencies found.</div>';
             return;
        }

        cryptoArray.forEach(crypto => {
            const card = document.createElement('div');
            card.classList.add('crypto-card');
            card.id = `card-${crypto.symbol.toLowerCase()}`; // Unique ID for the card

            const formattedPrice = crypto.price.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD', // Display as USD
                minimumFractionDigits: 2,
                maximumFractionDigits: crypto.price < 1 ? 6 : 2
            });

            card.innerHTML = `
                <h2>${crypto.name}</h2>
                <p class="crypto-symbol">${crypto.symbol}</p>
                <p class="price" id="price-${crypto.symbol.toLowerCase()}">${formattedPrice}</p>
                <p class="last-updated" id="updated-${crypto.symbol.toLowerCase()}">Waiting for updates...</p>
            `;
            cryptoContainer.appendChild(card);
            crypto.element = card; // Store reference to the element
        });
    }

    // --- 3. Connect to WebSocket ---
    function connectWebSocket() {
        // Close existing connection if any
        if (webSocket && webSocket.readyState !== WebSocket.CLOSED) {
            webSocket.close();
        }

        const symbolsForStream = allCryptoData.map(c => c.symbol.toLowerCase() + '@miniTicker').join('/');
        if (!symbolsForStream) {
             statusDiv.textContent = 'No symbols to track.';
             return; // Don't connect if no symbols loaded
        }

        // Use individual miniTicker streams for only the displayed symbols
        // This is more efficient than '!miniTicker@arr' if the list is small/filtered
        const websocketUrl = `wss://stream.binance.com:9443/ws/${symbolsForStream}`;
        // const websocketUrl = 'wss://stream.binance.com:9443/ws/!miniTicker@arr'; // Alternative: Use all tickers stream

        console.log(`Connecting to Binance WebSocket: ${websocketUrl}`);
        webSocket = new WebSocket(websocketUrl);

        webSocket.onopen = function() {
            console.log("Binance WebSocket connection opened.");
            statusDiv.textContent = 'Live Feed Connected';
            statusDiv.style.color = '#a8dadc'; // Reset color
        };

        webSocket.onmessage = function(event) {
            try {
                const tickerData = JSON.parse(event.data);

                // If using individual streams, data is an object, not array
                // If using !miniTicker@arr, data is an array - uncomment loop below
                /*
                // --- Handling for '!miniTicker@arr' stream ---
                const tickerDataArray = JSON.parse(event.data);
                tickerDataArray.forEach(ticker => {
                    updateCryptoCard(ticker);
                });
                */

                // --- Handling for individual 'symbol@miniTicker' streams ---
                 updateCryptoCard(tickerData);


            } catch (error) {
                console.error("Error processing WebSocket message:", error);
            }
        };

        webSocket.onerror = function(error) {
            console.error("Binance WebSocket Error:", error);
            statusDiv.textContent = 'WebSocket connection error.';
            statusDiv.style.color = 'red';
        };

        webSocket.onclose = function() {
            console.log("Binance WebSocket connection closed.");
            statusDiv.textContent = 'WebSocket disconnected.';
            statusDiv.style.color = 'orange';
            // Optionally try to reconnect after a delay
        };
    }

     // --- Helper function to update a card based on WebSocket data ---
     function updateCryptoCard(ticker) {
        // ticker structure example (for symbol@miniTicker):
        // { "e": "24hrMiniTicker", "E": ..., "s": "BTCUSDT", "c": "...", ... }
        const symbolLower = ticker.s.toLowerCase();
        const crypto = allCryptoData.find(c => c.symbol.toLowerCase() === symbolLower);

        if (crypto && crypto.element) { // Check if we are tracking this and have the element ref
            const newPrice = parseFloat(ticker.c); // 'c' is the close/last price
            const priceElement = crypto.element.querySelector('.price');
            const updatedElement = crypto.element.querySelector('.last-updated');

            if(!priceElement || !updatedElement) return; // Element missing

            const formattedPrice = newPrice.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: newPrice < 1 ? 6 : 2
            });

            priceElement.textContent = formattedPrice;
            updatedElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

            // Price flash effect
            const prevPrice = previousPrices[symbolLower];
            if (prevPrice !== undefined) {
                if (newPrice > prevPrice) {
                    flashClass(priceElement, 'price-up');
                } else if (newPrice < prevPrice) {
                    flashClass(priceElement, 'price-down');
                }
            }
            previousPrices[symbolLower] = newPrice; // Store for next comparison
            crypto.price = newPrice; // Update price in our main data array
        }
    }


    // --- 4. Search Functionality ---
    function handleSearch() {
        const searchTerm = searchBox.value.toLowerCase().trim();

        allCryptoData.forEach(crypto => {
            if (!crypto.element) return; // Skip if element doesn't exist

            const nameMatch = crypto.name.toLowerCase().includes(searchTerm);
            const symbolMatch = crypto.symbol.toLowerCase().includes(searchTerm);

            if (nameMatch || symbolMatch) {
                crypto.element.classList.remove('hidden'); // Show card
            } else {
                crypto.element.classList.add('hidden'); // Hide card
            }
        });
    }

    searchBox.addEventListener('input', handleSearch);

    // --- Helper Function for Price Flash ---
    function flashClass(element, className, duration = 500) {
        element.classList.add(className);
        setTimeout(() => {
            element.classList.remove(className);
        }, duration);
    }

    // --- Initial Load ---
    fetchInitialData();

}); // End DOMContentLoaded