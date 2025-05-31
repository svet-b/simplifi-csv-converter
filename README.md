# Bank Statement to Simplifi CSV Converter

A browser-based tool to convert bank statement CSV files from N26, Wise, and Fortuneo into Simplifi-compatible CSV format. The conversion happens entirely in your browser - no data is sent to any server.

## Features
- Convert CSV bank statements from N26, Wise, and Fortuneo to Simplifi format
- Automatic EUR to USD conversion using real-time exchange rates
- Drag & drop file upload
- No server required - works entirely client-side
- Modern, responsive design
- Secure - your financial data never leaves your browser

## Usage
1. Select your bank from the dropdown (N26, Wise, or Fortuneo)
2. Upload your bank statement CSV file
3. Preview the converted transactions with USD amounts
4. Download the Simplifi-compatible CSV file

## Supported Banks

### N26
- **Input Format**: N26 CSV export with columns including "Booking Date", "Partner Name", "Amount (EUR)"
- **Date Format**: YYYY-MM-DD
- **Amount**: EUR amounts from "Amount (EUR)" column

### Wise
- **Input Format**: Wise transaction history CSV export
- **Date Format**: DD-MM-YYYY  
- **Amount**: EUR transactions only (other currencies are filtered out)
- **Payee**: Uses "Payee Name" or "Payer Name" columns

### Fortuneo
- **Input Format**: Fortuneo bank statement CSV (semicolon-separated)
- **Date Format**: DD/MM/YYYY
- **Amount**: Combines "Débit" and "Crédit" columns
- **Payee**: Extracted from transaction description

## Output Format

### Simplifi CSV
The output CSV contains four columns:
- **Date**: M/D/YYYY format (Simplifi standard)
- **Payee**: Transaction counterpart name
- **Amount**: Amount in USD (converted from EUR using historical exchange rates)
- **Tags**: Empty (can be filled manually in Simplifi)

## Currency Conversion
- All EUR amounts are converted to USD using historical exchange rates for the transaction date
- Exchange rates provided by exchangerate-api.com
- Rates are cached to minimize API calls
- Fallback rate of 1.1 EUR/USD used if API is unavailable

## Local Development
Clone the repository and open `index.html` in your browser to run locally.

## Privacy & Security
- All processing happens client-side in your browser
- No financial data is transmitted to any server
- Exchange rate API only receives dates, not transaction details
- Your bank statements remain completely private
