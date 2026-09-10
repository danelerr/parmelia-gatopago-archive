import { describe, expect, it } from "vitest";
import environments from "../../packages/environment/environments.json";
import { apiRouteOwner, assertEnvironmentIsolation, assertProvisioned, parseEnvironment } from "../../packages/environment";

describe("V3 environments and resource routing", () => {
	it("keeps unprovisioned manifests honest and testnet only", () => {
		const staging = parseEnvironment(environments.staging);
		const production = parseEnvironment(environments.production);
		expect(() => assertEnvironmentIsolation(staging, production)).not.toThrow();
		for (const env of [staging, production]) {
			expect(env.wallet_candidates).toHaveLength(3);
			expect(env.wallet_enabled).toEqual([]);
			expect(() => assertProvisioned(env)).toThrow("not provisioned");
		}
	});

	it.each([
		{ webauthn_rp_id: "gatopago.com" },
		{ webauthn_allowed_origins: ["https://gatopago.com"] },
		{ webauthn_allowed_origins: ["https://*.vercel.app"] },
		{ payment_live_enabled: true },
		{ api_modes: ["test", "live"] },
		{ blockchain_tiers: ["mainnet"] },
		{ firebase_project_id: "gatopago-staging", status: "unprovisioned" },
		{ wallet_enabled: ["eip155:84532"] },
		{ unexpected_secret: "must-not-be-here" },
	])("rejects origin, mode and resource confusion %j", (override) => {
		expect(() => parseEnvironment({ ...environments.staging, ...override })).toThrow();
	});

	it("rejects sharing Firebase between remote environments", () => {
		const staging = parseEnvironment({ ...environments.staging, status: "provisioned", firebase_project_id: "gatopago-shared" });
		const production = parseEnvironment({ ...environments.production, status: "provisioned", firebase_project_id: "gatopago-shared" });
		expect(() => assertEnvironmentIsolation(staging, production)).toThrow("not isolated");
	});

	it.each(["wallets", "transfers"])("routes the collection and children of %s to Wallet Core", (resource) => {
		for (const suffix of ["", "/", "/id", "/id/action"]) expect(apiRouteOwner(`/v1/${resource}${suffix}`)).toBe("wallet-core");
	});
	it.each(["organizations", "memberships", "projects", "customers", "settlement_accounts", "payment_links", "payment_intents", "quotes", "events", "webhook_endpoints"])("routes %s to Flow", (resource) => {
		for (const suffix of ["", "/", "/id", "/id/action"]) expect(apiRouteOwner(`/v1/${resource}${suffix}`)).toBe("flow-core");
	});
	it("does not create a catch-all writer or publish future financial products", () => {
		for (const route of ["/v1/unknown", "/v1/walletsFake", "/v1/financial_accounts", "/v1/payouts", "/v1/wallets/../payment_intents", "/v1/%77allets", "//app/v1", "/v1/wallets?tenant=other"]) expect(apiRouteOwner(route)).toBeNull();
		expect(apiRouteOwner("/app/v1/home")).toBe("wallet-core");
		expect(apiRouteOwner("/checkout/v1/link")).toBe("flow-core");
	});
});
