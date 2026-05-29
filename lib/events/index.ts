export { emit, type EmitOptions } from "./emit";
export { on, dispatchHandlers, type Handler } from "./dispatch";
export type { Action, EventMetadata, SubjectType } from "./actions";
// Importing the handlers module at the events index ensures handlers register
// at module load time (Next.js will tree-shake them out otherwise).
import "./handlers";
