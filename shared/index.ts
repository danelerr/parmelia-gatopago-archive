export * from "./EntryPointAbi";
export * from "./networks";
export * from "./errors";
export * from "./paymentAuthorizations";
export * from "./userOperations";

// Contract addresses live per-chain in ./networks (NETWORKS[key].contracts) so the
// app stays portable. Resolve them at runtime with getNetworkConfig(CHAIN_KEY).

// ============================================================
// ABIs (chain-independent - compiled from contracts/out)
// ============================================================

// Historical Worker only. V3 uses its own typed ABI modules and must not import these snapshots.
export { default as accountWebAuthnV2Abi } from "../contracts/legacy/abi/AccountWebAuthnV2.json";
export { default as accountFactoryV2Abi } from "../contracts/legacy/abi/AccountFactoryV2.json";
export { abi as paymentRouterAbi } from "../contracts/out/GatoPagoPaymentRouter.sol/GatoPagoPaymentRouter.json";
export { abi as cctpPaymentRouterAbi } from "../contracts/out/GatoPagoCctpPaymentRouter.sol/GatoPagoCctpPaymentRouter.json";
export { abi as crosschainRouterAbi } from "../contracts/out/GatoPagoCrosschainRouter.sol/GatoPagoCrosschainRouter.json";
export * from "./paymentContracts";
export * from "./fees";

export const erc20Abi = [
	{
		inputs: [{ name: "account", type: "address" }],
		name: "balanceOf",
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		name: "transfer",
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		name: "approve",
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [],
		name: "decimals",
		outputs: [{ name: "", type: "uint8" }],
		stateMutability: "view",
		type: "function",
	},
] as const;
