import { validateEnvironmentShape } from "@gatopago/shared/v3/wire-validators";
import type { NetworkId } from "@gatopago/shared/v3/primitives";

export interface Environment {
	schema_version: 1;
	environment: "staging" | "production";
	status: "unprovisioned" | "provisioned";
	web_origin: string;
	business_origin: string;
	api_origin: string;
	webauthn_rp_id: string;
	webauthn_allowed_origins: string[];
	api_modes: ("test" | "live")[];
	blockchain_tiers: ("testnet" | "mainnet")[];
	wallet_candidates: NetworkId[];
	wallet_enabled: NetworkId[];
	payment_live_enabled: boolean;
	firebase_project_id: string | null;
}

export function parseEnvironment(input: unknown): Environment {
	if (!validateEnvironmentShape(input)) throw new Error("Invalid V3 environment schema");
	const config = input as Environment;
	const root = config.environment === "production" ? "gatopago.com" : "staging.gatopago.com";
	if (config.web_origin !== `https://${root}` || config.webauthn_rp_id !== root ||
		config.api_origin !== `https://api.${root}` || config.business_origin !== `https://business.${root}` ||
		config.webauthn_allowed_origins.length !== 1 || config.webauthn_allowed_origins[0] !== config.web_origin) {
		throw new Error("Environment origins and RP do not match the canonical topology");
	}
	// E0-E4 is explicitly testnet-only, including the production deployment environment.
	if (config.payment_live_enabled || config.api_modes.some((mode) => mode !== "test") || config.blockchain_tiers.some((tier) => tier !== "testnet")) {
		throw new Error("Mainnet/live is not authorized for E0-E4");
	}
	if (config.status === "unprovisioned" && (config.firebase_project_id !== null || config.wallet_enabled.length > 0)) {
		throw new Error("Unprovisioned environment cannot declare working resources");
	}
	if (config.status === "provisioned" && config.firebase_project_id === null) throw new Error("Missing environment Firebase project");
	if (config.wallet_enabled.some((network) => !config.wallet_candidates.includes(network))) throw new Error("Enabled network was not a candidate");
	return structuredClone(config);
}

export function assertEnvironmentIsolation(staging: Environment, production: Environment): void {
	const a = parseEnvironment(staging);
	const b = parseEnvironment(production);
	if (a.environment !== "staging" || b.environment !== "production") throw new Error("Incorrect environment pair");
	if (a.firebase_project_id !== null && a.firebase_project_id === b.firebase_project_id) throw new Error("Firebase projects are not isolated");
}

export function assertProvisioned(config: Environment): void {
	if (parseEnvironment(config).status !== "provisioned") throw new Error("V3 environment is not provisioned");
}

const flowCollections = new Set([
	"organizations", "memberships", "projects", "customers", "settlement_accounts",
	"payment_links", "payment_intents", "quotes", "events", "webhook_endpoints",
]);
const walletCollections = new Set(["wallets", "transfers"]);

/** Collection and descendants share an owner. Unknown paths never fall through to a writer. */
export function apiRouteOwner(path: string): "wallet-core" | "flow-core" | null {
	if (!path.startsWith("/") || /[?#%\\]/.test(path) || path.includes("//") || path.split("/").some((s) => s === "." || s === "..")) return null;
	const parts = path.split("/");
	if (parts[1] === "app" && parts[2] === "v1") return "wallet-core";
	if (parts[1] === "checkout" && parts[2] === "v1") return "flow-core";
	if (parts[1] !== "v1") return null;
	if (flowCollections.has(parts[2])) return "flow-core";
	if (walletCollections.has(parts[2])) return "wallet-core";
	return null;
}
