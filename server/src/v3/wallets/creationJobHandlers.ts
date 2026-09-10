import type { ResourceId } from '../../../../shared/v3/primitives';
import { CreationJobRepository, parseCreationWake, type CreationWake } from './creationJobs';
import { createCreationProcessor, type CreationProcessorConfiguration } from './processCreationJob';

type Bindings = Pick<WalletCoreV3Bindings, 'WALLET_DB' | 'CREATION_QUEUE_NAME'> & {
	readonly CREATION_JOBS: Pick<Queue<CreationWake>, 'send'>;
};
type Resolver = (env: Bindings) => CreationProcessorConfiguration | null;
/** No I/O survives an invocation in module state. Resolving admission is a private
 * composition concern, never a flag, URL or profile accepted from a message. */
export function createCreationJobHandlers(resolve: Resolver) {
	return {
		async wake(env: Bindings, id?: ResourceId<'operation'>) {
			const admitted = resolve(env);
			if (!admitted || !admitted.networks.length) return;
			const processor = createCreationProcessor(admitted), jobs = new CreationJobRepository(env.WALLET_DB, processor.configuration);
			// One bounded sweep per scheduled invocation; no recursive drain loop.
			const ids = id ? [id] : await jobs.due(20);
			let failed = 0;
			for (const next of ids) {
				const message = await jobs.reserve(next);
				if (!message) continue;
				try { await env.CREATION_JOBS.send(message, { contentType: 'json' }); }
				catch { failed++; await jobs.fail(message, 'queued'); }
			}
			if (failed) console.warn({ event: 'v3_creation_enqueue_failed', count: failed });
		},
		async queue(batch: MessageBatch<unknown>, env: Bindings) {
			if (batch.queue !== env.CREATION_QUEUE_NAME) throw new Error('UNEXPECTED_CREATION_QUEUE');
			const admitted = resolve(env);
			if (!admitted || !admitted.networks.length) { batch.ackAll(); return; }
			const processor = createCreationProcessor(admitted), jobs = new CreationJobRepository(env.WALLET_DB, processor.configuration);
			let failed = 0, malformed = 0, review = 0;
			// Deliberately serial within a small batch. max_concurrency bounds the other
			// invocations. D1 and delivery leases still protect overlapping/replayed calls.
			for (const item of batch.messages) {
				let message;
				try { message = parseCreationWake(item.body); }
				catch { malformed++; item.ack(); continue; }
				try {
					if (!await jobs.claim(message)) { item.ack(); continue; }
					const signal = AbortSignal.timeout(120_000);
					try {
						const result = await bounded(processor.run(env.WALLET_DB, message.initialization_id, signal), signal);
						if (await jobs.finish(message, result) && result.state === 'review') review++;
					} catch { failed++; await jobs.fail(message, 'running'); }
					// Durable next_attempt_at, not immediate queue retry, owns normal polling.
					item.ack();
				} catch { failed++; item.retry({ delaySeconds: 60 }); }
			}
			if (failed || malformed || review) console.warn({ event: 'v3_creation_job_attention', failed, malformed, review });
		},
	};
}

function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
		signal.addEventListener('abort', abort, { once: true });
		work.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
			(error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
		if (signal.aborted) abort();
	});
}

// Release admission is still closed, matching HTTP and the independent web pins.
// Real profiles/finality policies/provider identities require Gate A/E1 evidence;
// an existing V1/V2 endpoint or a local fixture must never become the fallback.
export const creationJobHandlers = createCreationJobHandlers(() => null);
