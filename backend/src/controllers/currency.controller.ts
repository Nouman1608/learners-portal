import { Request, Response, NextFunction } from 'express';
import { currencyService } from '../services/currency.service';

export const getSupportedCurrencies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currencies = currencyService.getSupportedCurrencies();
    res.json({ currencies });
  } catch (error) {
    next(error);
  }
};

export const getExchangeRate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;

    if (!currencyService.isValidCurrency(code)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }

    const rate = currencyService.getExchangeRate(code as any);
    res.json({ rate });
  } catch (error) {
    next(error);
  }
};
