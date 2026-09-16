import type { BusinessRuleFn } from './core';
import { validateCalculations } from './calculations';
import { validateFillingRules } from './filling';

export const businessRules: BusinessRuleFn[] = [
  validateCalculations,
  validateFillingRules
];

export * from './core';
