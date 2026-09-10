import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';

const name = process.env.GATOPAGO_ENVIRONMENT ?? 'staging';
if (name !== 'production' && name !== 'staging') throw new Error('Unknown GatoPago environment');
export const environment = parseEnvironment(environments[name]);
// Public configuration only. No credentials or legacy operational hostname fallbacks.
export const brand = { name: 'GatoPago', siteUrl: environment.web_origin } as const;
