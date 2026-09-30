#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const sharedPaths = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"scripts",
	"shared",
	"packages",
	"contracts",
];

function deploymentPaths(scopes) {
	const values = new Set(sharedPaths);
	for (const scope of scopes) {
		if (!/^(?:gatopago-wallet-core|gatopago-flow|apps\/web)$/u.test(scope)) {
			throw new Error(`Unknown deployment scope: ${scope}`);
		}
		values.add(scope);
	}
	return [...values];
}

export function validateDeploySource(input) {
	const dirty = input.status.trim();
	if (dirty) {
		const entries = dirty.split(/\r?\n/u).filter(Boolean);
		throw new Error(`Refusing deployment: ${entries.length} deploy-relevant file(s) are modified or untracked. Commit and review the exact source first.`);
	}
	if (!/^[0-9a-f]{40}$/u.test(input.head)) throw new Error("Refusing deployment: HEAD is not a full Git commit.");
	return input.head;
}

export function assertReproducibleDeploySource(scopes) {
	const paths = deploymentPaths(scopes);
	const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	return validateDeploySource({
		status: run(["status", "--porcelain=v1", "--untracked-files=all", "--", ...paths]),
		head: run(["rev-parse", "HEAD"]).toLowerCase(),
	});
}

function drill() {
	const commit = "a".repeat(40);
	if (validateDeploySource({ status: "", head: commit }) !== commit) {
		throw new Error("Clean deploy-source fixture was rejected");
	}
	for (const fixture of [
		{ status: " M gatopago-flow/src/index.ts", head: commit, upstream: commit },
		{ status: "?? gatopago-flow/", head: commit, upstream: commit },
		{ status: "", head: "not-a-commit" },
	]) {
		let rejected = false;
		try { validateDeploySource(fixture); } catch { rejected = true; }
		if (!rejected) throw new Error("Unsafe deploy-source fixture was accepted");
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		if (args.length === 1 && args[0] === "--drill") {
			drill();
			process.stdout.write("Reproducible deploy-source guard drill passed.\n");
		} else {
			if (args.length === 0) throw new Error("Usage: assert-reproducible-deploy-source.mjs <gatopago-wallet-core|gatopago-flow|apps/web> [...]");
			const commit = assertReproducibleDeploySource(args);
			process.stdout.write(`Deploy source is clean and committed at ${commit}.\n`);
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
