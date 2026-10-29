import { AsyncLocalStorage } from 'node:async_hooks';
import { createI18n, systemLocale } from '../i18n.js';

// Each RPC retains its own language across asynchronous work and concurrent clients.
const locales = new AsyncLocalStorage();
const fallback = createI18n(systemLocale(process.env));
export const tr = (key, values) => (locales.getStore() || fallback).t(key, values);
export const withLocale = (locale, work) => locales.run(locale == null ? fallback : createI18n(locale), work);
