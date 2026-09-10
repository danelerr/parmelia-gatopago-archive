type WebAuthnSignalApi = {
	signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
};

function signalApi(): WebAuthnSignalApi | null {
	if (typeof PublicKeyCredential === "undefined") return null;
	return PublicKeyCredential as unknown as WebAuthnSignalApi;
}

/** Best effort only, after the user explicitly removes a confirmed passkey. */
export async function signalRemovedPasskey(rpId: string, credentialId: string): Promise<void> {
	const api = signalApi();
	if (!api?.signalUnknownCredential) return;
	await api.signalUnknownCredential({ rpId, credentialId }).catch(() => undefined);
}
