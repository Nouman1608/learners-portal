/**
 * Currency Service
 * Manages exchange rates and currency conversions for online students
 *
 * Note: Teachers are always paid in PKR regardless of student currency
 */

export type CurrencyCode = 'PKR' | 'USD' | 'GBP' | 'SAR';

export interface ExchangeRate {
  code: CurrencyCode;
  name: string;
  symbol: string;
  rateToPKR: number; // How many PKR equals 1 unit of this currency
}

// Exchange rates (these can be updated periodically or moved to database)
const EXCHANGE_RATES: Record<CurrencyCode, ExchangeRate> = {
  PKR: {
    code: 'PKR',
    name: 'Pakistani Rupee',
    symbol: 'Rs',
    rateToPKR: 1,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    rateToPKR: 278, // 1 USD = 278 PKR (approximate, update as needed)
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    rateToPKR: 350, // 1 GBP = 350 PKR (approximate, update as needed)
  },
  SAR: {
    code: 'SAR',
    name: 'Saudi Riyal',
    symbol: 'SR',
    rateToPKR: 74, // 1 SAR = 74 PKR (approximate, update as needed)
  },
};

export const currencyService = {
  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): ExchangeRate[] {
    return Object.values(EXCHANGE_RATES);
  },

  /**
   * Get exchange rate for a specific currency
   */
  getExchangeRate(code: CurrencyCode): ExchangeRate {
    return EXCHANGE_RATES[code];
  },

  /**
   * Convert amount from one currency to another
   */
  convert(amount: number, fromCurrency: CurrencyCode, toCurrency: CurrencyCode): number {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Convert to PKR first, then to target currency
    const amountInPKR = amount * EXCHANGE_RATES[fromCurrency].rateToPKR;
    const convertedAmount = amountInPKR / EXCHANGE_RATES[toCurrency].rateToPKR;

    return Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
  },

  /**
   * Convert amount to PKR (for internal calculations)
   */
  toPKR(amount: number, fromCurrency: CurrencyCode): number {
    return this.convert(amount, fromCurrency, 'PKR');
  },

  /**
   * Convert amount from PKR to target currency
   */
  fromPKR(amount: number, toCurrency: CurrencyCode): number {
    return this.convert(amount, 'PKR', toCurrency);
  },

  /**
   * Format amount with currency symbol
   */
  format(amount: number, currency: CurrencyCode): string {
    const rate = EXCHANGE_RATES[currency];
    const formatted = amount.toFixed(2);

    // For some currencies, symbol goes before, for others after
    if (currency === 'USD' || currency === 'GBP') {
      return `${rate.symbol}${formatted}`;
    } else {
      return `${rate.symbol} ${formatted}`;
    }
  },

  /**
   * Validate currency code
   */
  isValidCurrency(code: string): code is CurrencyCode {
    return code in EXCHANGE_RATES;
  },

  /**
   * Update exchange rate (for future use - can be called from admin panel)
   */
  updateExchangeRate(code: CurrencyCode, newRateToPKR: number): void {
    if (code === 'PKR') {
      throw new Error('Cannot update PKR exchange rate');
    }
    EXCHANGE_RATES[code].rateToPKR = newRateToPKR;
  },
};

export default currencyService;
