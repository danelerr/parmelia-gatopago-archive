import { assertEnvironmentIsolation, parseEnvironment, type Environment } from '../../../../packages/environment';
import manifests from '../../../../packages/environment/environments.json';

// A narrow, generated capability set. No legacy DB, signer, queue or Admin key.
export type AuthBindings = Pick<WalletCoreV3Bindings,
  'WALLET_DB' | 'GATOPAGO_ENVIRONMENT' | 'FIREBASE_PROJECT_ID' |
  'FIREBASE_WEB_API_KEY' | 'TURNSTILE_SECRET_KEY' | 'AUTH_RATE_LIMIT_PEPPER'>;

export function configuredEnvironment(env: AuthBindings): Environment {
  assertEnvironmentIsolation(parseEnvironment(manifests.staging), parseEnvironment(manifests.production));
  if (env.GATOPAGO_ENVIRONMENT !== 'staging' && env.GATOPAGO_ENVIRONMENT !== 'production') {
    throw new Error('Unknown V3 environment');
  }
  return parseEnvironment(manifests[env.GATOPAGO_ENVIRONMENT]);
}

export function validateAuthConfig(env: AuthBindings, input: Environment): Environment {
  const config = validateIdentityConfig(env, input);
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(env.FIREBASE_WEB_API_KEY ?? '') ||
      !env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY.trim().length < 20 ||
      /^[123]x0{10}/.test(env.TURNSTILE_SECRET_KEY) ||
      !env.AUTH_RATE_LIMIT_PEPPER || env.AUTH_RATE_LIMIT_PEPPER.trim().length < 32) throw new Error('V3 authentication is not provisioned');
  return config;
}

/** A signed ID-token read does not require email delivery or Turnstile secrets. */
export function validateIdentityConfig(env: AuthBindings, input: Environment): Environment {
  const config = parseEnvironment(input);
  if (config.environment !== env.GATOPAGO_ENVIRONMENT || config.status !== 'provisioned' ||
      !config.firebase_project_id || config.firebase_project_id.startsWith('demo-') ||
      env.FIREBASE_PROJECT_ID !== config.firebase_project_id ||
      !env.WALLET_DB) throw new Error('V3 authentication is not provisioned');
  return config;
}
