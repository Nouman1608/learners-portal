import apiClient from './client';
import { CurrencyCode } from './enrollments.api';

export interface ExchangeRate {
  code: CurrencyCode;
  name: string;
  symbol: string;
  rateToPKR: number;
}

export const currencyApi = {
  getSupportedCurrencies: async (): Promise<ExchangeRate[]> => {
    const response = await apiClient.get<{ currencies: ExchangeRate[] }>('/currencies');
    return response.data.currencies;
  },

  formatAmount: (amount: string | number, currency: CurrencyCode): string => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formatted = numAmount.toFixed(2);

    const symbols: Record<CurrencyCode, string> = {
      PKR: 'Rs',
      USD: '$',
      GBP: '£',
      SAR: 'SR',
    };

    const symbol = symbols[currency];

    // For USD and GBP, symbol goes before
    if (currency === 'USD' || currency === 'GBP') {
      return `${symbol}${formatted}`;
    } else {
      return `${symbol} ${formatted}`;
    }
  },
};

export default currencyApi;
