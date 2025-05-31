document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const bankSelector = document.getElementById('bankSelector');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const selectedBank = document.getElementById('selectedBank');
    const convertButton = document.getElementById('convertButton');
    const previewSection = document.getElementById('previewSection');
    const previewBody = document.getElementById('previewBody');
    const totalAmountEUR = document.getElementById('totalAmountEUR');
    const totalAmountUSD = document.getElementById('totalAmountUSD');

    let currentFileContent = null;
    let currentBankType = null;
    let parsedTransactions = [];
    let exchangeRates = {};

    // Exchange rate cache to avoid multiple API calls for the same date
    const exchangeRateCache = new Map();

    // Bank-specific CSV parsers
    const bankParsers = {
        n26: {
            name: 'N26',
            parseCSV: (csvContent) => {
                const lines = csvContent.split('\n');
                const header = lines[0];
                
                // Verify N26 format by checking for specific columns
                if (!header.includes('Booking Date') || !header.includes('Partner Name') || !header.includes('Amount (EUR)')) {
                    throw new Error('This doesn\'t appear to be an N26 CSV file. Please check the file format.');
                }

                const transactions = [];
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const row = parseCSVRow(line);
                    if (row.length < 8) continue;

                    // Clean up the values by removing quotes if present
                    const cleanValue = (val) => val?.replace(/^"(.*)"$/, '$1') || '';

                    const transaction = {
                        date: cleanValue(row[0]), // Booking Date (YYYY-MM-DD)
                        payee: cleanValue(row[2]), // Partner Name
                        amount: parseFloat(cleanValue(row[7])), // Amount (EUR)
                        reference: cleanValue(row[5]) // Payment Reference
                    };

                    if (!isNaN(transaction.amount) && transaction.payee) {
                        transactions.push(transaction);
                    }
                }
                return transactions;
            }
        },
        wise: {
            name: 'Wise',
            parseCSV: (csvContent) => {
                const lines = csvContent.split('\n');
                const header = lines[0];
                
                // Verify Wise format
                if (!header.includes('Date') || !header.includes('Amount') || !header.includes('Currency')) {
                    throw new Error('This doesn\'t appear to be a Wise CSV file. Please check the file format.');
                }

                const transactions = [];
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const row = parseCSVRow(line);
                    if (row.length < 20) continue;

                    // Clean up the values by removing quotes if present
                    const cleanValue = (val) => val?.replace(/^"(.*)"$/, '$1') || '';

                    // Only process EUR transactions
                    const currency = cleanValue(row[3]);
                    if (currency !== 'EUR') continue;

                    const payeeName = cleanValue(row[11]) || cleanValue(row[10]); // Payee Name or Payer Name
                    const description = cleanValue(row[4]); // Description
                    
                    const transaction = {
                        date: cleanValue(row[1]), // Date (DD-MM-YYYY)
                        payee: payeeName || description,
                        amount: parseFloat(cleanValue(row[2])), // Amount
                        reference: description
                    };

                    if (!isNaN(transaction.amount) && transaction.payee) {
                        transactions.push(transaction);
                    }
                }
                return transactions;
            }
        },
        fortuneo: {
            name: 'Fortuneo',
            parseCSV: (csvContent) => {
                const lines = csvContent.split('\n');
                const header = lines[0];
                
                // Verify Fortuneo format (uses semicolons and has French headers with accented characters)
                // Check for key parts of the header that should be present
                if (!header.includes('Date op') || !header.includes('bit') || !header.includes('dit')) {
                    throw new Error('This doesn\'t appear to be a Fortuneo CSV file. Please check the file format.');
                }

                const transactions = [];
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const row = line.split(';');
                    if (row.length < 5) continue;

                    const debit = row[3] ? parseFloat(row[3].replace(',', '.')) : 0;
                    const credit = row[4] ? parseFloat(row[4].replace(',', '.')) : 0;
                    const amount = credit || -Math.abs(debit);

                    const transaction = {
                        date: row[0], // Date opération (DD/MM/YYYY)
                        payee: row[2], // Extract from libellé
                        amount: amount,
                        reference: row[2] // Full libellé as reference
                    };

                    if (!isNaN(transaction.amount) && transaction.payee) {
                        transactions.push(transaction);
                    }
                }
                return transactions;
            }
        }
    };

    // Helper function to parse CSV rows with proper quote handling
    function parseCSVRow(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote within quoted field
                    current += '"';
                    i += 2; // Skip both quotes
                    continue;
                } else {
                    // Start or end of quoted field
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator outside quotes
                result.push(current);
                current = '';
            } else {
                current += char;
            }
            i++;
        }
        
        // Add the last field
        result.push(current);
        
        return result;
    }
    // Extract payee name from Fortuneo description
    function extractPayeeFromFortuneoDescription(description) {
        return description.trim();
    }

    // Convert date to Simplifi format (M/D/YYYY)
    function convertDateToSimplifi(dateStr, bankType) {
        let date;
        
        switch (bankType) {
            case 'n26':
                // N26: YYYY-MM-DD
                date = new Date(dateStr);
                break;
            case 'wise':
                // Wise: DD-MM-YYYY
                const [day, month, year] = dateStr.split('-');
                date = new Date(year, month - 1, day);
                break;
            case 'fortuneo':
                // Fortuneo: DD/MM/YYYY
                const [d, m, y] = dateStr.split('/');
                date = new Date(y, m - 1, d);
                break;
        }
        
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    }

    // Get exchange rate for a specific date
    async function getExchangeRate(date) {
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        if (exchangeRateCache.has(dateKey)) {
            return exchangeRateCache.get(dateKey);
        }

        try {
            // Use a more reliable exchange rate API endpoint
            const response = await fetch(`https://api.exchangerate-api.com/v4/historical/EUR/${dateKey}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            
            if (!data.rates || !data.rates.USD) {
                throw new Error('Invalid API response format');
            }
            
            const rate = data.rates.USD;
            exchangeRateCache.set(dateKey, rate);
            return rate;
        } catch (error) {
            console.warn(`Could not fetch exchange rate for ${dateKey}: ${error.message}`);
            
            // Try to get a current rate as fallback
            try {
                const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
                if (response.ok) {
                    const data = await response.json();
                    if (data.rates && data.rates.USD) {
                        const fallbackRate = data.rates.USD;
                        console.warn(`Using current EUR/USD rate (${fallbackRate}) for ${dateKey}`);
                        exchangeRateCache.set(dateKey, fallbackRate);
                        return fallbackRate;
                    }
                }
            } catch (fallbackError) {
                console.warn(`Fallback exchange rate request also failed: ${fallbackError.message}`);
            }
            
            // Final fallback to a reasonable EUR/USD rate
            const finalFallbackRate = 1.1;
            console.warn(`Using hardcoded fallback rate (${finalFallbackRate}) for ${dateKey}`);
            exchangeRateCache.set(dateKey, finalFallbackRate);
            return finalFallbackRate;
        }
    }

    // Event listeners
    bankSelector.addEventListener('change', updateUI);
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        handleFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });

    convertButton.addEventListener('click', convertToSimplifiCSV);

    function updateUI() {
        const bankType = bankSelector.value;
        const hasFile = currentFileContent !== null;
        
        convertButton.disabled = !bankType || !hasFile;
        
        if (bankType) {
            selectedBank.textContent = bankParsers[bankType].name;
        } else {
            selectedBank.textContent = 'None';
        }
    }

    function handleFile(file) {
        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            fileName.textContent = file.name;
            fileInfo.classList.remove('hidden');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                currentFileContent = e.target.result;
                updateUI();
                generatePreview();
            };
            
            // Try to read as UTF-8 first, but if it fails, we'll handle it in the parser
            reader.readAsText(file, 'UTF-8');
        } else {
            alert('Please upload a valid CSV file');
        }
    }

    async function generatePreview() {
        const bankType = bankSelector.value;
        
        if (!bankType || !currentFileContent) {
            return;
        }

        try {
            const parser = bankParsers[bankType];
            parsedTransactions = parser.parseCSV(currentFileContent);
            
            if (parsedTransactions.length === 0) {
                alert('No transactions found in the file. Please check the file format.');
                return;
            }

            // Clear existing preview
            previewBody.innerHTML = '';
            
            let totalEUR = 0;
            let totalUSD = 0;
            
            // Show only first 10 transactions in preview
            const previewTransactions = parsedTransactions.slice(0, 10);
            
            for (const transaction of previewTransactions) {
                totalEUR += transaction.amount;
                
                // Get exchange rate for this transaction's date
                const transactionDate = parseDateFromTransaction(transaction, bankType);
                const exchangeRate = await getExchangeRate(transactionDate);
                const amountUSD = transaction.amount * exchangeRate;
                totalUSD += amountUSD;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${convertDateToSimplifi(transaction.date, bankType)}</td>
                    <td>${escapeHtml(transaction.payee)}</td>
                    <td>${transaction.amount.toFixed(2)} EUR</td>
                    <td>${amountUSD.toFixed(2)} USD</td>
                `;
                previewBody.appendChild(row);
            }

            totalAmountEUR.textContent = `${totalEUR.toFixed(2)} EUR`;
            totalAmountUSD.textContent = `${totalUSD.toFixed(2)} USD`;
            previewSection.classList.remove('hidden');
            convertButton.disabled = false;

        } catch (error) {
            console.error('Error processing file:', error);
            alert(`Error processing the file: ${error.message}`);
        }
    }

    function parseDateFromTransaction(transaction, bankType) {
        switch (bankType) {
            case 'n26':
                return new Date(transaction.date);
            case 'wise':
                const [day, month, year] = transaction.date.split('-');
                return new Date(year, month - 1, day);
            case 'fortuneo':
                const [d, m, y] = transaction.date.split('/');
                return new Date(y, m - 1, d);
        }
    }

    async function convertToSimplifiCSV() {
        if (!currentFileContent || !bankSelector.value) {
            alert('Please select a bank and upload a file first');
            return;
        }

        try {
            const csvRows = ['"Date","Payee","Amount","Tags"']; // Simplifi header
            
            convertButton.disabled = true;
            convertButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Converting...';
            
            for (const transaction of parsedTransactions) {
                const simplifiDate = convertDateToSimplifi(transaction.date, bankSelector.value);
                const transactionDate = parseDateFromTransaction(transaction, bankSelector.value);
                const exchangeRate = await getExchangeRate(transactionDate);
                const amountUSD = transaction.amount * exchangeRate;
                
                const row = [
                    `"${simplifiDate}"`,
                    `"${escapeCSV(transaction.payee)}"`,
                    `"${amountUSD.toFixed(2)}"`,
                    '""' // Empty tags
                ].join(',');
                
                csvRows.push(row);
            }

            // Create and trigger download
            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const originalFileName = fileName.textContent.replace(/\.[^/.]+$/, '');
            a.setAttribute('href', url);
            a.setAttribute('download', `${originalFileName}-simplifi.csv`);
            a.click();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error converting file:', error);
            alert(`Error converting the file: ${error.message}`);
        } finally {
            convertButton.disabled = false;
            convertButton.innerHTML = '<i class="bi bi-download me-2"></i>Download Simplifi CSV';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeCSV(text) {
        if (text.includes('"')) {
            return text.replace(/"/g, '""');
        }
        return text;
    }
}); 
