import app from '../server/planetary-max';
import { CognitiveNodeActor } from '../durableObject';

// Wrangler requires Durable Object classes configured in wrangler.toml to be
// exported from the Worker entrypoint.
export { CognitiveNodeActor };
export default app;
